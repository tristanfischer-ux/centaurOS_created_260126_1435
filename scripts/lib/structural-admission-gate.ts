/**
 * @file structural-admission-gate.ts
 * @description Gate 39 — structural admission + device-scale magnitude veto.
 *
 * INTENT: Council 2026-07-27 (CLASS-KEYED-CONTAMINATION): class may *propose*
 * structure but must never *commit* it via class-only justification. Every
 * module / edge / tool must name an accepted requirement, derived duty,
 * interface, or hazard. "Selected because class=X" is invalid provenance.
 *
 * Cold measurement (`out/cell-cycler-cold-v1c`) settled the fork: miss-path
 * plaus=3 ⇒ caches were a mask; the remaining disease is bootstrap/generator.
 * This gate makes silent class inheritance and order-of-magnitude anatomy
 * *impossible to reintroduce* even when caches improve.
 *
 * Checks (pure, deterministic, no LLM):
 *   A. Class-only justification — basis/provenance/justified_by/purpose that
 *      terminates at a class label with no duty noun.
 *   B. Device-scale magnitude veto — liquid/plant cooling anatomy or industrial
 *      HX tools on a benchtop/handheld/cabinet / isInstrumentDevice design
 *      (the 200 kW shell-and-tube / liquid-loop-on-Peltier failure class).
 *
 * SHADOW by default (`STRUCTURAL_ADMISSION_ENFORCING` opt-in → exit 39).
 * Kill: `CHAIN_SKIP_STRUCTURAL_ADMISSION=1`.
 */

export const STRUCTURAL_ADMISSION_EXIT_CODE = 39

export type StructuralAdmissionSeverity = 'high' | 'med' | 'low'

export interface StructuralAdmissionFinding {
  severity: StructuralAdmissionSeverity
  kind: 'class_only_justification' | 'device_scale_magnitude'
  where: string
  issue: string
  evidence: string
}

export interface StructuralAdmissionResult {
  verdict: 'pass' | 'fail'
  findings: StructuralAdmissionFinding[]
  device_scale: boolean
  product_class: string
  message: string
}

export interface StructuralAdmissionEnforcement {
  shouldExit: boolean
  exitCode: number
  reasons: string[]
}

/** Text that terminate at a class label with no duty / requirement / hazard. */
const CLASS_ONLY_RE =
  /^(?:because\s+)?(?:of\s+)?(?:the\s+)?class\s*[=:]\s*[\w-]+$|^class\s+[\w-]+\s+default$|^product[_\s-]?class\s*[=:]\s*[\w-]+$|^selected\s+because\s+class[=:]/i

/**
 * @description True when a justification string is class-only (no brief duty).
 * Empty / missing is handled by callers (missing justified_by ≠ class-only).
 * @param text - justified_by / purpose / basis / provenance fragment
 * @param productClass - optional slug; exact match of the slug alone also fails
 */
export function isClassOnlyJustification(
  text: string | null | undefined,
  productClass?: string | null,
): boolean {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (CLASS_ONLY_RE.test(t)) return true
  const slug = String(productClass ?? '').trim().toLowerCase()
  if (slug && t.toLowerCase() === slug) return true
  if (slug && t.toLowerCase() === `class=${slug}`) return true
  // "consumer_electronics prior" / "standard for consumer_electronics" — class as sole anchor
  if (slug && new RegExp(`^(?:standard|default|typical|prior)\\s+(?:for\\s+)?${escapeRe(slug)}$`, 'i').test(t)) {
    return true
  }
  return false
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Liquid / plant thermal anatomy that must not appear on a desk-scale air-cooled
 * instrument. Keyed on nouns (universal), not product names.
 */
export const DEVICE_SCALE_LIQUID_PLANT_MARKERS: Array<{ id: string; re: RegExp }> = [
  { id: 'shell-and-tube HX', re: /\bshell[\s-]?and[\s-]?tube\b/i },
  { id: 'tube bundle', re: /\btube\s+bundle\b/i },
  { id: 'scroll compressor', re: /\bscroll\s+compressor\b/i },
  { id: 'chiller unit', re: /\bchiller\s+unit\b/i },
  { id: 'distribution manifold', re: /\bdistribution\s+manifold\b/i },
  { id: 'expansion reservoir', re: /\bexpansion\s+reservoir\b/i },
  { id: 'pipework run', re: /\bpipework\s+run\b/i },
  { id: 'fluid filter (loop)', re: /\bfluid\s+filter\b/i },
  { id: 'microfluidic cassette', re: /\bmicrofluidic\s+cassette\b/i },
  { id: 'perfusion pump', re: /\bperfusion\s+pump\b/i },
  { id: 'cooling loop (liquid)', re: /\b(?:liquid|glycol|coolant)\s+cooling\s+loop\b|\bcooling\s+loop\b.{0,40}\b(?:glycol|coolant|manifold)\b/i },
]

/** Industrial thermal tools that imply plant-scale heat rejection. */
export const DEVICE_SCALE_FORBIDDEN_TOOLS = new Set([
  'ht:ntu-heat-exchanger',
  'ht:shell-tube-hx',
  'refrigeration-cycle:cop',
])

/**
 * @description Infer whether the design is device/lab scale (benchtop / handheld /
 * cabinet / sealed instrument). Prefer pinned identity; fall back to volume.
 */
export function isDeviceScaleDesign(state: unknown): boolean {
  const s = state as Record<string, any> | null | undefined
  if (!s || typeof s !== 'object') return false
  if (s.isInstrumentDevice === true) return true
  const tier = String(s?.designIdentity?.scale_tier ?? s?.orchestratorContract?.envelope?.scale_tier ?? '')
    .toLowerCase()
  if (tier === 'benchtop' || tier === 'handheld' || tier === 'cabinet' || tier === 'portable') {
    return true
  }
  const vol =
    s?.orchestratorContract?.quantities?.enclosure_volume_m3?.value ??
    s?.moduleDecomposition?.modules?.[0]?.derived_parameters?.enclosure_volume_m3
  if (typeof vol === 'number' && Number.isFinite(vol) && vol > 0 && vol < 1) return true
  // Brief envelope hint (parsed brief max dimensions ≤ 0.5 m class)
  const dims = s?.parsedBrief?.constraints?.max_dimensions_mm
  if (dims && typeof dims === 'object') {
    const vals = [dims.width, dims.depth, dims.height, dims.w, dims.d, dims.h]
      .map((x) => (typeof x === 'number' ? x : NaN))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (vals.length >= 2 && Math.max(...vals) <= 500) return true
  }
  return false
}

function productClassOf(state: unknown): string {
  const s = state as Record<string, any> | null | undefined
  return String(
    s?.keyMetrics?.product_class ??
      s?.moduleDecomposition?.product_class ??
      s?.orchestratorContract?.product_class ??
      s?.parsedBrief?.product_class ??
      '',
  )
}

function walkTextSurfaces(state: unknown): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = []
  const s = state as Record<string, any> | null | undefined
  if (!s) return out

  const modules = s?.moduleDecomposition?.modules ?? s?.design?.modules
  if (Array.isArray(modules)) {
    for (let mi = 0; mi < modules.length; mi++) {
      const m = modules[mi]
      const mid = String(m?.module ?? m?.module_id ?? mi)
      for (const field of ['module_brief', 'overview_paragraph_en', 'english_sentence'] as const) {
        if (typeof m?.[field] === 'string' && m[field]) {
          out.push({ where: `modules[${mi}].${field}`, text: m[field] })
        }
      }
      const subs = m?.sub_modules
      if (!Array.isArray(subs)) continue
      for (let si = 0; si < subs.length; si++) {
        const sm = subs[si]
        for (const field of ['name_human', 'english_sentence', 'topology_clause', 'rad_syntax'] as const) {
          if (typeof sm?.[field] === 'string' && sm[field]) {
            out.push({ where: `modules[${mi}].sub_modules[${si}].${field}`, text: sm[field] })
          }
        }
        const words = sm?.words
        if (!Array.isArray(words)) continue
        for (let wi = 0; wi < words.length; wi++) {
          const w = words[wi]
          const name = String(w?.name_human ?? w?.id ?? wi)
          out.push({ where: `modules[${mi}].sub_modules[${si}].words[${wi}]`, text: name })
          const mods = w?.modifier_characters
          if (Array.isArray(mods)) {
            for (const mc of mods) {
              if (typeof mc?.value === 'string' && mc.value) {
                out.push({
                  where: `modules[${mi}].sub_modules[${si}].words[${wi}].${mc.kind ?? 'mod'}`,
                  text: mc.value,
                })
              }
            }
          }
        }
      }
    }
  }

  // Graph bootstrap nodes (if recorded)
  const nodes = s?.classGraphBootstrap?.graph?.nodes ?? s?.structuralAdmission?.graph_nodes
  if (Array.isArray(nodes)) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      if (typeof n?.justified_by === 'string') {
        out.push({ where: `graph.nodes[${i}].justified_by`, text: n.justified_by })
      }
      if (typeof n?.display === 'string') {
        out.push({ where: `graph.nodes[${i}].display`, text: n.display })
      }
    }
  }

  // Explicit justification bags (future / tests)
  const bag = s?.structuralJustifications
  if (Array.isArray(bag)) {
    for (let i = 0; i < bag.length; i++) {
      const j = bag[i]
      const text = String(j?.justified_by ?? j?.basis ?? j?.purpose ?? '')
      if (text) out.push({ where: `structuralJustifications[${i}]`, text })
    }
  }

  return out
}

/**
 * @description Pure admission decision over state (design + optional justification bag).
 */
export function computeStructuralAdmission(state: unknown): StructuralAdmissionResult {
  const findings: StructuralAdmissionFinding[] = []
  const pc = productClassOf(state)
  const deviceScale = isDeviceScaleDesign(state)
  const s = state as Record<string, any> | null | undefined

  // A — class-only justification
  for (const surf of walkTextSurfaces(state)) {
    // Only score surfaces that are *meant* to be justifications, or bag entries
    const isJustSurface =
      /justified_by|structuralJustifications|purpose|basis|provenance/.test(surf.where) ||
      (typeof (s as any)?.structuralJustifications !== 'undefined' &&
        surf.where.startsWith('structuralJustifications'))
    if (!isJustSurface && !surf.where.includes('justified_by')) continue
    if (isClassOnlyJustification(surf.text, pc)) {
      findings.push({
        severity: 'high',
        kind: 'class_only_justification',
        where: surf.where,
        issue:
          `Provenance terminates at class label "${pc || surf.text}" with no brief duty/hazard — ` +
          `class may propose structure but must not commit it (council 2026-07-27)`,
        evidence: surf.text.slice(0, 200),
      })
    }
  }

  // Also scan tool-step purposes if present
  const tools = s?.toolsUsedPage?.tools ?? s?.orchestratorToolPlan?.steps
  if (Array.isArray(tools)) {
    for (let i = 0; i < tools.length; i++) {
      const t = tools[i]
      const purpose = String(t?.purpose ?? t?.justified_by ?? '')
      const tid = String(t?.tool_id ?? t?.id ?? i)
      if (purpose && isClassOnlyJustification(purpose, pc)) {
        findings.push({
          severity: 'high',
          kind: 'class_only_justification',
          where: `tools[${i}].purpose`,
          issue: `Tool ${tid} justified only by class — not a brief duty`,
          evidence: purpose.slice(0, 200),
        })
      }
    }
  }

  // B — device-scale magnitude veto
  if (deviceScale) {
    for (const surf of walkTextSurfaces(state)) {
      for (const m of DEVICE_SCALE_LIQUID_PLANT_MARKERS) {
        if (m.re.test(surf.text)) {
          findings.push({
            severity: 'high',
            kind: 'device_scale_magnitude',
            where: surf.where,
            issue:
              `Device-scale design carries plant/liquid anatomy "${m.id}" — the ` +
              `breaker-and-heat-exchanger / liquid-loop-on-Peltier failure class`,
            evidence: surf.text.slice(0, 200),
          })
          break
        }
      }
    }
    if (Array.isArray(tools)) {
      for (let i = 0; i < tools.length; i++) {
        const tid = String(tools[i]?.tool_id ?? tools[i]?.id ?? '')
        if (DEVICE_SCALE_FORBIDDEN_TOOLS.has(tid)) {
          findings.push({
            severity: 'high',
            kind: 'device_scale_magnitude',
            where: `tools[${i}]`,
            issue: `Industrial thermal tool "${tid}" selected on a device-scale design`,
            evidence: tid,
          })
        }
      }
    }
  }

  // De-dupe by where+kind
  const seen = new Set<string>()
  const deduped: StructuralAdmissionFinding[] = []
  for (const f of findings) {
    const k = `${f.kind}|${f.where}|${f.evidence.slice(0, 40)}`
    if (seen.has(k)) continue
    seen.add(k)
    deduped.push(f)
  }

  const high = deduped.filter((f) => f.severity === 'high')
  const verdict = high.length > 0 ? 'fail' : 'pass'
  return {
    verdict,
    findings: deduped,
    device_scale: deviceScale,
    product_class: pc,
    message:
      verdict === 'pass'
        ? `structural admission PASS (device_scale=${deviceScale}, findings=${deduped.length})`
        : `structural admission FAIL — ${high.length} HIGH finding(s) (device_scale=${deviceScale})`,
  }
}

export function structuralAdmissionEnforceModeFromEnv(
  raw: string | undefined = process.env.STRUCTURAL_ADMISSION_ENFORCING,
): 'off' | 'on' {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v || v === '0' || v === 'false' || v === 'no' || v === 'off' || v === 'shadow') return 'off'
  return 'on'
}

/**
 * @description Enforcement decision — only HIGH findings hard-exit when mode=on.
 */
export function evaluateStructuralAdmissionEnforcement(
  result: StructuralAdmissionResult,
  mode: 'off' | 'on' = 'off',
): StructuralAdmissionEnforcement {
  if (mode !== 'on') {
    return { shouldExit: false, exitCode: STRUCTURAL_ADMISSION_EXIT_CODE, reasons: [] }
  }
  const highs = result.findings.filter((f) => f.severity === 'high')
  if (highs.length === 0) {
    return { shouldExit: false, exitCode: STRUCTURAL_ADMISSION_EXIT_CODE, reasons: [] }
  }
  return {
    shouldExit: true,
    exitCode: STRUCTURAL_ADMISSION_EXIT_CODE,
    reasons: highs.map((f) => `${f.kind}@${f.where}: ${f.issue}`),
  }
}

/** proveCatch + CLI selftest */
export function selftestStructuralAdmission(): number {
  let bad = 0

  // (a) class-only justification fires
  const classOnly = computeStructuralAdmission({
    keyMetrics: { product_class: 'consumer_electronics' },
    isInstrumentDevice: true,
    structuralJustifications: [
      { element: 'mass_fluid_transport_process', justified_by: 'class=consumer_electronics' },
    ],
  })
  if (!(classOnly.verdict === 'fail' && classOnly.findings.some((f) => f.kind === 'class_only_justification'))) {
    console.error('FAIL: class-only justification must HIGH-fail')
    bad++
  }

  // (b) liquid anatomy on benchtop fires (cold v1c / warm HX class)
  const liquid = computeStructuralAdmission({
    keyMetrics: { product_class: 'consumer_electronics' },
    isInstrumentDevice: true,
    designIdentity: { scale_tier: 'benchtop' },
    moduleDecomposition: {
      product_class: 'consumer_electronics',
      modules: [
        {
          module: 'mass_fluid_transport_process',
          sub_modules: [
            {
              name_human: 'Cooling loop',
              words: [
                { name_human: 'Distribution Manifold' },
                { name_human: 'Expansion Reservoir' },
                { name_human: 'Pipework Run' },
              ],
            },
          ],
        },
      ],
    },
  })
  if (!(liquid.verdict === 'fail' && liquid.findings.some((f) => f.kind === 'device_scale_magnitude'))) {
    console.error('FAIL: liquid/plant anatomy on benchtop must HIGH-fail')
    bad++
  }

  // (c) industrial HX tool on device scale fires
  const hxTool = computeStructuralAdmission({
    keyMetrics: { product_class: 'consumer_electronics' },
    isInstrumentDevice: true,
    toolsUsedPage: { tools: [{ tool_id: 'ht:ntu-heat-exchanger', purpose: 'size bay heat rejection' }] },
  })
  if (!(hxTool.verdict === 'fail' && hxTool.findings.some((f) => f.kind === 'device_scale_magnitude'))) {
    console.error('FAIL: ht:ntu-heat-exchanger on instrument must HIGH-fail')
    bad++
  }

  // (d) clean duty-justified instrument passes
  const clean = computeStructuralAdmission({
    keyMetrics: { product_class: 'consumer_electronics' },
    isInstrumentDevice: true,
    structuralJustifications: [
      {
        element: 'sensing_instrumentation',
        justified_by: 'brief duty: 0.05% voltage / 0.1% current accuracy requires precision AFE',
      },
    ],
    toolsUsedPage: {
      tools: [{ tool_id: 'tec:peltier-sizing', purpose: 'size Peltier for 8-channel cell bay heat load' }],
    },
    moduleDecomposition: {
      modules: [
        {
          module: 'environmental_interface',
          sub_modules: [
            {
              name_human: 'Air-cooled Peltier',
              words: [{ name_human: 'Peltier Module' }, { name_human: 'Axial Fan' }],
            },
          ],
        },
      ],
    },
  })
  if (clean.verdict !== 'pass') {
    console.error('FAIL: clean duty-justified instrument must PASS', clean.message, clean.findings)
    bad++
  }

  // (e) plant-scale product may carry chiller / manifold (no false positive)
  const plant = computeStructuralAdmission({
    keyMetrics: { product_class: 'bess' },
    designIdentity: { scale_tier: 'plant' },
    moduleDecomposition: {
      modules: [
        {
          module: 'environmental_interface',
          sub_modules: [{ words: [{ name_human: 'Chiller Unit' }, { name_human: 'Distribution Manifold' }] }],
        },
      ],
    },
  })
  if (plant.verdict !== 'pass' || plant.device_scale) {
    console.error('FAIL: plant-scale BESS must not trip device-scale magnitude', plant)
    bad++
  }

  // (f) enforcement on → exit; off → no exit
  const enfOn = evaluateStructuralAdmissionEnforcement(classOnly, 'on')
  const enfOff = evaluateStructuralAdmissionEnforcement(classOnly, 'off')
  if (!enfOn.shouldExit || enfOn.exitCode !== 39 || enfOff.shouldExit) {
    console.error('FAIL: enforcement mode contract broken', { enfOn, enfOff })
    bad++
  }

  if (!isClassOnlyJustification('class=consumer_electronics', 'consumer_electronics')) {
    console.error('FAIL: isClassOnlyJustification missed class= slug')
    bad++
  }
  if (isClassOnlyJustification('brief duty: per-channel OV/UV hardware cutout', 'consumer_electronics')) {
    console.error('FAIL: isClassOnlyJustification false-positive on real duty')
    bad++
  }

  if (bad === 0) console.error('[structural-admission-gate] selftest OK')
  return bad
}

if (require.main === module) {
  const mode = process.argv[2]
  if (mode === '--selftest') {
    process.exit(selftestStructuralAdmission() === 0 ? 0 : 1)
  }
  console.error('Usage: structural-admission-gate.ts --selftest')
  process.exit(2)
}
