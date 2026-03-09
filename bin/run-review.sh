#!/usr/bin/env bash
set -euo pipefail

# Prism — Agency Agent Runner
# Usage: ./bin/run-review.sh <PR_ID> [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# --- Validate required env vars ---
: "${AZURE_PERSONAL_ACCESS_TOKEN:?Set AZURE_PERSONAL_ACCESS_TOKEN}"
: "${FIGMA_API_TOKEN:?Set FIGMA_API_TOKEN}"
: "${ADO_ORG_URL:?Set ADO_ORG_URL}"
: "${ADO_PROJECT:?Set ADO_PROJECT}"
: "${ADO_REPOSITORY_ID:?Set ADO_REPOSITORY_ID}"

# --- Parse arguments ---
PR_ID="${1:?Usage: run-review.sh <PR_ID> [--dry-run]}"
DRY_RUN=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=" Output the report but do NOT call post_review_comment." ;;
  esac
done

# --- Resolve paths ---
AGENT_DIR="${PROJECT_DIR}/agent"
AGENT_FILE="${AGENT_DIR}/prism-agent.md"
MCP_CONFIG="${AGENT_DIR}/mcp-config.json"

# Build MCP config with resolved env vars
MCP_CONFIG_RESOLVED=$(mktemp)
trap 'rm -f "$MCP_CONFIG_RESOLVED"' EXIT

sed \
  -e "s|\${PROJECT_DIR}|${PROJECT_DIR}|g" \
  -e "s|\${AZURE_PERSONAL_ACCESS_TOKEN}|${AZURE_PERSONAL_ACCESS_TOKEN}|g" \
  -e "s|\${FIGMA_API_TOKEN}|${FIGMA_API_TOKEN}|g" \
  -e "s|\${ADO_ORG_URL}|${ADO_ORG_URL}|g" \
  -e "s|\${ADO_PROJECT}|${ADO_PROJECT}|g" \
  -e "s|\${ADO_REPOSITORY_ID}|${ADO_REPOSITORY_ID}|g" \
  "$MCP_CONFIG" > "$MCP_CONFIG_RESOLVED"

# --- Ensure built ---
if [ ! -f "${PROJECT_DIR}/dist/mcp-server.js" ]; then
  echo "Building MCP server..."
  (cd "$PROJECT_DIR" && npm run build)
fi

# --- Prepare reports directory ---
REPORTS_DIR="${PROJECT_DIR}/reports"
mkdir -p "$REPORTS_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="${REPORTS_DIR}/review-PR${PR_ID}-${TIMESTAMP}.md"

# --- Run the agent ---
echo "Starting design review for PR #${PR_ID}..."

agency copilot \
  --agent "$AGENT_FILE" \
  --additional-mcp-config "@${MCP_CONFIG_RESOLVED}" \
  --prompt "Review PR #${PR_ID} against the Figma design linked in its description.${DRY_RUN}" \
  --model claude-sonnet-4.5 \
  --allow-all-tools \
  --silent \
  | tee "$REPORT_FILE"

echo ""
echo "Design review complete."
echo "Report saved to: ${REPORT_FILE}"
