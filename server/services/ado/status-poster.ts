import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';

export type StatusState = 'pending' | 'succeeded' | 'failed' | 'error';

const GENRE = 'prism';
const CONTEXT_NAME = 'design-parity-check';

export class StatusPoster {
  private orgUrl: string;
  private token: string;

  constructor(orgUrl: string, token: string) {
    this.orgUrl = orgUrl;
    this.token = token;
  }

  private async getGitApi(): Promise<IGitApi> {
    const authHandler = azdev.getPersonalAccessTokenHandler(this.token);
    const connection = new azdev.WebApi(this.orgUrl, authHandler);
    return connection.getGitApi();
  }

  async postStatus(
    repositoryId: string,
    pullRequestId: number,
    project: string,
    state: StatusState,
    description: string,
    targetUrl?: string,
  ): Promise<void> {
    const gitApi = await this.getGitApi();

    // Map our states to ADO GitStatusState enum values
    const stateMap: Record<StatusState, number> = {
      pending: 1,    // GitStatusState.Pending
      succeeded: 2,  // GitStatusState.Succeeded
      failed: 3,     // GitStatusState.Failed
      error: 4,      // GitStatusState.Error
    };

    await gitApi.createPullRequestStatus(
      {
        state: stateMap[state],
        description,
        context: {
          genre: GENRE,
          name: CONTEXT_NAME,
        },
        targetUrl,
      } as any,
      repositoryId,
      pullRequestId,
      project,
    );

    console.log(`[status-poster] Posted ${state} status on PR #${pullRequestId}: ${description}`);
  }
}
