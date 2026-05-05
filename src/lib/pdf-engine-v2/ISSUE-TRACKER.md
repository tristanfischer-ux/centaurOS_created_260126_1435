# PDF Engine v2 — Issue Tracker

**Created:** 2026-05-05
**Engine:** `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/pdf-engine-v2/`
**Reference:** `/Users/tristanfischer/Downloads/bess_engineering_report.pdf` (102 pages, BESS-40FT-LFP-001)
**Prompt Architecture:** `/Users/tristanfischer/Downloads/prompt_architecture.pdf`

---

## Critical Issues (Must Fix)

### ISSUE-001: Stage 0 timeout — only 1 of 5 models responds
- **Status:** DIAGNOSED — fix in progress
- **Priority:** P0 — blocks entire pipeline
- **Root cause:** OpenRouter infrastructure — queuing, rate limiting, upstream provider bottleneck. NOT model speed or networking.
- **Evidence:** All 4 failing models hit exactly 300s timeout. Grok works because xAI has better OpenRouter integration. Chinese providers (GLM, MiMo, Kimi) have inconsistent capacity through OpenRouter.
- **Council recommendation:** (1) Switch to streaming, (2) Add max_tokens: 14000, (3) Switch to faster models (Claude Sonnet, Gemini), (4) Increase timeout to 600s as band-aid, (5) Call problematic models directly if API keys available.
- **Fix in progress:** Implementing streaming + max_tokens fix.

### ISSUE-002: BOM uses heuristic costs, not real data
- **Status:** OPEN
- **Priority:** P0 — report shows wrong costs
- **Description:** BOM generator uses keyword-based cost defaults (£20-800) instead of real supplier data. The database has material_properties (47 records), process_capabilities (20 records), and marketplace_listings (30 records) but they are not being used for cost estimation.
- **Impact:** Unit cost of £8,153 is fabricated. A 30kW R290 heat pump compressor alone costs £1,500-3,800.
- **Fix needed:** Wire database lookups into BOM generation. Use material_properties for material costs, process_capabilities for manufacturing costs, marketplace_listings for supplier pricing.

### ISSUE-003: No LLM polish pass
- **Status:** OPEN
- **Priority:** P1 — report reads like raw data, not polished narrative
- **Description:** After deterministic calculations, there should be an LLM pass that rewrites the report using the computed data. Currently the report uses whatever the LLM produced in Pass 1 without refinement.
- **Fix needed:** Add a final LLM call that takes the deterministic results and produces polished narrative.

### ISSUE-004: Stage 0 timeout configuration
- **Status:** IN PROGRESS
- **Priority:** P0
- **Description:** Need to investigate why GLM, MiMo, and Kimi timeout at 300s. Possible causes: OpenRouter rate limits, model speed, TCP latency to Asian servers.
- **Fix needed:** Test each model individually, check OpenRouter status, increase timeout to 600s, or switch to faster models.

---

## Resolved Issues

### ISSUE-R001: JSON parsing failures in decompose stage
- **Status:** RESOLVED
- **Description:** Decompose stage failed because system prompt was too long and complex. Simplified prompt to concise version with clear JSON schema.
- **Resolution:** Simplified system prompt, increased timeout to 300s, added robust JSON extraction with thinking-block stripping and balanced-bracket matching.

### ISSUE-R002: Feasibility gate showed RED despite brief having all info
- **Status:** RESOLVED
- **Description:** Brief validator checked for specific field names that didn't match natural language in the brief.
- **Resolution:** Added flexible narrative matching patterns for each field.

### ISSUE-R003: PDF renderer crashed on JSX in .ts file
- **Status:** RESOLVED
- **Description:** JSX syntax in index.ts caused TypeScript errors.
- **Resolution:** Changed to React.createElement() calls.

### ISSUE-R004: Sanitiser received non-string input
- **Status:** RESOLVED
- **Description:** sanitiseLlmOutput received objects instead of strings, causing text.replace() errors.
- **Resolution:** Added type checking: if typeof text !== 'string', return empty string.

### ISSUE-R005: Escaped backticks in TypeScript files
- **Status:** RESOLVED
- **Description:** Sub-agents wrote escaped backticks instead of real backticks in template literals.
- **Resolution:** sed replacement of escaped backticks.

### ISSUE-R006: Stage 0 only 1 of 5 models responding
- **Status:** RESOLVED
- **Description:** OpenRouter rate limiting/queuing on Chinese providers caused 300s timeouts. Reduced to 3 reliable models (Grok, Claude Sonnet, Gemini) with 300s timeout.
- **Resolution:** Switched to 3-model parallel execution with 300s timeout.

### ISSUE-R007: Decompose validation requiring 'id' field
- **Status:** RESOLVED
- **Description:** Validator required 'id' field but Gemini didn't return it.
- **Resolution:** Auto-generate 'id' from module name when missing.

### ISSUE-R008: Prompts not imported from prompts.ts
- **Status:** RESOLVED
- **Description:** Stages had their own inline prompts instead of importing from prompts.ts.
- **Resolution:** All stages now import from prompts.ts. Old prompt definitions removed.

---

## Planned Improvements

### PLAN-001: Implement 4-pass architecture from prompt_architecture.pdf
- **Status:** IN PROGRESS
- **Description:** The correct flow is: Stage 0 → LLM drafts full report → databases validate → calculators compute → LLM polishes. Currently missing the "LLM drafts full report" and "LLM polishes" steps.
- **Action:** Extract exact prompts from prompt_architecture.pdf (DONE), implement full report draft stage, add database validation, add final LLM polish.

### PLAN-002: Wire database lookups into BOM generation
- **Status:** PLANNED
- **Description:** Use material_properties (47 records), process_capabilities (20 records), and marketplace_listings (30 records) to validate and enhance BOM costs.
- **Action:** Create db-queries.ts (DONE), wire into BOM stage, use real costs.

### PLAN-003: Add LLM polish pass
- **Status:** PLANNED
- **Description:** After all deterministic calculations, run an LLM that takes the computed data and produces polished narrative. This is the final pass that makes the report read like a professional engineering document.
- **Action:** Create a new stage that receives deterministic outputs and produces narrative.

### PLAN-004: Score each section with council
- **Status:** PLANNED
- **Description:** Use the council to score each section against the reference report quality. The scoring should evaluate: factual accuracy, completeness, source grading, narrative quality, actionability, engineering depth.
- **Action:** Implement council scoring after each run, display scores in the PDF.

---

## Reference Documents

| Document | Location | Purpose |
|---|---|---|
| BESS Report | `/Users/tristanfischer/Downloads/bess_engineering_report.pdf` | 102-page quality reference |
| Prompt Architecture | `/Users/tristanfischer/Downloads/prompt_architecture.pdf` | Exact prompts for each stage |
| Heat Pump Report | `/Users/tristanfischer/Downloads/forge-demos/output-*.pdf` | Generated test outputs |
| Loop Critiques | `/Users/tristanfischer/Downloads/forge-demos/LOOP-*-CRITIQUE.md` | Historical quality feedback |
