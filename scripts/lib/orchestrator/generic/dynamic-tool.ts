/**
 * scripts/lib/orchestrator/generic/dynamic-tool.ts
 *
 * GENERIC PYTHON-RUNNER TOOL FACTORY — wraps a RUNTIME-GENERATED python sizing
 * script (written by tool-generator.ts, self-test-gated) into a live Tool<…> and
 * registers it mid-chain so the on-the-fly tool-plan bootstrap can WIRE it.
 *
 * This is the Tool-side of TOOL-CREATION-ON-THE-FLY (Tristan 2026-06-14, the
 * AGREED ENGINE-FIX PLAN, tasks #124-129): "when no catalogue tool fits a duty,
 * generate a new Python sizing tool. EACH generated tool MUST generate its OWN
 * self-test and PASS it before use — ASSUME IT IS BROKEN until proven; never
 * assume it works. Store as candidate."
 *
 * THE CONTRACT (identical to a hand-written python tool — see the reference pair
 * absorption_column_htu_ntu.py + absorption-column-htu-ntu.ts):
 *   - the python reads ONE JSON payload on stdin, writes ONE JSON object on
 *     stdout; exit 0 = success, exit 2 = input-JSON parse error, exit 3 = runtime
 *     exception during compute.
 *   - invoke() spawnSyncs the repo .venv python (NOT system python3 — the .venv
 *     has the scientific stack), marshals JSON in/out, maps a non-zero exit OR an
 *     `error` field OR a JSON-parse failure to ok:false, attaches `tool:` field-
 *     level provenance, and surfaces the worked[] block for the appendix.
 *
 * WHY a factory (vs a per-tool .ts wrapper): a generated tool exists only at
 * runtime — there is NO checked-in .ts to import via register-all.ts (that path
 * needs a recompile and is unusable mid-chain). So registerDynamicTool() builds
 * the Tool object in memory, registers it via the SAME registerTool() singleton
 * the static wrappers use, AND injects its REAL invoke() field names into the
 * planner's in-memory raw-IO map (registerDynamicToolIo) so buildToolCatalogue()
 * offers it and validateToolPlanSpec() (V1/V2) accepts a wiring to it.
 *
 * FAIL-SAFE: a generated tool is registered ONLY after its self-test passes (the
 * gate lives in tool-generator.ts). A tool that errors at chain time is treated
 * like any other non-required step (the bootstrap plan marks every step
 * required:false), so a runtime tool fault can never halt a novel-class run.
 *
 * British spelling throughout.
 */

import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { registerTool, getTool } from '../registry'
import type { Tool, ToolResult, ToolDomain, BriefEnvelope, PartialContract } from '../types'
import { registerDynamicToolIo } from './bootstrap-tool-plan'

// generic/ is a sibling of tools/ under orchestrator/, so the repo .venv is the
// SAME relative depth the static wrappers use: tools/foo.ts → ../../../../.venv.
// (generic → orchestrator → lib → scripts → repo-root.)
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')
/** Directory the generated python scripts are written to (and run from). */
export const GENERATED_PY_DIR = resolve(__dirname, '..', 'tools', 'python', 'generated')

export interface DynamicToolSpec {
  /** Registry-unique id, convention '<name>:<sub-capability>' (e.g.
   *  'mbbr:biofilter-sizing'). Validated by the generator before it reaches here. */
  id: string
  /** Human-readable name for attribution display. */
  name: string
  /** Absolute path to the generated python script (under GENERATED_PY_DIR). */
  scriptPath: string
  /** The REAL `payload.get(...)` input field names the script reads. */
  inputKeys: string[]
  /** The REAL computed (non-echoed) output field names the script returns. */
  outputKeys: string[]
  /** Engineering domain tag (defaults to 'process' — the generic sizing domain). */
  domain?: ToolDomain
  /** Optional applicability predicate. Default: applies to every envelope (a
   *  generated tool is duty-driven, not class-gated). */
  applicableTo?: (envelope: BriefEnvelope, contract: PartialContract) => boolean
  /** Subprocess timeout (ms). Default 30 s — same as the static wrappers. */
  timeoutMs?: number
}

const TOOL_VERSION = 'generated-1.0.0'
const TOOL_SOURCE = (id: string) => `internal://forgeos/generated/${id}`

/**
 * Build a runnable Tool<…> around a generated python script. invoke() is the
 * EXACT absorption-column-htu-ntu.ts idiom: spawnSync the .venv python with the
 * JSON payload on stdin, map exit-code / `error` / JSON-parse failure to ok:false,
 * else return the parsed output with `tool:` provenance. Pure: same input + same
 * script → same output.
 */
export function makeDynamicTool(spec: DynamicToolSpec): Tool<Record<string, unknown>, Record<string, unknown>> {
  const { id, name, scriptPath } = spec
  const domain: ToolDomain = spec.domain ?? 'process'
  const timeout = spec.timeoutMs ?? 30_000
  return {
    id,
    name,
    version: TOOL_VERSION,
    license: 'free-proprietary',
    source_url: TOOL_SOURCE(id),
    domain,
    pinned_environment: { python: '3.14', generated: '1' },
    applicable_to(envelope: BriefEnvelope, contract: PartialContract) {
      return spec.applicableTo ? spec.applicableTo(envelope, contract) : true
    },
    async invoke(input: Record<string, unknown>): Promise<ToolResult<Record<string, unknown>>> {
      const t0 = Date.now()
      const proc = spawnSync(VENV_PY, [scriptPath], {
        input: JSON.stringify(input),
        encoding: 'utf-8',
        timeout,
        maxBuffer: 16 * 1024 * 1024,
      })
      const duration_ms = Date.now() - t0
      const failProv = { source: `tool:${id}` as const, tool_id: id, tool_version: TOOL_VERSION }
      if (proc.status !== 0) {
        return {
          ok: false, output: null, provenance: failProv, warnings: [],
          error: `Python exit ${proc.status}: ${(proc.stderr ?? '').slice(0, 400)}`,
        }
      }
      let output: Record<string, unknown> & { error?: string }
      try {
        output = JSON.parse(proc.stdout) as Record<string, unknown> & { error?: string }
      } catch (err) {
        return {
          ok: false, output: null, provenance: failProv, warnings: [],
          error: `JSON parse: ${(err as Error).message}`,
        }
      }
      if (typeof output.error === 'string' && output.error) {
        return { ok: false, output: null, provenance: failProv, warnings: [], error: output.error }
      }
      return {
        ok: true, output,
        provenance: {
          source: `tool:${id}`, tool_id: id, tool_version: TOOL_VERSION,
          tool_license: 'free-proprietary', tool_source_url: TOOL_SOURCE(id),
          invocation_input: input, invocation_output_field: '(multiple)',
          pinned_versions: { python: '3.14', generated: '1' },
          timestamp: new Date().toISOString(), duration_ms,
        },
        warnings: [],
      }
    },
  }
}

export interface RegisterDynamicToolResult {
  ok: boolean
  tool_id: string
  already_registered: boolean
  error?: string
}

/**
 * Register a generated tool at RUNTIME so the on-the-fly planner can wire it:
 *   (1) build the Tool via makeDynamicTool;
 *   (2) registerTool() into the global singleton (the same registry getTool/
 *       listTools read) — idempotent: a re-registration of the SAME id is a no-op
 *       success (registerTool throws on a duplicate, so we guard with getTool);
 *   (3) registerDynamicToolIo() → inject the REAL invoke() field names into the
 *       planner's in-memory raw-IO map AND invalidate its catalogue cache, so the
 *       next buildToolCatalogue()/validateToolPlanSpec() sees + accepts it.
 *
 * NEVER throws — a registration failure returns ok:false so the caller (the
 * tool-creation pass) can skip that duty and let the chain proceed (fail-safe).
 */
export function registerDynamicTool(spec: DynamicToolSpec): RegisterDynamicToolResult {
  try {
    if (getTool(spec.id)) {
      // Already in the registry (e.g. a collision with a static tool, or a re-run
      // within the same process). Re-assert its IO so the planner still sees it,
      // but do NOT double-register.
      registerDynamicToolIo(spec.id, spec.inputKeys, spec.outputKeys)
      return { ok: true, tool_id: spec.id, already_registered: true }
    }
    const tool = makeDynamicTool(spec)
    registerTool(tool)
    registerDynamicToolIo(spec.id, spec.inputKeys, spec.outputKeys)
    return { ok: true, tool_id: spec.id, already_registered: false }
  } catch (err) {
    return { ok: false, tool_id: spec.id, already_registered: false, error: (err as Error).message }
  }
}
