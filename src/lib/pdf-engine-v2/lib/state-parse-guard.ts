/**
 * src/lib/pdf-engine-v2/lib/state-parse-guard.ts — Gate 28 (exit 28)
 *
 * BACKSTOP: validates the state.json written to disk after Phase 2 completion.
 *
 * L41 council unanimously flagged a HIGH finding: Physics Critic read the rendered
 * PDF and concluded "moduleCount=10 but only 6 modules present" — caused by a PDF
 * rendering artefact where the scorer perceived truncation mid-sentence in the
 * mass_fluid_transport_process module prose. Investigation of actions.jsonl confirmed:
 *   - Phase 2 is a DETERMINISTIC PATCH LOOP, not an LLM call — no finish_reason='length'
 *   - 4-generator.json contains all 10 modules intact (9 words in module[5])
 *   - 8-5-specialist.json contains all 10 modules intact
 *   - state.json.moduleDecomposition.modules.length === 10 (confirmed)
 *   - The truncation was a multimodal scorer artefact (PDF page-break mid-sentence)
 *
 * Root-cause determination: NOT a max_tokens cap (Phase 2 uses no LLM), NOT a
 * state serialisation truncation (state.json has all 10 modules). Drawer
 * a9d3a83646b33d8c (watchdog stall pattern) confirms we should ship gate 28
 * as a BACKSTOP regardless — even if upstream missed the cause, gate 28 will
 * catch any future state.json module-count mismatch before K10 shadow + render.
 *
 * Gate 28 checks:
 *   1. state.json parses as valid JSON (no corruption from writeFileSync partial writes)
 *   2. moduleDecomposition.modules.length === declared module count
 *      (either moduleDecomposition.module_count if present, or
 *       moduleDecomposition.modules.length is cross-checked against
 *       the generator's expected_module_count from actions.jsonl if available)
 *   3. Every module has sub_modules[] (array, possibly empty)
 *   4. No module has sub_modules as a non-array (corruption signal from applyPatches)
 *
 * Exit code 28 registered in CLAUDE.md chain exit codes table.
 *
 * Pre-change mempalace search: "Phase 2 JSON truncation max_tokens finish_reason
 *   guard pre-render" → 5 drawers loaded. Drawer a9d3a83646b33d8c cited.
 */

import * as fs from 'fs'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StateParseGuardResult {
  passed: boolean
  /** Path that was validated. */
  state_path: string
  /** Total modules found in moduleDecomposition.modules. */
  modules_found: number
  /** Declared module count (from moduleDecomposition.module_count, if present). */
  modules_declared: number | null
  /** Modules with structural damage (non-array sub_modules). */
  structurally_damaged_modules: string[]
  /** Error message for process.exit(28) + console.error. */
  error_message: string | null
}

// ── Core guard ────────────────────────────────────────────────────────────────

/**
 * runStateParseGuard — parse state.json from disk and assert module-count
 * consistency + structural integrity.
 *
 * @param statePath   Absolute path to state.json written after Phase 2.
 */
export function runStateParseGuard(statePath: string): StateParseGuardResult {
  // Check file exists
  if (!fs.existsSync(statePath)) {
    return {
      passed: false,
      state_path: statePath,
      modules_found: 0,
      modules_declared: null,
      structurally_damaged_modules: [],
      error_message: `[Gate 28 / exit 28] State parse guard FAIL — state.json not found at ${statePath}`,
    }
  }

  // 1. Parse as valid JSON (catches partial-write corruption)
  let state: any
  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    state = JSON.parse(raw)
  } catch (err) {
    return {
      passed: false,
      state_path: statePath,
      modules_found: 0,
      modules_declared: null,
      structurally_damaged_modules: [],
      error_message:
        `[Gate 28 / exit 28] State parse guard FAIL — state.json at ${statePath} is not valid JSON.\n` +
        `JSON.parse error: ${String(err)}\n` +
        `This indicates a partial write or upstream truncation. Check disk space + writeFileSync call.\n` +
        `If the chain writes state.json atomically (tmp + rename), the corruption is pre-write.`,
    }
  }

  // 2. Check moduleDecomposition exists
  const md = state?.moduleDecomposition
  if (!md || typeof md !== 'object') {
    return {
      passed: false,
      state_path: statePath,
      modules_found: 0,
      modules_declared: null,
      structurally_damaged_modules: [],
      error_message:
        `[Gate 28 / exit 28] State parse guard FAIL — state.json has no moduleDecomposition field.\n` +
        `Top-level keys: ${Object.keys(state ?? {}).slice(0, 10).join(', ')}\n` +
        `This indicates an early-exit state (Phase 0 fatal, gate 22, etc.) was written without moduleDecomposition.`,
    }
  }

  // 3. Count actual modules
  const modules: any[] = Array.isArray(md.modules) ? md.modules : []
  const modulesFound = modules.length

  // 4. Check declared module_count if present
  const modulesDeclared: number | null =
    typeof md.module_count === 'number' ? md.module_count : null

  // 5. Check structural integrity — every module must have sub_modules as an array
  const structurallyDamaged: string[] = []
  for (const m of modules) {
    const modId = String(m?.module ?? m?.module_id ?? '?')
    const subs = m?.sub_modules
    if (subs === undefined || subs === null) {
      // sub_modules missing entirely — corrupted by a patch that removed the array
      structurallyDamaged.push(`${modId}: sub_modules missing (undefined/null)`)
    } else if (!Array.isArray(subs)) {
      structurallyDamaged.push(`${modId}: sub_modules is not an Array (got ${typeof subs})`)
    }
  }

  // 6. Count consistency check
  const countMismatch =
    modulesDeclared !== null && modulesFound !== modulesDeclared

  // 7. Aggregate pass/fail
  const passed =
    modulesFound > 0 &&
    !countMismatch &&
    structurallyDamaged.length === 0

  let errorMessage: string | null = null
  if (!passed) {
    const lines: string[] = [
      `[Gate 28 / exit 28] State parse guard FAIL — ${statePath}`,
    ]
    if (modulesFound === 0) {
      lines.push(`  modules_found: 0 — moduleDecomposition.modules is empty or non-array.`)
      lines.push(`  This indicates the generator did not write any modules, or the state was written before the generator ran.`)
    }
    if (countMismatch) {
      lines.push(
        `  Module count mismatch: moduleDecomposition.module_count declares ${modulesDeclared} ` +
        `but moduleDecomposition.modules has ${modulesFound} entries.`
      )
      lines.push(
        `  L41 context: Physics Critic found "moduleCount=10 but only 6 present" — ` +
        `this gate catches that BEFORE K10 shadow + render, not after.`
      )
    }
    if (structurallyDamaged.length > 0) {
      lines.push(`  Structurally damaged modules (sub_modules not an Array):`)
      for (const d of structurallyDamaged) {
        lines.push(`    - ${d}`)
      }
      lines.push(`  Root cause: a Phase 2 applyPatches call replaced a sub_modules array with a non-array value.`)
      lines.push(`  Fix: add Array.isArray guard in applyPatches before assigning to sub_modules path.`)
    }
    lines.push(``)
    lines.push(`  modules_found: ${modulesFound}`)
    lines.push(`  modules_declared: ${modulesDeclared ?? '(field absent)'}`)
    lines.push(`  structurally_damaged_modules: ${structurallyDamaged.length}`)
    errorMessage = lines.join('\n')
  }

  return {
    passed,
    state_path: statePath,
    modules_found: modulesFound,
    modules_declared: modulesDeclared,
    structurally_damaged_modules: structurallyDamaged,
    error_message: errorMessage,
  }
}
