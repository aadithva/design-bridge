# ADO Webhook Setup for Automated Design Reviews

## Overview

The design-review-bot can automatically review PRs when they are created in Azure DevOps. This is done via ADO Service Hooks that send webhook notifications to the bot's API.

## Prerequisites

- Design Review Bot deployed and accessible (e.g., via Azure Container Apps)
- Azure DevOps project with admin permissions
- Server-side PATs configured on the bot (`WEBHOOK_ADO_PAT`, `WEBHOOK_FIGMA_PAT`)

## Step 1: Configure Environment Variables

Set these environment variables on your deployment:

| Variable | Description |
|----------|-------------|
| `WEBHOOK_SECRET` | Shared secret for HMAC signature validation |
| `WEBHOOK_ADO_PAT` | Azure DevOps PAT with Code (Read) and Pull Request Threads (Read & Write) permissions |
| `WEBHOOK_FIGMA_PAT` | Figma PAT with file read access |

## Step 2: Create ADO Service Hook

1. Navigate to your ADO project → **Project Settings** → **Service Hooks**
2. Click **Create Subscription**
3. Select **Web Hooks** as the service
4. Configure the trigger:
   - **Event**: `Pull request created` (`git.pullrequest.created`)
   - **Repository**: Select your target repository (e.g., `1JS`)
   - **Branch filter**: (optional) Filter to specific branches
5. Configure the action:
   - **URL**: `https://<your-container-app-url>/api/webhooks/pr-created`
   - **HTTP headers**: (optional) Set `X-ADO-Signature` if using HMAC validation
   - **Resource details to send**: `All`
   - **Messages to send**: `All`
   - **Detailed messages to send**: `All`

## Step 3: Configure HMAC Validation (Recommended)

If you set `WEBHOOK_SECRET` on the bot, ADO will sign the payload. The bot validates this signature to ensure requests are authentic.

1. In the Service Hook configuration, enable **Basic authentication** or add a custom header
2. Set the shared secret to match your `WEBHOOK_SECRET` environment variable

## Step 4: (Optional) Configure Branch Policy

To make design review a required (or advisory) check on PRs:

1. Navigate to **Repos** → **Branches** → select your target branch
2. Click **Branch Policies**
3. Under **Status Checks**, add a new status check:
   - **Status to check**: `design-review-bot/design-parity-check`
   - **Policy requirement**: `Optional` (advisory) or `Required` (blocking)
   - **Applicability**: `Apply to default branch`

When configured as required, PRs cannot be completed until the design parity check passes (0 errors).

## How It Works

1. Developer creates a PR in ADO
2. ADO sends a `git.pullrequest.created` webhook to the bot
3. The bot:
   - Validates the HMAC signature
   - Extracts the PR ID and repository from the payload
   - Checks if the PR touches UI files (.tsx, .jsx, .css, etc.)
   - Extracts the Figma URL from the PR description
   - Runs the heuristic design comparison
   - Posts a review comment on the PR
   - Sets a PR status check (green/yellow/red)

## Troubleshooting

- **No Figma URL found**: The bot skips analysis if no Figma URL is found in the PR description. Ensure developers include Figma links in PR descriptions.
- **No UI files changed**: The bot skips analysis if no UI-relevant files are in the PR diff.
- **Authentication errors**: Verify that `WEBHOOK_ADO_PAT` has the correct permissions.
- **Timeout**: ADO expects a response within 20 seconds. The bot returns 200 immediately and processes asynchronously.
