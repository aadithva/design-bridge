import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { Comment, CommentThread, CommentThreadStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';

const PERSISTENT_ID = 'design-integrity-review-bot';

function getConnection(orgUrl: string, token: string): azdev.WebApi {
  const authHandler = azdev.getPersonalAccessTokenHandler(token);
  return new azdev.WebApi(orgUrl, authHandler);
}

export class CommentPoster {
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

  /**
   * Post or update a PR comment using the persistentId pattern
   * for idempotent updates on re-push.
   */
  async postOrUpdateComment(
    repositoryId: string,
    pullRequestId: number,
    project: string,
    content: string
  ): Promise<void> {
    const gitApi = await this.getGitApi();

    // Look for existing thread with our persistent ID
    const threads = await gitApi.getThreads(repositoryId, pullRequestId, project);
    const existingThread = threads.find((t) =>
      t.properties?.persistentId?.['$value'] === PERSISTENT_ID
    );

    if (existingThread?.id) {
      // Update existing comment
      const comment: Comment = {
        content: this.truncateIfNeeded(content),
        parentCommentId: 0,
      };
      await gitApi.updateComment(
        comment,
        repositoryId,
        pullRequestId,
        existingThread.id,
        1, // first comment in thread
        project
      );
      console.log(`Updated existing design review comment (thread ${existingThread.id})`);
    } else {
      // Create new thread
      const thread: CommentThread = {
        comments: [
          {
            content: this.truncateIfNeeded(content),
            parentCommentId: 0,
            commentType: 1, // text
          },
        ],
        status: CommentThreadStatus.Closed, // Non-blocking, informational
        properties: {
          persistentId: {
            type: 'System.String',
            $value: PERSISTENT_ID,
          } as any,
        },
      };
      await gitApi.createThread(thread, repositoryId, pullRequestId, project);
      console.log('Created new design review comment thread');
    }
  }

  private truncateIfNeeded(content: string, maxLength: number = 150_000): string {
    if (content.length <= maxLength) return content;

    const truncationNotice =
      '\n\n---\n*Report truncated due to length. Run locally with `--dry-run` for full output.*';
    return content.slice(0, maxLength - truncationNotice.length) + truncationNotice;
  }
}
