import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { ICoreApi } from 'azure-devops-node-api/CoreApi';
import pLimit from 'p-limit';
import { deriveSearchTerms } from '../comparison/component-matcher.js';

export interface AdoProject {
  id: string;
  name: string;
  description: string;
}

export interface AdoRepo {
  id: string;
  name: string;
  project: string;
}

export interface CraftPR {
  pullRequestId: number;
  title: string;
  description: string;
  createdBy: string;
  creationDate: string;
  sourceRefName: string;
  repositoryId: string;
  repositoryName: string;
  project: string;
  uiFiles: string[];
  componentNames: string[];
}

const UI_EXTENSIONS = ['.tsx', '.jsx', '.css', '.scss', '.less', '.styles.ts', '.styles.tsx'];

function isUiFile(path: string): boolean {
  return UI_EXTENSIONS.some(ext => path.endsWith(ext));
}

export class DiscoveryService {
  private orgUrl: string;
  private token: string;
  private connection: azdev.WebApi | null = null;

  constructor(orgUrl: string, token: string) {
    this.orgUrl = orgUrl;
    this.token = token;
  }

  private getConnection(): azdev.WebApi {
    if (!this.connection) {
      const authHandler = azdev.getPersonalAccessTokenHandler(this.token);
      this.connection = new azdev.WebApi(this.orgUrl, authHandler, { socketTimeout: 60_000 });
    }
    return this.connection;
  }

  private async getGitApi(): Promise<IGitApi> {
    return this.getConnection().getGitApi();
  }

  private async getCoreApi(): Promise<ICoreApi> {
    return this.getConnection().getCoreApi();
  }

  async getProjects(): Promise<AdoProject[]> {
    const coreApi = await this.getCoreApi();
    const projects = await coreApi.getProjects();
    return projects.map(p => ({
      id: p.id!,
      name: p.name!,
      description: p.description ?? '',
    }));
  }

  async getRepositories(project: string): Promise<AdoRepo[]> {
    const gitApi = await this.getGitApi();
    const repos = await gitApi.getRepositories(project);
    return repos.map(r => ({
      id: r.id!,
      name: r.name!,
      project,
    }));
  }

  async getRecentPRs(
    project: string,
    repoId: string,
    opts?: { maxAgeDays?: number; top?: number }
  ): Promise<any[]> {
    const gitApi = await this.getGitApi();
    const maxAgeDays = opts?.maxAgeDays ?? 30;
    const top = opts?.top ?? 50;

    const minTime = new Date();
    minTime.setDate(minTime.getDate() - maxAgeDays);

    // Fetch both active (status 1) and completed (status 3) PRs
    const [activePRs, completedPRs] = await Promise.all([
      gitApi.getPullRequests(
        repoId,
        { status: 1 /* active */, minTime } as any,
        project,
        undefined,
        0,
        top
      ),
      gitApi.getPullRequests(
        repoId,
        { status: 3 /* completed */, minTime } as any,
        project,
        undefined,
        0,
        top
      ),
    ]);

    // Deduplicate by PR ID
    const seen = new Set<number>();
    const combined: any[] = [];
    for (const pr of [...activePRs, ...completedPRs]) {
      if (pr.pullRequestId && !seen.has(pr.pullRequestId)) {
        seen.add(pr.pullRequestId);
        combined.push(pr);
      }
    }
    return combined;
  }

  async getCraftPRs(
    project: string,
    repoId?: string,
    opts?: { maxAgeDays?: number; top?: number }
  ): Promise<CraftPR[]> {
    const gitApi = await this.getGitApi();
    const limit = pLimit(5);

    // If no repoId, get all repos for the project
    let repoIds: Array<{ id: string; name: string }>;
    if (repoId) {
      const repos = await this.getRepositories(project);
      const repo = repos.find(r => r.id === repoId);
      repoIds = [{ id: repoId, name: repo?.name || repoId }];
    } else {
      const repos = await this.getRepositories(project);
      repoIds = repos.map(r => ({ id: r.id, name: r.name }));
    }

    const craftPRs: CraftPR[] = [];

    await Promise.all(
      repoIds.map(repo =>
        limit(async () => {
          try {
            const prs = await this.getRecentPRs(project, repo.id, opts);

            await Promise.all(
              prs.map(pr =>
                limit(async () => {
                  try {
                    const uiFiles = await this.getUiFilesForPR(
                      gitApi,
                      repo.id,
                      pr.pullRequestId!,
                      project
                    );
                    if (uiFiles.length === 0) return;

                    // Derive component names from file paths + file basenames
                    const componentNames = [
                      ...new Set(
                        uiFiles.flatMap(f => {
                          const terms = deriveSearchTerms(f, '');
                          // Also extract the file basename (without extension) and split CamelCase
                          const basename = f.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
                          if (basename.length > 1) {
                            terms.push(basename); // full name e.g. "ChatInput"
                            const camelParts = basename.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]+/);
                            for (const w of camelParts) {
                              if (w.length > 1) terms.push(w.toLowerCase());
                            }
                          }
                          return terms;
                        })
                      ),
                    ];

                    craftPRs.push({
                      pullRequestId: pr.pullRequestId!,
                      title: pr.title ?? '',
                      description: pr.description ?? '',
                      createdBy: pr.createdBy?.displayName ?? '',
                      creationDate: pr.creationDate?.toISOString() ?? '',
                      sourceRefName: pr.sourceRefName ?? '',
                      repositoryId: repo.id,
                      repositoryName: repo.name,
                      project,
                      uiFiles,
                      componentNames,
                    });
                  } catch {
                    // Skip PRs we can't inspect
                  }
                })
              )
            );
          } catch {
            // Skip repos we can't access
          }
        })
      )
    );

    return craftPRs;
  }

  private async getUiFilesForPR(
    gitApi: IGitApi,
    repoId: string,
    pullRequestId: number,
    project: string
  ): Promise<string[]> {
    const iterations = await gitApi.getPullRequestIterations(
      repoId,
      pullRequestId,
      project
    );

    if (!iterations || iterations.length === 0) return [];

    const latestIteration = iterations[iterations.length - 1];
    const changes = await gitApi.getPullRequestIterationChanges(
      repoId,
      pullRequestId,
      latestIteration.id!,
      project
    );

    const uiFiles: string[] = [];
    for (const change of changes.changeEntries ?? []) {
      const filePath = change.item?.path ?? '';
      if (filePath && isUiFile(filePath)) {
        uiFiles.push(filePath);
      }
    }

    return uiFiles;
  }

  async discoverAllCraftPRs(
    projects: string[],
    opts?: { maxAgeDays?: number; top?: number }
  ): Promise<CraftPR[]> {
    const limit = pLimit(3);
    const allCraftPRs: CraftPR[] = [];

    await Promise.all(
      projects.map(project =>
        limit(async () => {
          const prs = await this.getCraftPRs(project, undefined, opts);
          allCraftPRs.push(...prs);
        })
      )
    );

    return allCraftPRs;
  }
}
