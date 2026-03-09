import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';

export interface PrInfo {
  pullRequestId: number;
  description: string;
  title: string;
  repositoryId: string;
  projectName: string;
}

export interface PrDiff {
  changes: PrFileChange[];
}

export interface PrFileChange {
  path: string;
  content: string;
  changeType: 'add' | 'edit' | 'delete';
}

export interface PrFullFile {
  path: string;
  content: string;
  changeType: 'add' | 'edit' | 'delete';
}

function getConnection(orgUrl: string, token: string): azdev.WebApi {
  const authHandler = azdev.getPersonalAccessTokenHandler(token);
  return new azdev.WebApi(orgUrl, authHandler);
}

export class PrFetcher {
  private orgUrl: string;
  private token: string;

  constructor(orgUrl: string, token: string) {
    this.orgUrl = orgUrl;
    this.token = token;
  }

  private async getGitApi(): Promise<IGitApi> {
    const connection = getConnection(this.orgUrl, this.token);
    return connection.getGitApi();
  }

  async getPrInfo(
    repositoryId: string,
    pullRequestId: number,
    project: string
  ): Promise<PrInfo> {
    const gitApi = await this.getGitApi();
    const pr = await gitApi.getPullRequest(repositoryId, pullRequestId, project);

    return {
      pullRequestId: pr.pullRequestId!,
      description: pr.description ?? '',
      title: pr.title ?? '',
      repositoryId: pr.repository?.id ?? repositoryId,
      projectName: pr.repository?.project?.name ?? project,
    };
  }

  async getPrDiff(
    repositoryId: string,
    pullRequestId: number,
    project: string
  ): Promise<string> {
    const gitApi = await this.getGitApi();

    // Get PR info to find source branch commit
    const pr = await gitApi.getPullRequest(repositoryId, pullRequestId, project);
    const sourceCommit = pr.lastMergeSourceCommit?.commitId;
    const targetCommit = pr.lastMergeTargetCommit?.commitId;

    // Get the iterations (each push to the PR)
    const iterations = await gitApi.getPullRequestIterations(
      repositoryId,
      pullRequestId,
      project
    );

    if (!iterations || iterations.length === 0) {
      return '';
    }

    // Get changes from the latest iteration
    const latestIteration = iterations[iterations.length - 1];
    const changes = await gitApi.getPullRequestIterationChanges(
      repositoryId,
      pullRequestId,
      latestIteration.id!,
      project
    );

    // UI-relevant file extensions
    const uiExtensions = ['.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.less', '.styles.ts', '.styles.tsx'];
    const isUiFile = (path: string) => uiExtensions.some(ext => path.endsWith(ext));

    // Build unified diff by fetching actual file content for UI files
    const diffParts: string[] = [];
    for (const change of changes.changeEntries ?? []) {
      const path = change.item?.path ?? '';
      if (!path || !isUiFile(path)) continue;

      const changeType = change.changeType ?? 0;
      // changeType: 1=add, 2=edit, 16=delete
      const typeStr = changeType === 1 ? 'add' : changeType === 2 ? 'edit' : changeType === 16 ? 'delete' : 'unknown';

      if (changeType === 16) {
        diffParts.push(`diff --git a${path} b${path}`);
        diffParts.push(`--- a${path}`);
        diffParts.push(`+++ /dev/null`);
        continue;
      }

      // Fetch file content from the source branch
      try {
        const versionDescriptor = sourceCommit
          ? { version: sourceCommit, versionType: 2 /* GitVersionType.Commit */ } as any
          : undefined;

        // Use getItemText which returns the content directly as a readable stream
        const contentStream = await gitApi.getItemContent(
          repositoryId,
          path,
          project,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          versionDescriptor
        );

        // Collect stream data — handle both Node.js streams and raw buffers
        let fileContent: string;
        if (contentStream && typeof (contentStream as any).on === 'function') {
          // It's a readable stream
          fileContent = await new Promise<string>((resolve, reject) => {
            const chunks: Buffer[] = [];
            const stream = contentStream as NodeJS.ReadableStream;
            stream.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            stream.on('error', reject);
            // Safety timeout
            setTimeout(() => reject(new Error('Stream read timeout after 30s')), 30000);
          });
        } else if (Buffer.isBuffer(contentStream)) {
          fileContent = contentStream.toString('utf-8');
        } else if (typeof contentStream === 'string') {
          fileContent = contentStream;
        } else {
          fileContent = String(contentStream);
        }

        // Build a unified diff-like format the parser can handle
        const lines = fileContent.split('\n');
        diffParts.push(`diff --git a${path} b${path}`);
        if (changeType === 1) {
          diffParts.push(`new file mode 100644`);
          diffParts.push(`--- /dev/null`);
        } else {
          diffParts.push(`--- a${path}`);
        }
        diffParts.push(`+++ b${path}`);
        diffParts.push(`@@ -0,0 +1,${lines.length} @@`);
        for (const line of lines) {
          diffParts.push(`+${line}`);
        }
      } catch (err: any) {
        diffParts.push(`diff --git a${path} b${path}`);
        diffParts.push(`--- a${path}`);
        diffParts.push(`+++ b${path}`);
        diffParts.push(`@@ -0,0 +1,1 @@`);
        diffParts.push(`+// [Could not fetch content: ${err.message?.substring(0, 80)}]`);
      }
    }

    return diffParts.join('\n');
  }

  async getFileContent(
    repositoryId: string,
    pullRequestId: number,
    filePath: string,
    project: string
  ): Promise<string> {
    const gitApi = await this.getGitApi();
    const pr = await gitApi.getPullRequest(repositoryId, pullRequestId, project);
    const sourceCommit = pr.lastMergeSourceCommit?.commitId;

    const versionDescriptor = sourceCommit
      ? { version: sourceCommit, versionType: 2 /* GitVersionType.Commit */ } as any
      : undefined;

    const contentStream = await gitApi.getItemContent(
      repositoryId,
      filePath,
      project,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      versionDescriptor
    );

    if (contentStream && typeof (contentStream as any).on === 'function') {
      return new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = contentStream as NodeJS.ReadableStream;
        stream.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
        setTimeout(() => reject(new Error('Stream read timeout after 30s')), 30000);
      });
    } else if (Buffer.isBuffer(contentStream)) {
      return contentStream.toString('utf-8');
    } else if (typeof contentStream === 'string') {
      return contentStream;
    }
    return String(contentStream);
  }

  async getPrFullFiles(
    repositoryId: string,
    pullRequestId: number,
    project: string
  ): Promise<PrFullFile[]> {
    const gitApi = await this.getGitApi();

    const iterations = await gitApi.getPullRequestIterations(
      repositoryId,
      pullRequestId,
      project
    );

    if (!iterations || iterations.length === 0) {
      return [];
    }

    const latestIteration = iterations[iterations.length - 1];
    const changes = await gitApi.getPullRequestIterationChanges(
      repositoryId,
      pullRequestId,
      latestIteration.id!,
      project
    );

    const uiExtensions = ['.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.less', '.styles.ts', '.styles.tsx'];
    const isUiFile = (path: string) => uiExtensions.some(ext => path.endsWith(ext));

    const files: PrFullFile[] = [];
    for (const change of changes.changeEntries ?? []) {
      const path = change.item?.path ?? '';
      if (!path || !isUiFile(path)) continue;

      const changeType = change.changeType ?? 0;
      const typeStr = changeType === 1 ? 'add' : changeType === 2 ? 'edit' : changeType === 16 ? 'delete' : 'unknown';

      if (changeType === 16) {
        files.push({ path, content: '', changeType: 'delete' });
        continue;
      }

      try {
        const content = await this.getFileContent(repositoryId, pullRequestId, path, project);
        files.push({ path, content, changeType: typeStr as 'add' | 'edit' });
      } catch (err: any) {
        files.push({
          path,
          content: `// [Could not fetch content: ${err.message?.substring(0, 80)}]`,
          changeType: typeStr as 'add' | 'edit',
        });
      }
    }

    return files;
  }
}
