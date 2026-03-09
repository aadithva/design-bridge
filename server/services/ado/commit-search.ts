import axios from 'axios';
import * as azdev from 'azure-devops-node-api';

export interface CommitSearchResult {
  commitId: string;
  comment: string;
  authorName: string;
  repositoryName: string;
  repositoryId: string;
  project: string;
}

export class CommitSearchService {
  private orgUrl: string;
  private token: string;

  constructor(orgUrl: string, token: string) {
    this.orgUrl = orgUrl;
    this.token = token;
  }

  /**
   * Search ADO commits by message text using the ADO Search REST API.
   * The azure-devops-node-api doesn't have a built-in SearchApi,
   * so we call almsearch.dev.azure.com directly with axios.
   */
  async searchCommits(
    searchText: string,
    project: string,
    options?: { repoName?: string; top?: number },
  ): Promise<CommitSearchResult[]> {
    // Extract org name from orgUrl (e.g. "https://dev.azure.com/office" → "office")
    const orgMatch = this.orgUrl.match(/dev\.azure\.com\/([^/]+)/);
    if (!orgMatch) throw new Error(`Cannot parse org from URL: ${this.orgUrl}`);
    const org = orgMatch[1];

    const url = `https://almsearch.dev.azure.com/${org}/${project}/_apis/search/commitSearchResults?api-version=7.0`;
    const auth = Buffer.from(':' + this.token).toString('base64');

    const filters: Record<string, string[]> = {
      Project: [project],
    };
    if (options?.repoName) {
      filters.Repository = [options.repoName];
    }

    const body = {
      searchText,
      $top: options?.top ?? 50,
      filters,
    };

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    const results: CommitSearchResult[] = [];
    for (const item of response.data?.results ?? []) {
      results.push({
        commitId: item.commitId ?? item.collection?.commitId ?? '',
        comment: item.comment ?? '',
        authorName: item.author?.name ?? item.authorName ?? '',
        repositoryName: item.repository?.name ?? item.repositoryName ?? '',
        repositoryId: item.repository?.id ?? item.repositoryId ?? '',
        project: item.project?.name ?? project,
      });
    }
    return results;
  }

  /**
   * Map commit SHAs to PR IDs using gitApi.getPullRequestQuery().
   * Returns a Set of PR IDs that contain any of the given commits.
   */
  async findPRIdsForCommits(
    commitIds: string[],
    repoId: string,
    project: string,
  ): Promise<Set<number>> {
    if (commitIds.length === 0) return new Set();

    const authHandler = azdev.getPersonalAccessTokenHandler(this.token);
    const connection = new azdev.WebApi(this.orgUrl, authHandler);
    const gitApi = await connection.getGitApi();

    const query = {
      type: 1, // commit
      commits: commitIds.map(id => ({ commitId: id })),
    } as any;

    const prIds = new Set<number>();

    try {
      const result = await gitApi.getPullRequestQuery(
        { queries: [query] },
        repoId,
        project,
      );
      if (result.results) {
        for (const resultMap of result.results) {
          for (const prs of Object.values(resultMap)) {
            if (Array.isArray(prs)) {
              for (const pr of prs) {
                if (pr.pullRequestId) prIds.add(pr.pullRequestId);
              }
            }
          }
        }
      }
    } catch (err) {
      // Non-fatal: if commit→PR resolution fails, return what we have
      console.warn('findPRIdsForCommits: query failed, returning partial results', err);
    }

    return prIds;
  }
}
