import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { runAnalysis } from '../analysis-engine.js';
import { CommentPoster } from '../../services/ado/comment-poster.js';
import { StatusPoster } from '../../services/ado/status-poster.js';
import { PrFetcher } from '../../services/ado/pr-fetcher.js';
import {
  WEBHOOK_SECRET,
  WEBHOOK_ADO_PAT,
  WEBHOOK_FIGMA_PAT,
  ADO_ORG_URL,
  ADO_PROJECT,
} from '../config.js';
import type { StorageProvider } from '../storage/types.js';
import type { AnalysisResult } from '../types.js';
import pLimitModule from 'p-limit';

// Concurrency limiter (max 2 concurrent analyses)
const limit = pLimitModule(2);

// Deduplication: track in-flight analyses by (repoId, prId)
const inFlight = new Set<string>();

// UI file extensions (reused from pr-fetcher / diff-parser)
const UI_EXTENSIONS = ['.tsx', '.jsx', '.css', '.scss', '.less', '.styles.ts', '.styles.tsx'];
function isUiFile(path: string): boolean {
  return UI_EXTENSIONS.some(ext => path.endsWith(ext));
}

function validateHmac(body: Buffer, signature: string | undefined, secret: string): boolean {
  if (!secret || !signature) return !secret; // Skip validation if no secret configured
  const computed = createHmac('sha256', secret).update(body).digest('hex');
  const expected = Buffer.from(computed, 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function createWebhookRouter(analysisStore: StorageProvider<AnalysisResult>): Router {
  const router = Router();

  // ADO Service Hook: git.pullrequest.created
  router.post('/pr-created', async (req: Request, res: Response) => {
    try {
      // Validate HMAC signature
      if (WEBHOOK_SECRET) {
        const rawBody = JSON.stringify(req.body);
        const signature = req.headers['x-ado-signature'] as string | undefined;
        if (!validateHmac(Buffer.from(rawBody), signature, WEBHOOK_SECRET)) {
          console.warn('[webhook] Invalid HMAC signature');
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }

      // Validate server-side PATs are configured
      if (!WEBHOOK_ADO_PAT || !WEBHOOK_FIGMA_PAT) {
        console.warn('[webhook] WEBHOOK_ADO_PAT or WEBHOOK_FIGMA_PAT not configured');
        res.status(503).json({ error: 'Webhook PATs not configured' });
        return;
      }

      // Extract PR info from ADO payload
      const resource = req.body?.resource;
      if (!resource) {
        res.status(400).json({ error: 'Missing resource in payload' });
        return;
      }

      const pullRequestId: number = resource.pullRequestId;
      const repositoryId: string = resource.repository?.id;
      const project: string = resource.repository?.project?.name || ADO_PROJECT;

      if (!pullRequestId || !repositoryId) {
        res.status(400).json({ error: 'Missing pullRequestId or repositoryId' });
        return;
      }

      // Deduplication
      const dedupeKey = `${repositoryId}:${pullRequestId}`;
      if (inFlight.has(dedupeKey)) {
        console.log(`[webhook] Already processing PR #${pullRequestId}, skipping`);
        res.json({ status: 'already_processing' });
        return;
      }

      // Return 200 immediately — ADO expects fast response
      res.json({ status: 'accepted', pullRequestId });

      // Process asynchronously with concurrency limit
      limit(async () => {
        inFlight.add(dedupeKey);
        const statusPoster = new StatusPoster(ADO_ORG_URL, WEBHOOK_ADO_PAT);

        try {
          // Post pending status
          await statusPoster.postStatus(
            repositoryId, pullRequestId, project,
            'pending', 'Design parity check in progress...',
          );

          // Fetch PR info to get Figma URL from description
          const fetcher = new PrFetcher(ADO_ORG_URL, WEBHOOK_ADO_PAT);
          const prInfo = await fetcher.getPrInfo(repositoryId, pullRequestId, project);

          // Extract Figma URL from description
          const figmaUrlMatch = prInfo.description?.match(
            /https:\/\/(?:www\.)?figma\.com\/(?:file|design)\/[a-zA-Z0-9]+[^\s)>]*/
          );

          if (!figmaUrlMatch) {
            await statusPoster.postStatus(
              repositoryId, pullRequestId, project,
              'succeeded', 'No Figma URL found in PR description — skipping design review',
            );
            console.log(`[webhook] PR #${pullRequestId}: no Figma URL found, skipping`);
            return;
          }

          const figmaUrl = figmaUrlMatch[0];

          // Check if PR touches UI files
          const diff = await fetcher.getPrDiff(repositoryId, pullRequestId, project);
          const hasUiFiles = diff.split('\n')
            .filter(line => line.startsWith('diff --git'))
            .some(line => isUiFile(line));

          if (!hasUiFiles) {
            await statusPoster.postStatus(
              repositoryId, pullRequestId, project,
              'succeeded', 'No UI files changed — skipping design review',
            );
            console.log(`[webhook] PR #${pullRequestId}: no UI files changed, skipping`);
            return;
          }

          // Run analysis
          const result = await runAnalysis({
            figmaUrl,
            figmaPat: WEBHOOK_FIGMA_PAT,
            prId: pullRequestId,
            adoOrgUrl: ADO_ORG_URL,
            adoProject: project,
            adoRepoId: repositoryId,
            adoPat: WEBHOOK_ADO_PAT,
          });

          // Store result
          await analysisStore.set(result.id, result);

          // Post review comment
          const commentPoster = new CommentPoster(ADO_ORG_URL, WEBHOOK_ADO_PAT);
          const commentBody = formatReviewComment(result);
          await commentPoster.postOrUpdateComment(repositoryId, pullRequestId, project, commentBody);

          // Post final status
          const hasErrors = result.summary.errors > 0;
          await statusPoster.postStatus(
            repositoryId, pullRequestId, project,
            hasErrors ? 'failed' : 'succeeded',
            `Design review: ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.info} info`,
          );

          console.log(`[webhook] PR #${pullRequestId}: analysis complete (${result.summary.errors} errors)`);
        } catch (err: any) {
          console.error(`[webhook] PR #${pullRequestId} analysis failed:`, err);
          try {
            await statusPoster.postStatus(
              repositoryId, pullRequestId, project,
              'error', `Design review failed: ${err.message?.substring(0, 100)}`,
            );
          } catch {
            // Best-effort status posting
          }
        } finally {
          inFlight.delete(dedupeKey);
        }
      });
    } catch (err: any) {
      console.error('[webhook] Unhandled error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  return router;
}

function formatReviewComment(result: AnalysisResult): string {
  const icon = result.summary.errors > 0 ? '🔴' : result.summary.warnings > 0 ? '🟡' : '✅';
  let md = `## ${icon} Design Parity Check (Automated)\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| **Figma** | ${result.figmaUrl} |\n`;
  md += `| **Page** | ${result.figmaPageName} |\n`;
  md += `| **UI Files** | ${result.codeFiles.length} |\n`;
  md += `| **Result** | ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.info} info |\n\n`;

  if (result.components.length > 0) {
    md += `### Component Review\n\n`;
    for (const comp of result.components) {
      const statusIcon = comp.overallStatus === 'error' ? '🔴' : comp.overallStatus === 'warning' ? '🟡' : '✅';
      md += `#### ${statusIcon} ${comp.componentName}\n`;
      for (const f of comp.findings) {
        md += `- **${f.severity.toUpperCase()}**: ${f.message}\n`;
      }
      md += '\n';
    }
  }

  md += `\n---\n*Generated by design-review-bot (automated webhook)*`;
  return md;
}
