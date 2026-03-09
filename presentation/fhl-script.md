# Prism — FHL Presentation Script

**Total runtime target: ~4–5 minutes**

---

## SLIDE 1 — Title (10s)

### Visual
- Large centered title: **Prism**
- Subtitle: *Automated design integrity reviews for Figma + Azure DevOps*
- Your name and team at the bottom

### Voiceover
> "Hey everyone, I'm Aadith. This is Prism — an automated tool that catches design-to-code drift by comparing Figma specs against pull request code."

---

## SLIDE 2 — The Problem (30s)

### Visual
- Side-by-side mockup:
  - **Left**: Figma frame showing a component with `borderRadius: 9999px` (pill shape), `gap: 12px`, `fontSize: 14px`
  - **Right**: Shipped UI with `borderRadius: 4px`, `gap: 8px`, `fontSize: 13px`
- Red callout lines pointing to the differences
- Caption: *"Spot the differences? Neither did we — until production."*

### Voiceover
> "Here's a problem every design system team knows. A designer specs a pill-shaped button with specific spacing and typography in Figma. A developer implements it — gets it 90% right — but the border radius is 4px instead of fully rounded, the gap is off by 4 pixels, the font size is one pixel smaller. Individually these are tiny. But they compound. And nobody catches them until a designer opens the shipped product and says 'that's not what I designed.'"

---

## SLIDE 3 — Why This Matters (20s)

### Visual
- Three stat callout boxes:
  - **Hours**: Manual design reviews take 30–60 min per PR
  - **Scale**: Fluent UI teams ship hundreds of UI PRs per month
  - **Trust**: Every uncaught drift erodes designer-developer trust
- Subtitle: *"Design QA doesn't scale with manual review"*

### Voiceover
> "At the scale Microsoft operates — hundreds of UI-touching PRs across Fluent UI teams — manual design review just doesn't scale. Each review takes 30 to 60 minutes. Most get skipped. And every time drift ships, it chips away at the trust between designers and developers."

---

## SLIDE 4 — What I Set Out To Do (20s)

### Visual
- Goal statement in large text: *"Build an automated safety net that catches design drift before it merges"*
- Three approach pillars below:
  1. Extract design tokens from Figma
  2. Parse style values from PR code
  3. Compare property-by-property and flag mismatches

### Voiceover
> "I wanted to build an automated safety net — not a grading tool, a safety net — that sits between Figma and your pull request and catches meaningful design drift before it merges. The approach: extract tokens from Figma, parse style values from the code, and do property-by-property comparison with smart severity levels."

---

## SLIDE 5 — How It Works (30s)

### Visual
- Three-step horizontal flow diagram:
  - **Step 1**: Figma icon → "Extract design tokens" (colors, spacing, typography, border radius, layout)
  - **Step 2**: Azure DevOps icon → "Parse PR code" (full file content from UI-relevant files: .tsx, .css, .styles.ts)
  - **Step 3**: Prism logo → "Compare & report" (property-by-property findings with severity: error / warning / info / pass)
- Below the flow: small text showing the 9 properties compared

### Voiceover
> "The flow is simple. Step one: Prism calls the Figma API, detects the Plan-of-Record page using heuristic keyword scoring, and extracts structured design tokens — colors, spacing, typography, border radius, layout properties. Step two: it connects to Azure DevOps, fetches the full file content for every UI-relevant file touched by the PR. Step three: it does a component-level comparison — fuzzy-matching Figma components to code components, then checking nine specific properties. Each finding gets a severity: error for major mismatches like a pill shape rendered as a square, warning for meaningful drift, info for minor differences."

---

## SLIDE 6 — Demo Transition (5s)

### Visual
- Dark background, centered text: **"Let me show you."**

### Voiceover
> "Let me show you what this looks like."

---

## DEMO SECTION (~90–120s)

### Screen
Live Prism Web UI at `localhost:3001`

### Step-by-step narration

#### Opening the app (10s)
**Action**: Show the Prism web UI — the Review page is visible with the input card.
> "This is the Prism web app. It's built with React and Fluent UI v9 on the frontend, Express on the backend. The interface is simple — two inputs."

#### Entering inputs (15s)
**Action**: Paste a Figma URL into the first field. Type a PR ID into the second field.
> "I paste in a Figma design URL — this one points to a specific component on the POR page. And I enter the Azure DevOps pull request ID for the code that implements this component."

#### Running the review (15s)
**Action**: Click "Run Review". Show the loading spinner.
> "I hit Run Review. Behind the scenes, Prism is calling the Figma API to fetch the design spec, connecting to Azure DevOps to pull the full source files from the PR, then running the comparison engine."

#### Results — summary (20s)
**Action**: Results appear. Point to the summary card at the top showing overall status, PR title, Figma page name, and the summary grid (errors/warnings/info/passes).
> "Here's the result. At the top you can see the overall status, the PR title, which Figma page it compared against, and a summary — in this case we have a couple of warnings and several passes. The summary grid gives you a quick read: how many errors, warnings, info findings, and passes."

#### Results — component detail (25s)
**Action**: Scroll to a component card. Point to the findings table showing property, Figma value, code value, severity badge, and note.
> "Below that, each matched component gets its own card. Here's where it gets specific. You can see property-by-property: border radius — Figma says 8px, code says 8px, that's a pass. Gap — Figma has 12px, code has 8px, that's a warning with a note saying it differs by 4 pixels. Background color — the code uses a design token, so Prism flags it as info and says 'verify this token resolves to the Figma value.' This level of specificity is what makes it actionable."

#### Highlighting a key finding (15s)
**Action**: Point to an error-level finding if one exists, or a warning.
> "And when something is really wrong — like a fully-rounded pill shape in Figma but a 4px border radius in code — that's an error. It tells you exactly what to fix and why."

#### Full report link (10s)
**Action**: Click the "Full Report" button to show the detailed analysis report page.
> "You can also open the full analysis report for a more detailed view, including variant coverage — whether the code handles all the states and sizes the designer specified in Figma."

---

## SLIDE 7 — What It Catches (20s)

### Visual
- Table with two columns: **Property** and **How It Compares**

| Property | How It Compares |
|----------|----------------|
| Border Radius | Figma cornerRadius vs code borderRadius (special pill-shape detection) |
| Gap | Figma itemSpacing vs code gap |
| Padding | Figma padding vs shorthands.padding() |
| Font Size | Figma text size vs code fontSize |
| Font Weight | Figma weight vs code fontWeight (incl. named weights) |
| Line Height | Figma lineHeightPx vs code lineHeight |
| Background Color | Figma fill hex vs code backgroundColor (token-aware) |
| Text Color | Figma text fill vs code color (token-aware) |
| Width / Height | Figma bounding box vs code maxWidth/height |

- Footer: *"Severity thresholds: >4px → warning, ≤4px → info, exact → pass"*

### Voiceover
> "Prism compares nine specific properties. Spacing — gap, padding. Typography — font size, weight, line height. Colors — background and text, with awareness of design tokens so it doesn't false-positive when code uses `tokens.colorNeutralBackground1` instead of a raw hex value. And geometry — border radius with special handling for pill shapes, plus width and height. Each has tuned severity thresholds."

---

## SLIDE 8 — What Worked (25s)

### Visual
- Three bullet cards with green checkmarks:
  1. **Heuristic comparison engine** — Property-by-property comparison with tuned severity thresholds catches real drift without drowning in noise
  2. **Figma API integration** — POR page detection, scenario enumeration, and design token extraction work reliably across real Fluent UI files
  3. **Two delivery modes** — Both an AI agent (MCP + Claude) for deep visual review and a web app for quick manual checks

### Voiceover
> "What worked well. First, the heuristic comparison engine — tuned severity thresholds mean it catches real issues without drowning developers in noise. A 2-pixel spacing difference is info, not a warning. Second, the Figma integration — the POR page detector and token extractor work reliably on real Fluent UI files. Third, having two modes: an AI agent that can do deep visual analysis with screenshots, and a web app for quick spot checks."

---

## SLIDE 9 — What Didn't Work + Learnings (30s)

### Visual
- Three bullet cards with yellow warning icons:
  1. **Regex-based code parsing** — Misses dynamic styles, computed values, and theme indirection. A proper AST parser would catch more.
  2. **Component matching** — Fuzzy name matching works ~80% of the time, but Figma names and code names often diverge significantly
  3. **Token resolution** — Can't resolve `tokens.colorNeutralBackground1` to its actual hex value, so color comparisons are often "info: verify manually"
- Key insight box at the bottom: *"The 80/20 was right — heuristics catch most real drift. The remaining 20% needs AI visual reasoning."*

### Voiceover
> "What didn't work — and I want to be honest here. The code parser is regex-based, which means it misses dynamic styles and computed values. A proper AST parser would be more robust. Component matching is fuzzy — Figma calls something 'Citation Pill' and the code calls it 'GroupedCitationPillContent' — it works about 80% of the time but not always. And token resolution — when the code uses a design token instead of a hex color, Prism can't resolve what that token actually maps to, so it just says 'verify manually.' The key learning: heuristics catch most real drift, but that last 20% genuinely needs AI visual reasoning on top."

---

## SLIDE 10 — Wrap-Up (20s)

### Visual
- Large takeaway text: *"Design drift is a solvable problem at scale"*
- Three forward-looking bullets:
  - Integrate into CI/CD pipeline as a PR check
  - Add AST-based code parsing for better accuracy
  - Expand to more design systems beyond Fluent UI
- Final line: *"Prism — a safety net for design integrity"*

### Voiceover
> "The takeaway: design drift is a real problem, and it's solvable at scale. Prism already works as a manual tool and an AI agent — the next step is CI/CD integration so every UI PR gets an automated design check. If this scales across Fluent UI teams, that's thousands of hours of manual review replaced with automated, actionable feedback. Thanks — happy to take questions."

---

## Timing Summary

| Section | Duration |
|---------|----------|
| Slide 1 — Title | 10s |
| Slide 2 — Problem | 30s |
| Slide 3 — Why This Matters | 20s |
| Slide 4 — What I Set Out To Do | 20s |
| Slide 5 — How It Works | 30s |
| Slide 6 — Demo Transition | 5s |
| Demo Section | 110s |
| Slide 7 — What It Catches | 20s |
| Slide 8 — What Worked | 25s |
| Slide 9 — Didn't Work + Learnings | 30s |
| Slide 10 — Wrap-Up | 20s |
| **Total** | **~5 min 20s** |

> **Note**: Demo section has the most flex. Cut the "Full Report" walkthrough (~10s) and tighten transitions to hit 4:30–5:00. Practice the demo narration 2–3 times to smooth out pacing.

## Demo Prep Checklist

- [ ] Have Prism running locally (`npm run start`)
- [ ] Pre-validate that your Figma PAT and ADO PAT are configured in Settings
- [ ] Pick a real Figma URL + PR ID that produces interesting findings (at least one warning and one pass)
- [ ] Do a dry run of the analysis before recording to confirm it works and note the ~10s load time
- [ ] Have the Figma file open in a browser tab in case you want to briefly flash the design
- [ ] Screen recording: 1920x1080, browser zoomed to 110% for readability
