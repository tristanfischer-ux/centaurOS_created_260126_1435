/**
 * chain-llm-calls-must-be-ledgered.test.ts
 *
 * DETERMINISM #86 UNIVERSAL ENFORCEMENT (2026-07-07, Tristan's decision: determinism must be
 * UNIVERSAL + REPRODUCIBLE — same brief re-run → identical scorecard via a persistent REPLAY
 * LEDGER of recorded LLM decisions, NOT deterministic-by-construction).
 *
 * THE ROOT this guard closes permanently: same-brief non-determinism comes from LLM calls
 * returning different output on identical input. Every chain-path OpenRouter call site that does
 * NOT consult the persistent design-stage ledger (scripts/lib/design-stage-cache.ts —
 * cachedDesignStage / readDesignStageCache, stored under out/.design-cache/) is a determinism
 * hole: on a same-brief re-run it re-rolls and forks the design. Fixing them one call site at a
 * time is a treadmill. This test is the universal backstop: a NEW chain-path file that calls
 * OpenRouter directly, without routing through the ledger, FAILS THE BUILD — so the treadmill
 * cannot recur.
 *
 * HOW IT WORKS (mirrors chain-must-be-db-only.test.ts): scan every .ts/.tsx under the chain-path
 * roots for a raw OpenRouter chat-completions fetch. Every such file must be classified in exactly
 * one registry below:
 *   • LEDGERED_CHAIN_FILES — routes its OpenRouter call through the ledger. The file MUST also
 *     contain its declared ledger token (so ripping the ledger wrap out re-reds this test).
 *   • WRAPPED_AT_CALLSITE — the file has a raw fetch but the CHAIN wraps the whole call in the
 *     ledger at the call site (e.g. runResearchSynthesis is wrapped in cachedDesignStage('research')
 *     inside serial-design-chain-v2; runPhysicsCritic is wrapped by runPhysicsCriticCached). We
 *     assert the NAMED wrapping still exists in the chain file.
 *   • KNOWN_UNLEDGERED_CHAIN_GAPS — chain-path files still un-ledgered, with an explicit reason +
 *     slice impact. This is the HONEST coverage ledger (mirrors CLAUDE.md's UNPROVEN_GATES): the
 *     guard's intent is "no NEW un-registered call site", while these are the tracked remainder.
 *   • STANDALONE_NON_CHAIN — files with an OpenRouter fetch that are NOT reachable from a chain
 *     run (Next.js app routes, unrelated server actions, legacy RL harnesses, one-off CLIs, tests).
 *
 * A chain-path file with an OpenRouter fetch that is in NONE of these lists FAILS: the author must
 * either route it through the ledger (cachedDesignStage / callLlm / callFastExtract) and register
 * it, or justify it in KNOWN_UNLEDGERED_CHAIN_GAPS / STANDALONE_NON_CHAIN with a reason.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const REPO_ROOT = resolve(__dirname, '../../../../..')

// Roots the chain's own code lives under. We scan these for OpenRouter call sites.
const CHAIN_PATH_ROOTS = [
  'scripts',
  'src/lib/pdf-engine-v2',
]

// A raw OpenRouter chat-completions call (the determinism-sensitive surface).
const OPENROUTER_FETCH = /fetch\(\s*['"]https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/

// Any of these tokens present in a file means it consults the persistent ledger itself.
const LEDGER_TOKENS = [
  'cachedDesignStage',
  'readDesignStageCache',
  'designStageCacheKey',
]

// ── 1. Files that route their OWN OpenRouter call through the ledger ────────────
// value = a token that MUST co-occur (proves the ledger wrap is still present).
const LEDGERED_CHAIN_FILES: Record<string, string> = {
  // the chain's callLlm choke point + inline cachedDesignStage wraps (glm-code-fix, reviewPatch,
  // physics-critic-autocorrect llm) all funnel through readDesignStageCache/cachedDesignStage.
  'scripts/serial-design-chain-v2.tsx': 'readDesignStageCache',
  // callFastExtract — the high-volume fast-extraction choke point (emitter-completion → identity).
  'src/lib/pdf-engine-v2/lib/openrouter-models.ts': 'readDesignStageCache',
  // Engine-B: class classification + unknown-class price estimate (feed the price slice).
  'scripts/estimate-missing-prices.tsx': 'cachedDesignStage',
  // physics-repair model call (mutates part identity).
  'src/lib/pdf-engine-v2/radical/physics-repair.ts': 'readDesignStageCache',
}

// ── 2. Files whose call is wrapped at the CHAIN call site (not in-file) ─────────
// value = a token that MUST still be present IN THE CHAIN FILE proving the wrap.
const WRAPPED_AT_CALLSITE: Record<string, { chainFile: string; token: string }> = {
  // runResearchSynthesis is wrapped in cachedDesignStage({ stage: 'research', ... }).
  'src/lib/pdf-engine-v2/stages/1-research.ts': {
    chainFile: 'scripts/serial-design-chain-v2.tsx', token: "stage: 'research'",
  },
  // runPhysicsCritic is wrapped by runPhysicsCriticCached (out/.critique-cache).
  'src/lib/pdf-engine-v2/radical/physics-critic.ts': {
    chainFile: 'scripts/serial-design-chain-v2.tsx', token: 'runPhysicsCriticCached',
  },
  // universal-repair's raw fetch is a fallback; the chain always injects llmCaller: callLlm.
  'src/lib/pdf-engine-v2/radical/universal-repair.ts': {
    chainFile: 'scripts/serial-design-chain-v2.tsx', token: 'llmCaller',
  },
}

// ── 3. Chain-path files with their OWN persistent content-hash cache (not the ──
//        design-stage ledger, but an equivalent disk/DB-backed replay store). ──
// value = a token proving that cache is present.
const OWN_PERSISTENT_CACHE: Record<string, string> = {
  'scripts/lib/benchmark-expectation.ts': 'benchmarkCacheKey',
  'src/lib/pdf-engine-v2/brief-expander.ts': 'sha1',
  'scripts/lib/orchestrator/generic/tool-creation-pass.ts': 'loadProposalForClass',
  'scripts/lib/orchestrator/generic/tool-generator.ts': 'duty_hash',
  'scripts/lib/orchestrator/generic/bootstrap-class-graph.ts': 'latestCandidate',
  'scripts/lib/orchestrator/generic/bootstrap-tool-plan.ts': 'latestCandidate',
  'scripts/lib/orchestrator/generic/relevance-sweep.ts': 'from_cache',
}

// ── 4. Chain-path files still UN-LEDGERED — the honest tracked remainder ────────
// Each entry documents WHY it is not yet a live reproducibility risk (prose-only / inert /
// skipped-by-default / post-chain / not-in-the-determinism-slice). Closing these is standing work.
const KNOWN_UNLEDGERED_CHAIN_GAPS: Record<string, string> = {
  // prose only (module narrative / conflict explanation) — NOT in the identity/quantity/price slice
  'src/lib/pdf-engine-v2/radical/design-decisions.ts': 'prose (conflict explanation); not in the determinism slice',
  'src/lib/pdf-engine-v2/radical/module-paragraph-llm.ts': 'prose (module narrative); not in the determinism slice',
  // currently inert: Stage 10.6 throws on a missing mpn-shape module before these fire; would feed
  // identity+prices once that pre-existing breakage is fixed — route it then.
  'src/lib/pdf-engine-v2/radical/part-verification.ts': 'Stage 10.6 currently throws (missing mpn-shape) → inert; route when re-enabled',
  // disabled by default (CHAIN_ENABLE_COST_REPAIR unset → deterministic pricing is authoritative)
  'scripts/cost-repair.tsx': 'disabled by default (deterministic pricing authoritative); enable-flag only',
  // supplier enrichment — supplier fields are not in the determinism slice; run skips it by default
  'scripts/enrich-state-with-suppliers.tsx': 'supplier fields; not in the determinism slice; CHAIN_SKIP_SUPPLIERS by default in reproducibility runs',
  // post-chain background enrichment (CHAIN_SKIP_BACKGROUND_ENRICHMENT in reproducibility runs)
  'scripts/lib/background-enrichment.ts': 'post-chain enrichment; not in the determinism slice',
  // Blender scene python generation — geometry render, not the identity/quantity/price slice
  'scripts/generate-blender-scene.tsx': 'blender scene script; not in the determinism slice',
  // dead function proposeMissingScaleMetric — chain-path module but this call site is unreferenced
  'scripts/lib/orchestrator/envelope-vector.ts': 'proposeMissingScaleMetric is dead code (zero call sites)',
}

// ── 5. Files NOT reachable from a chain run ─────────────────────────────────────
const STANDALONE_NON_CHAIN = new Set<string>([
  // legacy v1 chain (dead — superseded by serial-design-chain-v2.tsx)
  'scripts/serial-design-chain.tsx',
  'scripts/serial-flash-grok.tsx',
  // one-off CLIs / audits / tests not invoked during a chain run
  'scripts/audit-state-semantic.tsx',
  'scripts/audit-tools.ts',
  'scripts/author-blender-scene.tsx',
  'scripts/brief-prose-validate-repair.tsx',
  'scripts/classify-pretraining-parts.tsx',
  'scripts/cleanup-web-fallback-canonical-names.ts',
  'scripts/cross-module-validate-repair.tsx',
  'scripts/flash-audit-iter62.tsx',
  'scripts/ground-truth-parts-test.tsx',
  'scripts/holistic-review-repair.tsx',
  'scripts/ingest/enrich-new-suppliers.ts',
  'scripts/ingest/ingest-priced-principals.ts',
  'scripts/lib/illustration-i2i.ts',
  'scripts/run-self-audit-standalone.tsx',
  'scripts/precommit-review.ts',
  'scripts/seed-character-registry.ts',
  'scripts/generate-investor-section.tsx',
  'scripts/test-k10-prompt-addenda-multiemit.tsx',
  'scripts/test-k10-prompt-addenda-rerun.tsx',
  'scripts/test-roundtrip-diff.tsx',
  // legacy RL harnesses (only reachable via runBriefGeneration/decompose/feasibility — the chain
  // uses only runBriefParsing) + council-scorer + score-brief-only + pure-search test
  'src/lib/pdf-engine-v2/brief-rl-iterate.ts',
  'src/lib/pdf-engine-v2/council-scorer.ts',
  'src/lib/pdf-engine-v2/decompose-rl-iterate.ts',
  'src/lib/pdf-engine-v2/feasibility-full-rl.ts',
  'src/lib/pdf-engine-v2/feasibility-rl-iterate.ts',
  'src/lib/pdf-engine-v2/pure-search-feasibility-test.ts',
  'src/lib/pdf-engine-v2/score-brief-only.ts',
  'src/lib/pdf-engine-v2/stage-rl-council.ts',
  'src/lib/pdf-engine-v2/stage-rl-iterate.ts',
  // type-only references in types.ts — never called at runtime
  'src/lib/pdf-engine-v2/radical/brief-overview-llm.ts',
  'src/lib/pdf-engine-v2/radical/fmea-risk-llm.ts',
  'src/lib/pdf-engine-v2/radical/regulatory-prose-llm.ts',
  // knowledge writeback + investor-section (writeback tools / non-slice narrative)
  'src/lib/pdf-engine-v2/lib/knowledge/spec-documents-writeback.ts',
  'src/lib/pdf-engine-v2/lib/knowledge/specs-writeback.ts',
  'src/lib/pdf-engine-v2/lib/knowledge/products-writeback.ts',
  'src/lib/pdf-engine-v2/lib/knowledge/standards-writeback.ts',
  'src/lib/pdf-engine-v2/lib/investor-section.ts',
])

// ── Scan ────────────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[]): void {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.next' || name === 'out' || name.startsWith('.')) continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
}

function chainPathFilesWithOpenRouterCall(): string[] {
  const all: string[] = []
  for (const root of CHAIN_PATH_ROOTS) walk(resolve(REPO_ROOT, root), all)
  const hits: string[] = []
  for (const abs of all) {
    // skip this test + the db-only test
    if (abs.endsWith('.test.ts') || abs.endsWith('.test.tsx')) continue
    let src: string
    try { src = readFileSync(abs, 'utf-8') } catch { continue }
    if (OPENROUTER_FETCH.test(src)) hits.push(relative(REPO_ROOT, abs))
  }
  return hits.sort()
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('chain-llm-calls-must-be-ledgered (determinism #86 universal backstop)', () => {
  const hits = chainPathFilesWithOpenRouterCall()

  it('found OpenRouter call sites to classify (sanity — the scanner works)', () => {
    expect(hits.length).toBeGreaterThan(5)
  })

  it('EVERY chain-path OpenRouter call site is classified in exactly one registry', () => {
    const unclassified: string[] = []
    for (const rel of hits) {
      const known =
        rel in LEDGERED_CHAIN_FILES ||
        rel in WRAPPED_AT_CALLSITE ||
        rel in OWN_PERSISTENT_CACHE ||
        rel in KNOWN_UNLEDGERED_CHAIN_GAPS ||
        STANDALONE_NON_CHAIN.has(rel)
      if (!known) unclassified.push(rel)
    }
    if (unclassified.length > 0) {
      throw new Error(
        `DETERMINISM #86 VIOLATION — new un-ledgered OpenRouter call site(s) on the chain path:\n` +
        unclassified.map(f => `  • ${f}`).join('\n') +
        `\n\nEvery chain-path LLM call must replay across a same-brief re-run. Route this call\n` +
        `through the persistent ledger (cachedDesignStage / callLlm / callFastExtract from\n` +
        `scripts/lib/design-stage-cache.ts) and add the file to LEDGERED_CHAIN_FILES; OR, if it\n` +
        `is genuinely not on the chain path, add it to STANDALONE_NON_CHAIN with a reason; OR,\n` +
        `if it is chain-path but provably not in the determinism slice yet, document it in\n` +
        `KNOWN_UNLEDGERED_CHAIN_GAPS. See CLAUDE.md + this file's header.`,
      )
    }
  })

  for (const [rel, token] of Object.entries(LEDGERED_CHAIN_FILES)) {
    it(`${rel} — routes its OpenRouter call through the ledger (token: ${token})`, () => {
      const abs = resolve(REPO_ROOT, rel)
      expect(existsSync(abs)).toBe(true)
      const src = readFileSync(abs, 'utf-8')
      expect(OPENROUTER_FETCH.test(src)).toBe(true)
      const hasLedger = src.includes(token) && LEDGER_TOKENS.some(t => src.includes(t))
      if (!hasLedger) {
        throw new Error(
          `${rel} is registered as LEDGERED but no longer consults the ledger.\n` +
          `Expected token "${token}" AND one of [${LEDGER_TOKENS.join(', ')}] alongside the\n` +
          `OpenRouter fetch. Re-wrap the call in cachedDesignStage/readDesignStageCache or move\n` +
          `the file to the correct registry.`,
        )
      }
    })
  }

  for (const [rel, { chainFile, token }] of Object.entries(WRAPPED_AT_CALLSITE)) {
    it(`${rel} — its call is wrapped at the chain call site in ${chainFile} (token: ${token})`, () => {
      const abs = resolve(REPO_ROOT, chainFile)
      expect(existsSync(abs)).toBe(true)
      const src = readFileSync(abs, 'utf-8')
      if (!src.includes(token)) {
        throw new Error(
          `${rel} relies on being wrapped at the call site in ${chainFile}, but the wrap token\n` +
          `"${token}" is gone. Either restore the ledger wrap around this call, or route the\n` +
          `call in ${rel} itself through the ledger.`,
        )
      }
    })
  }

  for (const [rel, token] of Object.entries(OWN_PERSISTENT_CACHE)) {
    it(`${rel} — has its own persistent replay cache (token: ${token})`, () => {
      const abs = resolve(REPO_ROOT, rel)
      expect(existsSync(abs)).toBe(true)
      const src = readFileSync(abs, 'utf-8')
      expect(src.includes(token)).toBe(true)
    })
  }
})
