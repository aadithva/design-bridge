/**
 * Spawns the Agency CLI (`agency copilot`) as a child process to generate
 * an AI-powered design review narrative.
 */
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export interface AgencyReviewOptions {
  prId: number;
  figmaUrl: string;
  adoPat: string;
  figmaPat: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoId: string;
}

const TIMEOUT_MS = 600_000; // 10 minutes

/**
 * Spawns `agency copilot` and returns the markdown report written to stdout.
 */
export async function spawnAgencyReview(opts: AgencyReviewOptions): Promise<string> {
  const projectDir = join(__dirname, '../../..'); // resolve to repo root from dist/services/agency/
  const agentFile = join(projectDir, 'agent/prism-agent.md');
  const mcpTemplate = join(projectDir, 'agent/mcp-config.json');

  // Read and resolve the MCP config template
  const { readFileSync } = await import('fs');
  let mcpConfigContent = readFileSync(mcpTemplate, 'utf-8');
  mcpConfigContent = mcpConfigContent
    .replace(/\$\{PROJECT_DIR\}/g, projectDir)
    .replace(/\$\{AZURE_PERSONAL_ACCESS_TOKEN\}/g, opts.adoPat)
    .replace(/\$\{FIGMA_API_TOKEN\}/g, opts.figmaPat)
    .replace(/\$\{ADO_ORG_URL\}/g, opts.adoOrgUrl)
    .replace(/\$\{ADO_PROJECT\}/g, opts.adoProject)
    .replace(/\$\{ADO_REPOSITORY_ID\}/g, opts.adoRepoId)
    .replace(/\$\{FIGMA_TEAM_ID\}/g, '');

  // Write resolved config to a temp file
  const tmpConfigPath = join(tmpdir(), `mcp-config-${randomUUID()}.json`);
  writeFileSync(tmpConfigPath, mcpConfigContent, 'utf-8');

  try {
    const markdown = await new Promise<string>((resolve, reject) => {
      const args = [
        'copilot',
        '--agent', agentFile,
        '--additional-mcp-config', `@${tmpConfigPath}`,
        '-p', `Review PR #${opts.prId} against the Figma design at ${opts.figmaUrl}.`,
        '--model', 'claude-sonnet-4.5',
        '--allow-all-tools',
        '--silent',
      ];

      const child = spawn('agency', args, {
        cwd: projectDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Agency CLI timed out after ${TIMEOUT_MS / 1000}s`));
      }, TIMEOUT_MS);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Agency CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn Agency CLI: ${err.message}`));
      });
    });

    // Prefer the structured report saved by the agent's save_report tool over raw stdout
    const reportsDir = join(projectDir, 'reports');
    const prPattern = `review-PR${opts.prId}-`;
    try {
      const files = readdirSync(reportsDir)
        .filter(f => f.startsWith(prPattern) && f.endsWith('.md'))
        .map(f => ({ name: f, mtime: statSync(join(reportsDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length > 0) {
        const reportContent = readFileSync(join(reportsDir, files[0].name), 'utf-8');
        if (reportContent.length > markdown.length) {
          return reportContent;
        }
      }
    } catch { /* fall through to stdout */ }

    return markdown;
  } finally {
    try { unlinkSync(tmpConfigPath); } catch { /* ignore cleanup errors */ }
  }
}

/**
 * Save a report to the reports/ directory, mirroring the MCP save_report tool logic.
 */
export function saveReport(content: string, prId?: number): string {
  const projectDir = join(__dirname, '../../..');
  const reportsDir = join(projectDir, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prSuffix = prId ? `-PR${prId}` : '';
  const filename = `review${prSuffix}-${timestamp}.md`;
  const filepath = join(reportsDir, filename);
  writeFileSync(filepath, content, 'utf-8');
  return filepath;
}
