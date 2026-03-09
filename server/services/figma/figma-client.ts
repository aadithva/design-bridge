import axios, { AxiosInstance } from 'axios';
import pLimit from 'p-limit';
import { FigmaFileResponse, FigmaImageResponse, FigmaProjectInfo, FigmaFileInfo, FigmaFileSearchResult } from './types.js';

const FIGMA_API_BASE = 'https://api.figma.com/v1';

export class FigmaClient {
  private http: AxiosInstance;

  constructor(apiToken: string) {
    this.http = axios.create({
      baseURL: FIGMA_API_BASE,
      headers: { 'X-Figma-Token': apiToken },
      timeout: 120_000,
    });

    // Surface Figma API error details instead of generic Axios messages
    this.http.interceptors.response.use(
      res => res,
      (err) => {
        if (err.response) {
          const data = err.response.data;
          const detail = typeof data === 'string' ? data
            : data?.err || data?.message || data?.error || JSON.stringify(data);
          const wrapped = new Error(`Figma API ${err.response.status}: ${detail}`);
          // Preserve status and code for retry logic in getAllTeamFiles
          (wrapped as any).response = { status: err.response.status };
          (wrapped as any).code = err.code;
          throw wrapped;
        }
        throw err; // network error, timeout, etc. — keep original
      },
    );
  }

  /** Get file metadata — uses depth param to avoid fetching entire tree */
  async getFile(fileKey: string, depth?: number): Promise<FigmaFileResponse> {
    const params: Record<string, any> = {};
    if (depth !== undefined) params.depth = depth;
    const { data } = await this.http.get<FigmaFileResponse>(`/files/${fileKey}`, { params });
    return data;
  }

  /** Get a specific subtree by node ID — much faster for large files */
  async getFileNodes(fileKey: string, nodeIds: string[]): Promise<any> {
    const { data } = await this.http.get(`/files/${fileKey}/nodes`, {
      params: { ids: nodeIds.join(',') },
    });
    return data;
  }

  /** Export node IDs as PNG images at the given scale */
  async exportImages(
    fileKey: string,
    nodeIds: string[],
    scale: number = 2,
    format: 'png' | 'svg' | 'jpg' = 'png'
  ): Promise<FigmaImageResponse> {
    const { data } = await this.http.get<FigmaImageResponse>(`/images/${fileKey}`, {
      params: {
        ids: nodeIds.join(','),
        scale,
        format,
      },
    });
    return data;
  }

  /** Download an image from a Figma-hosted URL */
  async downloadImage(url: string): Promise<Buffer> {
    const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 60_000 });
    return Buffer.from(data);
  }

  /** Get current user info */
  async getMe(): Promise<{ id: string; handle: string; email: string }> {
    const { data } = await this.http.get('/me');
    return data;
  }

  /** List projects in a team */
  async getTeamProjects(teamId: string): Promise<{ projects: FigmaProjectInfo[] }> {
    const { data } = await this.http.get(`/teams/${teamId}/projects`);
    return data;
  }

  /** List files in a project */
  async getProjectFiles(projectId: number): Promise<{ files: FigmaFileInfo[] }> {
    const { data } = await this.http.get(`/projects/${projectId}/files`);
    return data;
  }

  /** Get ALL files across all projects in a team (no query filtering) */
  async getAllTeamFiles(teamId: string): Promise<FigmaFileSearchResult[]> {
    const { projects } = await this.getTeamProjects(teamId);

    const limit = pLimit(3);
    const filesByProject = await Promise.all(
      projects.map((project) =>
        limit(async () => {
          // Retry up to 2 times for transient failures (rate limits, timeouts)
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const { files } = await this.getProjectFiles(project.id);
              return files.map((f) => ({
                fileKey: f.key,
                name: f.name,
                projectName: project.name,
                projectId: project.id,
                figmaUrl: `https://www.figma.com/design/${f.key}`,
                thumbnailUrl: f.thumbnail_url,
                lastModified: f.last_modified,
                relevanceScore: 0,
              } as FigmaFileSearchResult));
            } catch (err: any) {
              const status = err?.response?.status;
              if (status === 429 || status >= 500 || err?.code === 'ECONNRESET') {
                // Back off before retry: 1s, 3s
                await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
                continue;
              }
              console.warn(`Failed to load files for project "${project.name}" (${project.id}): ${err.message}`);
              return [];
            }
          }
          console.warn(`All retries failed for project "${project.name}" (${project.id})`);
          return [];
        })
      )
    );

    return filesByProject.flat();
  }

  /**
   * Search for Figma files by name across all projects in a team.
   * Enumerates projects → files, then filters by query match.
   */
  async searchFiles(teamId: string, query: string, maxResults = 10): Promise<FigmaFileSearchResult[]> {
    const { projects } = await this.getTeamProjects(teamId);

    const limit = pLimit(5);
    const filesByProject = await Promise.all(
      projects.map((project) =>
        limit(async () => {
          try {
            const { files } = await this.getProjectFiles(project.id);
            return files.map((f) => ({ ...f, projectName: project.name, projectId: project.id }));
          } catch {
            return [];
          }
        })
      )
    );

    const allFiles = filesByProject.flat();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const scored = allFiles
      .map((f) => {
        const nameLower = f.name.toLowerCase();
        let score = 0;

        // Exact match
        if (nameLower === queryLower) score += 100;
        // Contains full query
        else if (nameLower.includes(queryLower)) score += 50;
        // Word-level matching
        else {
          const matchedWords = queryWords.filter((w) => nameLower.includes(w));
          score += matchedWords.length * (20 / queryWords.length);
        }

        if (score === 0) return null;

        return {
          fileKey: f.key,
          name: f.name,
          projectName: f.projectName,
          projectId: f.projectId,
          figmaUrl: `https://www.figma.com/design/${f.key}`,
          thumbnailUrl: f.thumbnail_url,
          lastModified: f.last_modified,
          relevanceScore: score,
        } as FigmaFileSearchResult;
      })
      .filter((r): r is FigmaFileSearchResult => r !== null);

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored.slice(0, maxResults);
  }
}
