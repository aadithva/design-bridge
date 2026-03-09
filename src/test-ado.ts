import { PrFetcher } from './services/ado/pr-fetcher.js';

async function main() {
  const orgUrl = 'https://dev.azure.com/office';
  const token = process.env.AZURE_PERSONAL_ACCESS_TOKEN!;
  const project = 'office';
  const repoId = '1js';

  console.log('[1] Testing ADO connection...');
  const fetcher = new PrFetcher(orgUrl, token);

  // Try to find PR by searching recent PRs
  console.log('[2] Searching for recent PRs in 1js...');
  try {
    // Use the azure-devops-node-api to search for the commit
    const azdev = await import('azure-devops-node-api');
    const authHandler = azdev.getPersonalAccessTokenHandler(token);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const gitApi = await connection.getGitApi();

    // First, verify repo access by getting repo info
    console.log('[3] Getting repo info...');
    const repos = await gitApi.getRepositories(project);
    const jsRepo = repos.find(r => r.name === '1JS' || r.name === '1js');
    if (!jsRepo) {
      console.log('    Available repos:', repos.slice(0, 5).map(r => r.name).join(', '));
      console.error('    ❌ 1js repo not found');
      return;
    }
    console.log(`    ✅ Found repo: ${jsRepo.name} (${jsRepo.id})`);

    // Search for the commit
    console.log('[4] Searching for commit b8028595...');
    try {
      const commit = await gitApi.getCommit('b80285950aaca1d6a5aea62507544ef2d7c7220e', jsRepo.id!, project);
      console.log(`    ✅ Commit found: "${commit.comment?.substring(0, 80)}"`);
      console.log(`    Author: ${commit.author?.name}`);
      console.log(`    Date: ${commit.author?.date}`);
    } catch (e: any) {
      console.log(`    ⚠️ Commit lookup failed: ${e.message?.substring(0, 100)}`);
    }

    // Find PRs associated with this commit
    console.log('[5] Finding PR for this commit...');
    try {
      const searchCriteria = {
        includeLinks: true,
      };
      // Get recent completed PRs
      const prs = await gitApi.getPullRequests(jsRepo.id!, { status: 3 /* completed */ }, project, undefined, 0, 10);
      console.log(`    Found ${prs.length} recent completed PRs`);
      for (const pr of prs.slice(0, 3)) {
        console.log(`    PR #${pr.pullRequestId}: ${pr.title?.substring(0, 60)}`);
      }
    } catch (e: any) {
      console.log(`    ⚠️ PR search failed: ${e.message?.substring(0, 100)}`);
    }

    // Try to get PRs by commit
    console.log('[6] Getting PRs by commit SHA...');
    try {
      const query = { type: 1, commits: [{ commitId: 'b80285950aaca1d6a5aea62507544ef2d7c7220e' }] } as any;
      const prsByCommit = await gitApi.getPullRequestQuery({ queries: [query] }, jsRepo.id!, project);
      if (prsByCommit.results && prsByCommit.results.length > 0) {
        for (const result of prsByCommit.results) {
          for (const [commitId, prs] of Object.entries(result)) {
            if (Array.isArray(prs) && prs.length > 0) {
              for (const pr of prs) {
                console.log(`    ✅ PR #${pr.pullRequestId}: ${pr.title?.substring(0, 60)}`);
              }
            }
          }
        }
      } else {
        console.log('    No PRs found for this commit');
      }
    } catch (e: any) {
      console.log(`    ⚠️ PR query by commit failed: ${e.message?.substring(0, 100)}`);
    }

  } catch (err: any) {
    console.error('Error:', err.message?.substring(0, 200));
  }
}

main();
