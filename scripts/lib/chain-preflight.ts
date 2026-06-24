/**
 * chain-preflight.ts — make the chain's preconditions + config EXECUTABLE, not documented
 * (ForgeOS strengthening #5, 2026-06-24, adapted to the CURRENT serial chain).
 *
 * The loop-engineering "executable skill" idea: intent only compounds if the loop ASSERTS its
 * conventions at runtime instead of trusting a human to remember them. The review's specific
 * example (the radical-pipeline RADICAL_PHASE_3/PA_PIPELINE flags) does NOT apply to this chain
 * — those were the old pdf-engine-v2 radical path. The CURRENT footgun is different: the chain
 * has ~20 opt-OUT `CHAIN_SKIP_*` toggles + enforcing flags, so a degraded or non-default run is
 * SILENT. This preflight makes it LOUD: it asserts the hard preconditions and announces every
 * non-default toggle, so "why did this dossier come out thin?" is answered at the top of the log.
 *
 * Pure + dependency-free (reads process.env + fs). Never throws on a soft issue — it WARNS;
 * only a genuinely fatal missing precondition (no API key) returns ok:false for the caller to act.
 */
import { existsSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

export interface PreflightResult {
  ok: boolean                 // false only on a FATAL missing precondition (caller decides to exit)
  fatal: string[]             // hard blockers
  warnings: string[]          // soft degradations (DB absent, skip-flags set)
  activeToggles: string[]     // the non-default CHAIN_SKIP_*/enforcing flags in effect
  summary: string
}

// Toggles that DEGRADE the dossier when set (opt-out skips) — announced so a thin run is explained.
const DEGRADING_SKIPS = [
  'CHAIN_SKIP_DESIGN_LOOP', 'CHAIN_SKIP_BLENDER_BG', 'CHAIN_SKIP_IMAGE_GEN', 'CHAIN_SKIP_SUPPLIERS',
  'CHAIN_SKIP_PART_VERIFY', 'CHAIN_SKIP_PART_REALITY_CHECK', 'CHAIN_SKIP_BRIEF_EXPANSION',
  'CHAIN_SKIP_SPECIALIST', 'CHAIN_SKIP_ENGINE_B', 'CHAIN_SKIP_ENGINE_C', 'CHAIN_SKIP_BOM_COST_GROUNDING',
  'CHAIN_SKIP_MODULE_PARAGRAPH_LLM', 'CHAIN_DISABLE_AUTO_IMPROVE',
]
// Enforcing flags whose STATE is worth announcing (the deterministic floor only bites when on).
const ENFORCING_FLAGS = [
  'DRAWING_GATES_ENFORCING', 'COST_SANITY_ENFORCING', 'PHYSICS_CRITIC_ENFORCING',
  'TOOL_ARCHETYPE_ENFORCING', 'PDF_ENGINE_SELF_AUDIT_ENFORCING',
]

function _truthy(v: string | undefined): boolean {
  return !!v && !['', '0', 'false', 'no', 'off', 'shadow'].includes(v.toLowerCase())
}

/**
 * Run the preflight. `env` injectable for tests. Returns the result; the caller logs `summary`
 * and may exit on `!ok` (a hard fatal). Reads ~/.forge-truth/forge-truth.db presence as a soft
 * signal (DB-first lookups degrade to web/baked when absent — a warning, not fatal).
 */
export function runChainPreflight(env: NodeJS.ProcessEnv = process.env): PreflightResult {
  const fatal: string[] = []
  const warnings: string[] = []
  const activeToggles: string[] = []

  // ── hard preconditions ──
  if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_API_KEY.trim()) {
    fatal.push('OPENROUTER_API_KEY is unset — the chain cannot call any model (every LLM stage will fail).')
  }
  // ── soft preconditions ──
  const dbPath = resolve(homedir(), '.forge-truth', 'forge-truth.db')
  if (!existsSync(dbPath)) {
    warnings.push(`growing-DB absent (${dbPath}) — parts/specs/standards DB-first lookups degrade to web/baked snapshots.`)
  }
  // ── announce non-default toggles (the anti-silent-degradation signal) ──
  for (const f of DEGRADING_SKIPS) {
    if (_truthy(env[f])) {
      activeToggles.push(f)
      warnings.push(`${f}=on — a dossier stage is being SKIPPED; output will be thinner than a full run.`)
    }
  }
  const enforcingOn = ENFORCING_FLAGS.filter((f) => _truthy(env[f]))
  for (const f of enforcingOn) activeToggles.push(f)

  const ok = fatal.length === 0
  const parts: string[] = []
  parts.push(ok ? 'preconditions OK' : `FATAL ×${fatal.length}`)
  parts.push(enforcingOn.length ? `enforcing: ${enforcingOn.join(', ')}` : 'enforcing: none (gates SHADOW — floor records but does not block)')
  if (activeToggles.filter((t) => t.startsWith('CHAIN_')).length) {
    parts.push(`degrading skips: ${activeToggles.filter((t) => t.startsWith('CHAIN_')).join(', ')}`)
  } else {
    parts.push('no degrading skips (full run)')
  }
  const summary = `[chain] PREFLIGHT — ${parts.join('  ·  ')}`
  return { ok, fatal, warnings, activeToggles, summary }
}

// ── selftest ────────────────────────────────────────────────────────────────────────────
function _selftest(): void {
  // 1. clean full run (key set, no skips) → ok, no degrading skips
  const clean = runChainPreflight({ OPENROUTER_API_KEY: 'sk-x' } as NodeJS.ProcessEnv)
  if (!clean.ok) throw new Error('clean run must be ok')
  if (clean.activeToggles.some((t) => t.startsWith('CHAIN_'))) throw new Error('clean run has no degrading skips')
  if (!clean.summary.includes('no degrading skips')) throw new Error('clean summary wrong: ' + clean.summary)
  // 2. missing key → fatal, ok:false
  const noKey = runChainPreflight({} as NodeJS.ProcessEnv)
  if (noKey.ok) throw new Error('missing key must be fatal')
  if (!noKey.fatal[0].includes('OPENROUTER_API_KEY')) throw new Error('fatal must name the key')
  // 3. a degrading skip is announced
  const degraded = runChainPreflight({ OPENROUTER_API_KEY: 'sk-x', CHAIN_SKIP_DESIGN_LOOP: '1' } as NodeJS.ProcessEnv)
  if (!degraded.ok) throw new Error('a skip is degrading, not fatal')
  if (!degraded.activeToggles.includes('CHAIN_SKIP_DESIGN_LOOP')) throw new Error('skip not announced')
  if (!degraded.warnings.some((w) => w.includes('CHAIN_SKIP_DESIGN_LOOP'))) throw new Error('skip warning missing')
  // 4. enforcing flag announced + 'shadow' is treated as OFF
  const enf = runChainPreflight({ OPENROUTER_API_KEY: 'sk-x', DRAWING_GATES_ENFORCING: '1', COST_SANITY_ENFORCING: 'shadow' } as NodeJS.ProcessEnv)
  if (!enf.activeToggles.includes('DRAWING_GATES_ENFORCING')) throw new Error('enforcing not announced')
  if (enf.activeToggles.includes('COST_SANITY_ENFORCING')) throw new Error("'shadow' must count as OFF")
  console.log('chain-preflight selftest: OK (clean / fatal-no-key / degrading-skip-loud / enforcing+shadow)')
}

if (require.main === module && process.argv.includes('--selftest')) _selftest()
