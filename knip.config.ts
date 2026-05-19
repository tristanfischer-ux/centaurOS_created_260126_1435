/**
 * @file knip.config.ts — dead-code detection for the PDF engine.
 *
 * The 2026-05-19 audit confirmed the production PDF engine runs from a
 * standalone script chain (NOT the Next.js app routes). Knip's defaults only
 * treat Next.js routes as entry points, so without this config it would
 * misreport every file in the production chain as "unused". This file
 * enumerates the 4 real production entry points so knip can compute true
 * reachability:
 *
 *   1. `scripts/serial-design-chain-v2.tsx`         — Mac Studio worker entry
 *   2. `scripts/estimate-missing-prices.tsx`         — Engine B sub-process
 *   3. `scripts/enrich-state-with-reference-anchor.tsx` — Engine C sub-process
 *   4. `scripts/render-minimal-pdf.tsx`              — PDF renderer
 *
 * Anything under `src/lib/pdf-engine-v2/` not transitively reachable from one
 * of these is genuinely dead code from production's perspective. (Tests are
 * separate — knip respects `*.test.ts` glob automatically.)
 *
 * To use:
 *   npx knip --no-progress    # full repo
 *   npx knip --include files  # only the orphan-files report
 */

import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  // Next.js plugin still applies for the app routes; PDF engine entries are
  // added via the explicit `entry` array below.
  entry: [
    // PDF engine v2 — the ACTUAL production entry points.
    'scripts/serial-design-chain-v2.tsx',
    'scripts/estimate-missing-prices.tsx',
    'scripts/enrich-state-with-reference-anchor.tsx',
    'scripts/enrich-state-with-suppliers.tsx',  // 2026-05-19 v5: Engine D
    'scripts/render-minimal-pdf.tsx',
    // Diagnostic CLI (read-only but consumes engine data).
    'scripts/diagnose-run.tsx',
  ],
  project: [
    // Constrain dead-code analysis to the engine code paths. Other folders
    // (e.g. `app/`, `e2e/`, `report-compiler-prototype/`) are separate workstreams
    // and shouldn't pollute the engine reachability report.
    'src/lib/pdf-engine-v2/**/*.{ts,tsx}',
    'scripts/serial-design-chain-v2.tsx',
    'scripts/estimate-missing-prices.tsx',
    'scripts/enrich-state-with-reference-anchor.tsx',
    'scripts/enrich-state-with-suppliers.tsx',
    'scripts/render-minimal-pdf.tsx',
    'scripts/diagnose-run.tsx',
    // 2026-05-19 v5: Engine D's transitive dependency helper.
    'scripts/supplier-enrichment/**/*.{ts,tsx}',
  ],
  ignore: [
    // Test files are reachable via their runner, not the production entry.
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/__tests__/**',
    // Migrations are run by hand, not imported.
    'src/lib/pdf-engine-v2/radical/migrations/**',
    // RL iterators are experimental tooling, not production.
    'src/lib/pdf-engine-v2/*-rl-iterate.ts',
    'src/lib/pdf-engine-v2/feasibility-full-rl.ts',
    'src/lib/pdf-engine-v2/run-brief-only.ts',
    'src/lib/pdf-engine-v2/score-brief-only.ts',
    'src/lib/pdf-engine-v2/pure-search-feasibility-test.ts',
    'src/lib/pdf-engine-v2/test-bom-v2.ts',
    'src/lib/pdf-engine-v2/test-sanitiser.js',
    'src/lib/pdf-engine-v2/test-v3-render.ts',
    'src/lib/pdf-engine-v2/eval-harness/**',
    // PDF-rendering React components imported dynamically by the renderer
    // (knip can't follow string-keyed renderModule maps reliably).
    'src/lib/pdf-engine-v2/stages/pdf-components/**',
  ],
}

export default config
