# Prism — Architecture Document

## 1. Overview

Prism is an automated design integrity review system that compares **Figma designs** against **Azure DevOps (ADO) pull request code changes**. It detects discrepancies in spacing, typography, colors, border radius, layout, and component usage, then produces structured, component-by-component review reports.

The system is built for teams working with **Fluent UI (React)** and operates in two modes:

1. **AI Agent Mode** — An MCP server that exposes tools for an AI agent (Claude via Agency CLI) to orchestrate a multi-step design review workflow.
2. **Web App Mode** — An Express API backend + React/Fluent UI frontend for interactive, manual design reviews.

Both modes share the same core service modules and produce the same comparison output.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DELIVERY LAYER                                │
│                                                                        │
│   ┌─────────────────────┐          ┌──────────────────────────────┐    │
│   │   MCP Server        │          │   Express API + React SPA    │    │
│   │   (stdio transport) │          │   (port 3001)                │    │
│   │                     │          │                              │    │
│   │  AI Agent (Claude)  │          │  ┌────────────────────────┐  │    │
│   │  calls tools via    │          │  │ React + Fluent UI v9   │  │    │
│   │  Agency CLI         │          │  │ (Vite, port 3000 dev)  │  │    │
│   └─────────┬───────────┘          │  └────────────┬───────────┘  │    │
│             │                      │               │ /api/*       │    │
│             │                      └───────────────┼──────────────┘    │
│             │                                      │                   │
└─────────────┼──────────────────────────────────────┼───────────────────┘
              │                                      │
              ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CORE SERVICES LAYER                            │
│                                                                        │
│  ┌──────────────────┐  ┌────────────────────┐  ┌───────────────────┐   │
│  │  Figma Services   │  │  ADO Services      │  │ Comparison Engine │   │
│  │                   │  │                    │  │                   │   │
│  │ • FigmaClient     │  │ • PrFetcher        │  │ • ComponentMatcher│   │
│  │ • TokenExtractor  │  │ • CommentPoster    │  │ • Completeness    │   │
│  │ • PorPageDetector │  │ • DiscoveryService │  │   Checker         │   │
│  │ • ScenarioEnum    │  │                    │  │ • CraftFigma      │   │
│  │ • FrameExporter   │  │                    │  │   Matcher         │   │
│  └──────────────────┘  └────────────────────┘  └───────────────────┘   │
│                                                                        │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐    │
│  │  Code Analysis               │  │  Utilities                   │    │
│  │                              │  │                              │    │
│  │ • DiffParser                 │  │ • PR Description Parser      │    │
│  │ • StyleExtractor             │  │   (Figma URL extraction)     │    │
│  └──────────────────────────────┘  └──────────────────────────────┘    │
│                                                                        │
└─────────────────────────────────────────────────────────────────────────┘
              │                                      │
              ▼                                      ▼
┌─────────────────────────────┐  ┌────────────────────────────────────────┐
│  Figma REST API             │  │  Azure DevOps REST API                 │
│  api.figma.com/v1           │  │  azure-devops-node-api                 │
│                             │  │  (Git API, Core API)                   │
└─────────────────────────────┘  └────────────────────────────────────────┘
```

---

## 3. Project Structure

```
prism/
├── server/                                     # Backend (TypeScript, Express, MCP)
│   ├── mcp-server.ts                          # MCP server entry point (stdio transport)
│   ├── api/
│   │   ├── server.ts                          # Express API server (web mode)
│   │   ├── config.ts                          # Environment config (storage backend, etc.)
│   │   ├── analysis-engine.ts                 # Core analysis orchestration
│   │   ├── types.ts                           # API TypeScript types
│   │   ├── routes/
│   │   │   ├── mcp.ts                         # MCP-related API routes
│   │   │   └── webhook.ts                     # Webhook handler for automated reviews
│   │   └── storage/
│   │       ├── types.ts                       # Storage provider interface
│   │       ├── file-provider.ts               # ✅ File-based JSON storage (default)
│   │       ├── memory-provider.ts             # In-memory storage (testing)
│   │       └── azure-table-provider.ts        # Azure Table Storage (cloud)
│   ├── tools/
│   │   ├── figma-tools.ts                     # MCP tool registrations (Figma)
│   │   ├── pr-tools.ts                        # MCP tool registrations (ADO/PR)
│   │   └── analysis-tools.ts                  # Analysis tool registrations
│   ├── services/
│   │   ├── figma/
│   │   │   ├── figma-client.ts                # Figma REST API client
│   │   │   ├── types.ts                       # All Figma-related TypeScript types
│   │   │   ├── design-token-extractor.ts      # Extract tokens from Figma node tree
│   │   │   ├── por-page-detector.ts           # Heuristic POR/Redlines page detection
│   │   │   ├── scenario-enumerator.ts         # Catalog components/variants on a page
│   │   │   ├── frame-exporter.ts              # Export frames as PNG images
│   │   │   └── text-extractor.ts              # Extract text content from Figma nodes
│   │   ├── ado/
│   │   │   ├── pr-fetcher.ts                  # ADO Git API — PR info, diffs, file content
│   │   │   ├── comment-poster.ts              # Idempotent PR commenting
│   │   │   ├── status-poster.ts               # PR status updates
│   │   │   ├── commit-search.ts               # Search commits for context
│   │   │   └── discovery-service.ts           # List projects/repos, find UI-touching PRs
│   │   ├── code-analysis/
│   │   │   ├── diff-parser.ts                 # Parse unified diffs, filter to UI files
│   │   │   └── style-extractor.ts             # Regex-based token extraction from code
│   │   ├── comparison/
│   │   │   ├── component-matcher.ts           # Core Figma-to-Code comparison engine
│   │   │   └── completeness-checker.ts        # Bidirectional coverage verification
│   │   ├── matching/
│   │   │   ├── craft-figma-matcher.ts         # Fuzzy match PRs to Figma files
│   │   │   └── content-matcher.ts             # Content-based matching
│   │   ├── agency/
│   │   │   └── agency-runner.ts               # Agency CLI integration
│   │   └── pr-description-parser.ts           # Extract Figma URLs from PR descriptions
│   └── test-*.ts                              # Various test/debug scripts
├── client/                                     # Frontend (React + Fluent UI v9)
│   ├── index.html                             # Vite HTML entry
│   ├── vite.config.ts                         # Vite config (proxy /api → 3001)
│   ├── package.json                           # React 19, Fluent UI v9, Vite 7
│   └── src/
│       ├── main.tsx                           # React entry (FluentProvider)
│       ├── types.ts                           # Frontend TypeScript types
│       ├── index.css                          # Global styles
│       ├── components/
│       │   ├── AnalysisReport.tsx             # Component-by-component result display
│       │   ├── AISummaryPanel.tsx             # AI-generated summary panel
│       │   ├── DiscoverTable.tsx              # Discovery results table
│       │   ├── Layout.tsx                     # App shell layout
│       │   ├── RequireSettings.tsx            # Settings gate component
│       │   ├── Select.tsx                     # Custom select component
│       │   ├── SettingsPanel.tsx              # PAT configuration + validation
│       │   ├── SeverityBadge.tsx              # Severity indicator badges
│       │   └── TeamSwitcher.tsx               # Team context switcher
│       ├── pages/
│       │   ├── AnalysisReportPage.tsx         # Analysis report view
│       │   ├── DiscoverPage.tsx               # Discovery + auto-match view
│       │   ├── OnboardingPage.tsx             # First-time setup flow
│       │   ├── ReportsPage.tsx                # Report history view
│       │   └── SettingsPage.tsx               # Settings management
│       └── lib/
│           ├── api.ts                         # API client functions
│           ├── settings.ts                    # Settings persistence
│           ├── DiscoverContext.tsx             # Discovery state context
│           └── SettingsContext.tsx             # Settings state context
├── agent/
│   ├── prism-agent.md                         # AI agent system prompt (7-step workflow)
│   └── mcp-config.json                        # MCP server config template
├── bin/
│   └── run-review.sh                          # Shell script to build + launch agent
├── data/                                       # Persistent storage (JSON files, gitignored)
├── reports/                                   # Generated review reports (markdown)
├── dist/                                      # Compiled TypeScript output
├── docker-compose.yml                         # One-command startup with volumes
├── Dockerfile                                 # Multi-stage build (server + client)
├── package.json                               # Root package (Express, MCP SDK, etc.)
└── tsconfig.json                              # TypeScript config (ES2022, Node16)
```

---

## 4. Core Services — Detailed Breakdown

### 4.1 Figma Services

#### FigmaClient (`services/figma/figma-client.ts`)

Wraps the Figma REST API (`api.figma.com/v1`). Uses `axios` with a 120-second timeout and `X-Figma-Token` auth header.

| Method | Purpose |
|--------|---------|
| `getFile(fileKey, depth?)` | Fetch file metadata. Uses `depth` param to avoid fetching the entire node tree for large files. |
| `getFileNodes(fileKey, nodeIds[])` | Fetch specific subtrees by node ID — much faster for large files when a `node-id` is in the Figma URL. |
| `exportImages(fileKey, nodeIds[], scale, format)` | Request PNG/SVG/JPG export URLs for given nodes from Figma. |
| `downloadImage(url)` | Download a Figma-hosted image URL into a `Buffer`. |
| `getMe()` | Validate PAT / get current user info (used in Settings panel). |
| `getTeamProjects(teamId)` | List all projects in a Figma team. |
| `getProjectFiles(projectId)` | List all files in a Figma project. |
| `getAllTeamFiles(teamId)` | Enumerate all files across all projects in a team (with `p-limit(5)` concurrency). |
| `searchFiles(teamId, query, maxResults)` | Search files by name. Enumerates all team files, then scores by exact match (100) → contains full query (50) → word-level overlap (20/word). Returns top results sorted by relevance. |

#### Design Token Extractor (`services/figma/design-token-extractor.ts`)

Recursively walks a Figma node tree and extracts structured design tokens:

- **Colors** — From `fills` and `strokes` arrays. Converts Figma's 0–1 RGBA to hex and 0–255 RGBA. Tracks whether usage is `fill` or `stroke`.
- **Typography** — From `TEXT` nodes: `fontFamily`, `fontSize`, `fontWeight`, `lineHeightPx`.
- **Spacing** — From auto-layout frames: `itemSpacing`, `paddingLeft/Right/Top/Bottom`.
- **Border Radius** — From `cornerRadius` property on any node.
- **Component Instances** — Counts how many times each component name appears as an `INSTANCE` node.

Also provides `deduplicateColors()` to collapse identical hex values.

#### POR Page Detector (`services/figma/por-page-detector.ts`)

Identifies the "Plan of Record" or "Redlines" page from a Figma document using heuristic keyword scoring on page names:

| Score | Keywords |
|-------|----------|
| +10 (High) | `POR`, `final`, `handoff`, `dev ready`, `spec`, `redlines` |
| +5 (Medium) | Version numbers (`v1.2`), `release`, `production`, `approved` |
| -5 (Negative) | `WIP`, `draft`, `archive`, `deprecated`, `exploration` |
| -3 | `old` |

Two functions:
- `detectPorPage()` — Returns the single best-scoring page (or falls back to the first page).
- `detectRelevantPages()` — Returns both a `porPage` and a `redlinesPage` separately, plus all scored pages.

If a `node-id` is provided in the Figma URL, it overrides heuristic detection with confidence 100.

#### Scenario Enumerator (`services/figma/scenario-enumerator.ts`)

Catalogs every top-level frame, component, and variant on a Figma page into a structured manifest (`FigmaPageManifest`):

- Walks the node tree up to `maxDepth` (default 3).
- For `COMPONENT_SET` nodes, parses variant names (e.g., `"State=Hover, Size=Large"`) into structured properties.
- Derives normalized component names (splits camelCase, strips variant props, lowercases).
- Returns: `scenarios[]` (hierarchical), `totalCount`, `componentNames[]` (deduplicated), `variantGroups[]`.

#### Frame Exporter (`services/figma/frame-exporter.ts`)

Exports top-level frames from a page as PNG images:
1. Filters children to `FRAME`, `COMPONENT`, or `COMPONENT_SET` types.
2. Limits to `maxFrames` (default 10) to avoid excessive API calls.
3. Requests image URLs from Figma's export endpoint at 2x scale.
4. Downloads images in parallel with `p-limit(3)` concurrency.
5. Returns `ExportedFrame[]` with `nodeId`, `name`, `imageUrl`, `imageBuffer`, `width`, `height`.

---

### 4.2 ADO Services

#### PrFetcher (`services/ado/pr-fetcher.ts`)

Interfaces with Azure DevOps Git API via `azure-devops-node-api`.

| Method | Purpose |
|--------|---------|
| `getPrInfo(repoId, prId, project)` | Fetch PR title, description, repository info. |
| `getPrDiff(repoId, prId, project)` | Build a unified diff string. Gets PR iterations → latest iteration changes → filters to UI files (`.tsx`, `.jsx`, `.css`, `.scss`, `.less`, `.styles.ts`, `.styles.tsx`) → fetches file content from source branch commit → constructs diff format with `+` lines for the parser. |
| `getFileContent(repoId, prId, filePath, project)` | Fetch a single file's full content from the PR's source branch. Handles Node.js ReadableStreams, raw Buffers, and string responses. |
| `getPrFullFiles(repoId, prId, project)` | Fetch complete content of ALL UI-relevant files touched by the PR (not just changed lines). Returns `PrFullFile[]` with path, content, and change type (add/edit/delete). |

**UI-relevant file extensions**: `.tsx`, `.jsx`, `.ts`, `.js`, `.css`, `.scss`, `.less`, `.styles.ts`, `.styles.tsx`

#### CommentPoster (`services/ado/comment-poster.ts`)

Posts or updates a design review comment on a PR using the **idempotent `persistentId` pattern**:

1. Lists existing comment threads on the PR.
2. Looks for a thread with `properties.persistentId.$value === 'design-integrity-review-bot'`.
3. If found → updates the first comment in that thread.
4. If not found → creates a new thread with status `Closed` (non-blocking/informational) and the `persistentId` property.

This means re-running the review on the same PR **updates** the existing comment rather than creating duplicates.

Comments are truncated at 150,000 characters if needed.

#### DiscoveryService (`services/ado/discovery-service.ts`)

Discovers UI-relevant ("craft") pull requests across ADO projects and repositories.

| Method | Purpose |
|--------|---------|
| `getProjects()` | List all projects in the ADO organization. |
| `getRepositories(project)` | List all repos in a project. |
| `getRecentPRs(project, repoId, opts?)` | Get active PRs from the last N days (default 30, max 50). |
| `getCraftPRs(project, repoId?, opts?)` | Find PRs that touch UI files. For each PR: gets iteration changes → filters to UI extensions → derives component names from file paths. Skips PRs with no UI files. Uses `p-limit(5)` concurrency. |
| `discoverAllCraftPRs(projects[])` | Run `getCraftPRs` across multiple projects in parallel (`p-limit(3)`). |

---

### 4.3 Code Analysis

#### Diff Parser (`services/code-analysis/diff-parser.ts`)

Parses unified diff text (using the `parse-diff` library) and filters to UI-relevant files.

**UI-relevant criteria:**
- **Extensions**: `.tsx`, `.jsx`, `.css`, `.scss`, `.less`, `.styles.ts`, `.styles.js`, `.theme.ts`, `.theme.js`, `.tokens.ts`, `.tokens.js`
- **Path segments**: `/components/`, `/styles/`, `/theme/`, `/ui/`, `/views/`, `/pages/`, `/layouts/`

Returns `ParsedDiffFile[]` with `path`, `additions[]` (added lines), `deletions[]` (removed lines).

Also provides `getDiffSummary()` for total file/addition/deletion counts.

#### Style Extractor (`services/code-analysis/style-extractor.ts`)

Regex-based extraction of design token usage from code lines:

| Category | What it extracts |
|----------|-----------------|
| **Colors** | Hex colors (`#abc123`), `rgb()`/`rgba()` values, `tokens.*` and `theme.*` references |
| **Spacing** | `padding`, `margin`, `gap`, `top`, `bottom`, `left`, `right`, `inset` values with px/rem/em units |
| **Typography** | `fontSize`, `fontWeight` (including named weights like `bold`, `semibold`), `fontFamily` |
| **Components** | Fluent UI component imports from `@fluentui/react*` packages |

Returns `CodeTokens` objects that can be merged across files via `mergeCodeTokens()`.

---

### 4.4 Comparison Engine

#### Component Matcher (`services/comparison/component-matcher.ts`)

The **core comparison engine** that does property-by-property Figma-to-Code analysis.

**Step 1: `deriveSearchTerms(filePath, code)`**

Extracts searchable component names from:
- File path segments (split on `/`, strip extensions, split camelCase)
- Code declarations (`export function MyComponent`, `const MyWidget`, `class MyView`)
- `makeStyles()` block keys

**Step 2: `findMatchingComponents(figmaNode, searchTerms)`**

Recursively walks the Figma node tree (up to depth 10), finds nodes whose names contain any of the search terms (case-insensitive). Returns `{ node, path, matchedTerm }[]`.

**Step 3: `extractComponentSpec(node)`**

Converts a Figma node into a structured `FigmaComponentSpec`:
- `fills[]` — solid fill colors as hex
- `padding` — top/right/bottom/left
- `gap` — `itemSpacing`
- `borderRadius` — `cornerRadius`
- `layout` — `layoutMode` (HORIZONTAL/VERTICAL/NONE)
- `align`, `justify` — counter-axis and primary-axis alignment
- `size` — width and height from `absoluteBoundingBox`
- `font` — family, size, weight, line height (for TEXT nodes)
- `children[]` — recursed up to depth 6

**Step 4: `parseCodeStyles(code)`**

Extracts a `Map<property, value>` from code text using regex:
- Style properties like `borderRadius: "8px"`, `gap: 12`, `backgroundColor: tokens.colorNeutralBackground1`
- `shorthands.padding(...)` / `shorthands.margin(...)` calls

**Step 5: `compareComponent(componentName, figmaSpec, codeStyles)`**

Does the actual property-by-property comparison. Produces `ComparisonFinding[]`:

| Property Checked | How | Severity Rules |
|-----------------|-----|----------------|
| **Border Radius** | Compare figma `cornerRadius` vs code `borderRadius` | Fully-rounded mismatch → error; >4px diff → warning; ≤4px → info; exact match → pass |
| **Gap** | Compare figma `itemSpacing` vs code `gap` | >4px diff → warning; ≤4px → info; match → pass |
| **Padding** | Compare figma padding vs code `shorthands.padding()` | Mismatch → warning; match → pass |
| **Font Size** | Compare figma text size vs code `fontSize` | >2px diff → warning; ≤2px → info; match → pass |
| **Line Height** | Compare figma `lineHeightPx` vs code `lineHeight` | Diff → info; match → pass |
| **Font Weight** | Compare figma weight vs code `fontWeight` | Mismatch → warning; match → pass |
| **Background Color** | Compare figma first fill hex vs code `backgroundColor` | Token reference → info (verify manually); hex mismatch → warning; match → pass |
| **Text Color** | Compare figma text node fill vs code `color` | Same as background color |
| **Width / Height** | Compare figma bounding box vs code `maxWidth`/`height` | Height >4px diff → warning; others → info |

#### Completeness Checker (`services/comparison/completeness-checker.ts`)

Bidirectional verification of Figma scenarios vs code components.

**Forward check** (Figma → Code): For each Figma scenario, find the best matching code component.
**Reverse check** (Code → Figma): For each code component, find the best matching Figma scenario.

**Multi-tier matching algorithm:**

| Tier | How | Confidence |
|------|-----|------------|
| 1. Exact | `a === b` | 1.0 |
| 2. Normalized | Lowercase, strip special chars, split camelCase, then compare | 0.9 |
| 3. Fuzzy | Word-overlap similarity: `(2 × intersection) / (|A| + |B|)`, threshold ≥ 0.5 | 0.5–1.0 |
| 4. Substring | One normalized name contains the other | 0.4 |

Returns a `CompletenessReport` with:
- `coveredScenarios[]` — matched pairs with match type and confidence
- `missingFromCode[]` — Figma scenarios with no code counterpart
- `missingFromFigma[]` — code components with no Figma counterpart
- `coveragePercentage` — % of Figma scenarios that have a code match

#### Craft-Figma Matcher (`services/matching/craft-figma-matcher.ts`)

Fuzzy matching between PR component names and Figma file names, used by the Discovery feature.

- `matchPRToFigmaFiles(componentNames, figmaFiles)` — For each PR component, score against each Figma file name. Returns best match per file above threshold (default 0.3).
- `matchFigmaFileToPRs(figmaFileName, craftPRs)` — For each PR, score its component names and title against the Figma file name. Returns all PRs above threshold.

Both use the same word-overlap `fuzzyScore()` function and return results sorted by score descending.

---

## 5. Delivery Mode 1: MCP Server (AI Agent)

### How It Works

The MCP server (`server/mcp-server.ts`) exposes tools over **stdio transport** using the `@modelcontextprotocol/sdk`. An AI agent (Claude) calls these tools in sequence to perform a structured review.

### Registered MCP Tools

| Tool Name | Description | Input |
|-----------|-------------|-------|
| `get_pr_info` | Fetch PR title, description, and any Figma URLs found in it | `pr_id: number` |
| `get_pr_code_changes` | Fetch PR diff filtered to UI files, extract code tokens | `pr_id: number` |
| `get_pr_full_code` | Fetch full content of all UI files touched by PR | `pr_id: number` |
| `post_review_comment` | Post/update idempotent design review comment on PR | `pr_id: number, content: string` |
| `save_report` | Save review report as local markdown file | `content: string, pr_id?: number` |
| `get_figma_design_spec` | Fetch Figma file, detect POR page, extract design tokens | `figma_url: string` |
| `get_figma_screenshots` | Export top-level frames as PNG images | `figma_url: string, max_frames?: number` |
| `search_figma_files` | Search for Figma files by name in a team | `team_id: string, query: string, max_results?: number` |
| `enumerate_figma_scenarios` | Catalog all components/variants on a page | `figma_url: string` |

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `AZURE_PERSONAL_ACCESS_TOKEN` | Yes | ADO PAT for Git API access |
| `FIGMA_API_TOKEN` | Yes | Figma personal access token |
| `ADO_ORG_URL` | Yes | ADO organization URL (e.g., `https://dev.azure.com/myorg`) |
| `ADO_PROJECT` | Yes | ADO project name |
| `ADO_REPOSITORY_ID` | Yes | ADO repository GUID |
| `FIGMA_TEAM_ID` | No | Figma team ID (for file search) |

### Agent Workflow (7 Steps)

The agent prompt (`agent/prism-agent.md`) defines a strict 7-step workflow:

```
Step 1: get_pr_info          → Get PR title, description, extract Figma URLs
         ↓
Step 0*: search_figma_files  → (If no Figma URL found, search by PR title)
         ↓
Step 2: get_pr_full_code     → Get full file content for all UI files
      + get_pr_code_changes  → Get diff to understand what specifically changed
         ↓
Step 3: get_figma_design_spec → Extract design tokens from Figma
         ↓
Step 3.5: enumerate_figma_scenarios → Get full component/variant manifest
         ↓
Step 4: get_figma_screenshots → Export frames as PNG for visual analysis
         ↓
Step 5: Compare              → Property-by-property analysis (agent reasoning)
         ↓
Step 6: Generate report      → Structured markdown report
         ↓
Step 7: save_report           → Save locally
      + post_review_comment   → Post to PR (unless --dry-run)
```

### Running the Agent

```bash
# Set environment variables
export AZURE_PERSONAL_ACCESS_TOKEN="..."
export FIGMA_API_TOKEN="..."
export ADO_ORG_URL="https://dev.azure.com/office"
export ADO_PROJECT="office"
export ADO_REPOSITORY_ID="49b0c9f4-..."

# Build and run
npm run build
./bin/run-review.sh 4318818           # Posts comment to PR
./bin/run-review.sh 4318818 --dry-run # Saves report locally only
```

The `run-review.sh` script:
1. Validates required env vars.
2. Resolves the MCP config template (substitutes env vars).
3. Builds the TypeScript if not already built.
4. Creates a `reports/` directory.
5. Launches `agency copilot` with the agent prompt, MCP config, and model (`claude-sonnet-4.5`).
6. Pipes output to both stdout and a timestamped report file.

---

## 6. Delivery Mode 2: Web App

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 19.x |
| UI Library | Fluent UI v9 (`@fluentui/react-components`) | 9.73.x |
| Icons | `@fluentui/react-icons` | 2.x |
| Build Tool | Vite | 7.x |
| Backend | Express | 5.x |
| Language | TypeScript | 5.x |

### Running the Web App

```bash
# Development (two terminals)
npm run dev        # TypeScript watch compile
npm run dev:web    # Vite dev server on port 3000 (proxies /api → 3001)
npm run dev:api    # Express API on port 3001

# Production
npm run start      # Builds everything, serves on port 3001
```

In production, Express serves the Vite-built static files from `client/dist/` and handles `/api/*` routes. The frontend SPA has a catch-all fallback route.

### API Endpoints

#### Review Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/review` | Run design comparison (diff-only mode) |
| `POST` | `/api/review-full` | Run design comparison (full file content mode) |
| `GET` | `/api/reviews` | Return review history (in-memory, last 50) |

**`/api/review` and `/api/review-full` request body:**
```json
{
  "figmaUrl": "https://www.figma.com/design/ABC123/...?node-id=1234-5678",
  "figmaPat": "figd_...",
  "prId": "4318818",
  "adoOrgUrl": "https://dev.azure.com/office",
  "adoProject": "office",
  "adoRepoId": "49b0c9f4-...",
  "adoPat": "your-ado-pat"
}
```

The difference: `/api/review` uses diff lines only (just additions from the PR), while `/api/review-full` fetches the complete file content for each touched file, giving better context for feature-level review.

**Response (ReviewResult):**
```json
{
  "prTitle": "Updated color tokens for GroupedCitationPill",
  "prId": 4318818,
  "figmaUrl": "https://...",
  "figmaPageName": "POR",
  "codeFile": "/src/components/Pill.tsx, /src/components/Pill.styles.ts",
  "components": [
    {
      "componentName": "GroupedCitationPill",
      "figmaNodeId": "1234:5678",
      "figmaPath": "Page > Frame > GroupedCitationPill",
      "overallStatus": "warning",
      "findings": [
        {
          "property": "borderRadius",
          "figmaValue": "9999px (fully rounded)",
          "codeValue": "4px",
          "severity": "error",
          "component": "GroupedCitationPill",
          "message": "Figma uses fully rounded pill shape, code uses 4px"
        }
      ]
    }
  ],
  "summary": {
    "errors": 1,
    "warnings": 2,
    "info": 3,
    "passes": 5
  }
}
```

#### Figma Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/search-figma` | Search Figma files by name in a team |
| `POST` | `/api/enumerate-scenarios` | Enumerate components/variants on a page |
| `POST` | `/api/completeness-check` | Run completeness check (Figma scenarios vs code components) |
| `POST` | `/api/discover/figma-files` | List all files in a Figma team (cached 10 min) |
| `POST` | `/api/discover/figma-project-files` | List files in a specific Figma project |

#### ADO Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/discover/projects` | List ADO projects |
| `POST` | `/api/discover/repos` | List repos in a project |
| `POST` | `/api/discover/craft-prs` | Find UI-touching PRs in a project/repo |
| `POST` | `/api/discover/warm-craft-prs` | Pre-warm the craft PR cache |

#### Matching Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/discover/match` | Match craft PRs to Figma files |
| `POST` | `/api/discover/match-file-to-prs` | Find ADO PRs matching a Figma file name |

#### Validation Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/validate/figma-pat` | Validate Figma PAT (returns user info if valid) |
| `POST` | `/api/validate/ado-pat` | Validate ADO PAT |

### Server-Side Caching

The Express server maintains two in-memory caches with a **10-minute TTL**:

| Cache | Key | Contents |
|-------|-----|----------|
| `figmaFileCache` | Figma team ID | All files in the team |
| `craftPRCache` | Sorted project names joined by `\|` | All craft PRs across those projects |

### Frontend Tabs

#### 1. Design Review (`ReviewForm` + `ReviewReport`)

The primary tab. User provides:
- **Figma URL** (required) — supports both `/file/` and `/design/` URLs with optional `?node-id=`
- **PR ID** (required for code comparison)
- **Project** and **Repository ID**
- **Full file review** checkbox (default on) — uses `/api/review-full` instead of `/api/review`

The `ReviewReport` component renders:
- **Summary card** — overall status icon, PR title, Figma page name, code files, component count
- **Summary grid** — 4 colored boxes showing error/warning/info/pass counts
- **Component cards** — one per matched component, each with a findings table showing property, Figma value, code value, severity badge, and note

#### 2. Discover (`CraftPRList`)

Auto-discovery workflow:
1. User pastes a Figma project URL (or raw project ID).
2. Frontend fires two parallel requests: load Figma project files + warm ADO craft PR cache.
3. Once both complete, auto-matches each Figma file name against cached craft PRs using fuzzy scoring.
4. Displays a table: File Name | Last Modified | Matched PR (with % score) | Start Analysis button.
5. Clicking "Start Analysis" prefills the Review tab with the Figma URL, PR ID, project, and repo ID.

#### 3. Search Figma (`FigmaSearch`)

Search Figma files by name across a team's projects. User enters a team ID and query. Results show file name, project, last modified date, relevance score. Clicking a result populates the Review tab's Figma URL.

#### 4. Enumerate Scenarios (`ScenarioEnumerator`)

Visualizes a Figma page's component structure. Enter a Figma URL to see:
- **Stats** — total scenarios, component count, variant group count, page name/type
- **Component names** — all unique normalized component names as badges
- **Variant groups** — each component set with its variant properties
- **Scenario tree** — hierarchical tree view of all frames/components/variants

#### 5. Settings (`SettingsPanel`)

Configure Figma PAT and ADO PAT. Both have "Validate" buttons that call the server validation endpoints. Settings are persisted in `localStorage` under `designReviewBot_settings`. The ADO org URL is hardcoded to `https://dev.azure.com/office`.

---

## 7. Review Report Format

### What the Report Contains

Whether generated by the AI agent or the web app, a review report covers:

| Section | Contents |
|---------|----------|
| **Header** | Status icon (pass/warning/error), PR title, Figma page link |
| **Metrics Table** | PR name, Figma URL, UI files changed count, error/warning/info counts |
| **Component-by-Component Review** | For each matched component: status, per-property findings |
| **Property Findings** | For each property: Figma value, code value, severity, explanation |
| **Design System Compliance** | Token usage consistency, typography hierarchy, spacing scale, color palette |
| **Summary & Recommendations** | Prioritized list of what to fix |

### Severity Levels

| Level | Icon | Meaning | Examples |
|-------|------|---------|----------|
| Error | Red | Wrong component, missing component, major mismatch | Fully rounded in Figma but `4px` in code; completely wrong color hue |
| Warning | Yellow | Meaningful deviation | Spacing off by >4px; font size mismatch; hardcoded color instead of token |
| Info | Blue | Minor or verify-manually | Spacing 2-4px off; code uses token (verify resolution); slightly different shade |
| Pass | Green | Matches the design spec | Property values match within tolerance |

### Properties Compared

- Border radius (with special handling for fully-rounded / pill shapes)
- Gap (itemSpacing)
- Padding (including shorthand parsing)
- Font size, font weight, line height, font family
- Background color (hex comparison + token detection)
- Text color
- Width / height (maxWidth, height)

### What is NOT Flagged

- Minor pixel-rounding or rendering differences
- Text content differences (only visual properties are compared)
- Anti-aliasing / subpixel variations
- Valid alternative approaches that achieve the same visual result

---

## 8. Data Flow

### Review Flow (Web App)

```
User submits Figma URL + PR ID
         │
         ▼
    ┌─────────────────────────────────────────────────┐
    │ 1. Parse Figma URL → extract fileKey + nodeId   │
    │ 2. Fetch Figma node tree via FigmaClient        │
    │ 3. Fetch PR info + iterations via PrFetcher     │
    │ 4. Get latest iteration changes                 │
    │ 5. Filter to UI-relevant files                  │
    │ 6. Fetch full file content (or diff lines)      │
    └──────────────────────┬──────────────────────────┘
                           │
                           ▼
    ┌─────────────────────────────────────────────────┐
    │ For each code file:                             │
    │  a. deriveSearchTerms(path, content)            │
    │  b. findMatchingComponents(figmaTree, terms)    │
    │  c. parseCodeStyles(content)                    │
    │  d. For each matched Figma component:           │
    │     - extractComponentSpec(figmaNode)            │
    │     - compareComponent(name, figmaSpec, styles)  │
    │     → produces ComparisonFinding[]              │
    └──────────────────────┬──────────────────────────┘
                           │
                           ▼
    ┌─────────────────────────────────────────────────┐
    │ Aggregate:                                      │
    │  - Compute per-component overallStatus          │
    │  - Compute summary counts                       │
    │  - Build ReviewResult                           │
    │  - Store in review history (in-memory)          │
    │  - Return JSON to frontend                      │
    └─────────────────────────────────────────────────┘
```

### Discovery + Auto-Match Flow

```
User pastes Figma project URL
         │
         ├──────────────────────────────────┐
         ▼                                  ▼
  Fetch Figma project files          Warm craft PR cache
  (GET /projects/:id/files)          (scan ADO projects for
                                      UI-touching PRs)
         │                                  │
         └──────────┬───────────────────────┘
                    ▼
           For each Figma file:
             fuzzyScore(figmaFileName, prComponentNames)
             fuzzyScore(figmaFileName, prTitle)
                    │
                    ▼
           Display table with matches
           "Start Analysis" → prefill Review tab
```

---

## 9. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Two delivery modes** (MCP + Web) | MCP enables AI-assisted review with visual screenshot analysis; Web enables quick manual checks without an AI agent |
| **Full file content** (`/api/review-full`) | Diff-only mode misses surrounding context; full file mode lets the comparison engine see all style definitions, not just changed lines |
| **Heuristic POR page detection** | Figma files often have many pages (exploration, WIP, archived); keyword scoring reliably finds the final design page |
| **Multi-tier fuzzy matching** | Component names in Figma vs code rarely match exactly; cascading exact → normalized → fuzzy → substring catches most real mappings |
| **Pixel-threshold severity** | Not all mismatches are equal; >4px spacing difference is a warning, ≤4px is informational, exact match is a pass |
| **Idempotent PR comments** | Re-running the review shouldn't create duplicate comments; the `persistentId` pattern ensures upsert behavior |
| **In-memory caching** (10-min TTL) | Figma team file lists and craft PR discovery are expensive; caching avoids redundant API calls during a review session |
| **p-limit concurrency** | Both Figma and ADO APIs have rate limits; bounded concurrency prevents hitting them |
| **Token detection** (not just hex comparison) | Code often uses `tokens.colorNeutralBackground1` instead of raw hex; the comparison engine flags these as "info: verify it resolves to X" rather than false-positive mismatches |

---

## 10. Dependencies

### Backend (`package.json`)

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework (stdio transport) |
| `axios` | HTTP client for Figma REST API |
| `azure-devops-node-api` | Official ADO REST API client |
| `express` | HTTP server for web mode |
| `cors` | CORS middleware |
| `p-limit` | Promise concurrency limiter |
| `parse-diff` | Unified diff parser |
| `zod` | Schema validation for MCP tool inputs |

### Frontend (`client/package.json`)

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | UI framework |
| `@fluentui/react-components` | Fluent UI v9 component library |
| `@fluentui/react-icons` | Fluent UI icon set |
| `vite` | Build tool and dev server |
| `@vitejs/plugin-react` | Vite React plugin |

---

## 11. Setup Guide

### Prerequisites

- Node.js ≥ 18
- A Figma personal access token (PAT)
- An Azure DevOps personal access token (with Code read scope)
- The ADO organization URL, project name, and repository ID

### Installation

```bash
git clone <repo-url>
cd prism

# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..

# Build
npm run build
cd client && npx vite build && cd ..
```

### Running

```bash
# Option 1: Docker Compose (recommended — one command)
cp .env.example .env   # Edit with your credentials
docker-compose up

# Option 2: Web app (interactive, local dev)
npm run start
# Open http://localhost:3001
# Go to Settings tab → enter Figma PAT and ADO PAT

# Option 3: AI agent (automated)
export AZURE_PERSONAL_ACCESS_TOKEN="..."
export FIGMA_API_TOKEN="..."
export ADO_ORG_URL="https://dev.azure.com/myorg"
export ADO_PROJECT="myproject"
export ADO_REPOSITORY_ID="repo-guid"
./bin/run-review.sh <PR_ID> [--dry-run]

# Option 4: MCP server (for custom agent integration)
npm run start:mcp
```

### Storage

Prism supports three storage backends, configured via the `STORAGE_BACKEND` environment variable:

| Backend | Config Value | Description |
|---------|-------------|-------------|
| **File Storage** (default) | `file` | Persistent JSON files in `./data/`. Survives restarts, no external dependencies. |
| **Memory Storage** | `memory` | In-process only. Data lost on restart. Useful for testing. |
| **Azure Table Storage** | `azure-table` | For Azure cloud deployments. Requires `AZURE_STORAGE_CONNECTION_STRING`. |

### Docker

The project includes a multi-stage `Dockerfile` and `docker-compose.yml` for one-command deployment:

```bash
docker-compose up        # Build and start with persistent volumes
docker-compose up -d     # Run in background
```

Named volumes (`prism-data`, `prism-reports`) ensure data and reports persist across container restarts.
