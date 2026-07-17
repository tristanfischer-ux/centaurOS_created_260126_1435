/**
 * render-quality-audit.ts — catch a BAD/GENERIC Blender render automatically.
 *
 * WHY (Tristan 2026-06-06, OXCCU e_fuel): the e_fuel dossier shipped TERRIBLE
 * Blender images — flat grey boxes — because the brand-new e_fuel_synthesis class
 * had no per-class Blender template, so `scripts/render-blender-scene.py` returned
 * exit 5 ("no template") and the chain fell back to the UNIVERSAL renderer (generic
 * stock geometry, NOT the design). There are 13 hard content gates + shadow gates
 * 31-34, but ZERO gate for Blender IMAGE quality — `render-blender-scene.py` even
 * writes a `.blender-template-fallback` marker with a comment anticipating "a
 * render-quality gate can detect" it, but that gate was never built. So a generic
 * render shipped at exit 0. This is that missing gate.
 *
 * THE CHECK (deterministic, no LLM, no image-decode): does the product_class
 * resolve to a per-class hand-coded Blender template (the same CLASS_TO_TEMPLATE
 * dispatch render-blender-scene.py uses), OR did the run produce a brief-specific
 * LLM `blender-scene.py`? If NEITHER, the dossier's images are the generic
 * universal fallback — i.e. NOT this design — which is WRONGNESS (the reader sees
 * the wrong object). We also sanity-check that the expected hero + ≥1 module image
 * exist and are non-trivially sized (a blank/degenerate render is tiny).
 *
 * Severity philosophy mirrors gates 31-34: a generic-fallback render is WRONGNESS
 * → HIGH (hard-exits when enforcing); a merely-thin image set flags. SHADOW by
 * default (records state.renderQuality + logs the would-block verdict, never
 * exits); enforcing is opt-in via RENDER_QUALITY_ENFORCING. Kill: CHAIN_SKIP_RENDER_QUALITY=1.
 *
 * Pure + deterministic — computeRenderQuality / evaluateRenderQualityEnforcement /
 * renderQualityEnforceModeFromEnv are unit-testable directly.
 */
import { existsSync, readFileSync, statSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

export interface RenderQualityFinding {
  severity: 'high' | 'med' | 'low'
  code: string
  message: string
}
export interface RenderQualityResult {
  product_class: string
  has_per_class_template: boolean
  has_llm_scene: boolean
  used_universal_fallback: boolean
  template_name: string | null
  hero_present: boolean
  module_images: number
  thin_images: string[]
  findings: RenderQualityFinding[]
  ok: boolean
}

const MIN_IMAGE_BYTES = 40_000 // a real Blender plant render is ~1-5 MB; < 40 KB ≈ blank/degenerate

/** Parse render-blender-scene.py's CLASS_TO_TEMPLATE (the single source of truth
 *  for the per-class dispatch) and resolve the template for a product_class via the
 *  SAME substring rule the dispatch uses. Returns the template filename or null. */
export function resolveBlenderTemplate(productClass: string, repoRoot: string): string | null {
  const dispatchPath = resolve(repoRoot, 'scripts', 'render-blender-scene.py')
  if (!existsSync(dispatchPath)) return null
  let src: string
  try { src = readFileSync(dispatchPath, 'utf-8') } catch { return null }
  // Extract the "key": "file.py" pairs inside CLASS_TO_TEMPLATE.
  const pairs: Array<[string, string]> = []
  const re = /"([a-z0-9_-]+)"\s*:\s*"([a-z0-9_-]+\.py)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) pairs.push([m[1], m[2]])
  const pc = String(productClass || '').toLowerCase().trim()
  if (!pc) return null
  for (const [key, fname] of pairs) {
    if (pc.includes(key) && existsSync(resolve(repoRoot, 'scripts', 'blender-templates', fname))) {
      return fname
    }
  }
  return null
}

export function computeRenderQuality(
  state: any,
  opts: { outDir: string; repoRoot: string },
): RenderQualityResult {
  const productClass = String(
    state?.moduleDecomposition?.product_class
    ?? state?.parsedBrief?.product_class
    ?? state?.keyMetrics?.product_class
    ?? '',
  ).toLowerCase().trim()

  const templateName = resolveBlenderTemplate(productClass, opts.repoRoot)
  const hasPerClassTemplate = templateName !== null
  // A brief-specific LLM-generated scene in the out dir is also a real (custom) model.
  const hasLlmScene = existsSync(join(opts.outDir, 'blender-scene.py'))
  // INTENT (Poseidon 2026-07-16): build_universal_scene instrument form grammars
  // (syringe OPEN array / thermocycler / optical) dump form-meshes.json — that IS
  // the design, not grey-box stock. Treat as a real render so BLENDER_UNIVERSAL_FALLBACK
  // does not floor Renders on every instrument class that correctly uses the universal
  // path. A plant class with neither template nor form-meshes still flags HIGH.
  const hasInstrumentFormRender = (() => {
    for (const rel of ['form-meshes.json', join('_loop', 'form-meshes.json')]) {
      const p = join(opts.outDir, rel)
      if (!existsSync(p)) continue
      try {
        const raw = JSON.parse(readFileSync(p, 'utf-8')) as { form?: unknown; meshes?: unknown }
        const form = String(raw?.form ?? '').toLowerCase()
        const n = Array.isArray(raw?.meshes) ? raw.meshes.length : 0
        // GOTCHA (2026-07-16 OpenFlexure): lab_microscope form-meshes.json was
        // written (17 meshes) but this regex omitted it → false FALLBACK + floor Renders.
        // Include every instrument form family the universal placer emits.
        if (
          n >= 8
          && /syringe_pump|thermocycler|optical|photometer|colorimeter|instrument|lab_microscope|microscope|flexure|benchtop_bioreactor|bioreactor|potentiostat|digital_microfluidics|opendrop|pioreactor|rodeostat/.test(form)
        ) {
          return true
        }
      } catch { /* ignore malformed */ }
    }
    return false
  })()
  const usedUniversalFallback = !hasPerClassTemplate && !hasLlmScene && !hasInstrumentFormRender

  // Inventory the rendered images.
  const heroCandidates = ['00-hero.png', 'blender-cover.png']
  const heroPresent = heroCandidates.some((h) => existsSync(join(opts.outDir, h)))
  let moduleImages = 0
  const thin: string[] = []
  try {
    for (const f of readdirSync(opts.outDir)) {
      if (/^module-.*\.png$/.test(f)) {
        moduleImages++
        try { if (statSync(join(opts.outDir, f)).size < MIN_IMAGE_BYTES) thin.push(f) } catch { /* ignore */ }
      }
    }
  } catch { /* out dir unreadable */ }
  for (const h of heroCandidates) {
    const p = join(opts.outDir, h)
    if (existsSync(p)) { try { if (statSync(p).size < MIN_IMAGE_BYTES) thin.push(h) } catch { /* ignore */ } }
  }

  const findings: RenderQualityFinding[] = []
  if (usedUniversalFallback) {
    findings.push({
      severity: 'high',
      code: 'BLENDER_UNIVERSAL_FALLBACK',
      message:
        `No per-class Blender template for product_class="${productClass}" (and no LLM-generated ` +
        `blender-scene.py, and no instrument form-meshes.json) — the dossier's cover + module ` +
        `images are the GENERIC UNIVERSAL FALLBACK, NOT this design. Add a hand-coded ` +
        `scripts/blender-templates/<class>-9shot.py (model it on co2-mineralisation-9shot.py) ` +
        `and register it in scripts/render-blender-scene.py CLASS_TO_TEMPLATE — or ensure the ` +
        `universal instrument form grammar wrote form-meshes.json for this class.`,
    })
  }
  if (!heroPresent) {
    findings.push({ severity: 'high', code: 'BLENDER_NO_HERO', message: `No hero/cover image (00-hero.png / blender-cover.png) in ${opts.outDir}.` })
  }
  if (thin.length > 0) {
    findings.push({
      severity: usedUniversalFallback ? 'high' : 'med',
      code: 'BLENDER_THIN_IMAGE',
      message: `${thin.length} render(s) below ${Math.round(MIN_IMAGE_BYTES / 1000)} KB (likely blank/degenerate): ${thin.slice(0, 6).join(', ')}.`,
    })
  }

  return {
    product_class: productClass,
    has_per_class_template: hasPerClassTemplate,
    has_llm_scene: hasLlmScene,
    used_universal_fallback: usedUniversalFallback,
    template_name: templateName,
    hero_present: heroPresent,
    module_images: moduleImages,
    thin_images: thin,
    findings,
    ok: findings.filter((f) => f.severity === 'high').length === 0,
  }
}

export type RenderQualityEnforceMode = 'off' | 'enforcing'
/** off/0/false/shadow → off; anything else truthy → enforcing. Default OFF (shadow). */
export function renderQualityEnforceModeFromEnv(v: string | undefined): RenderQualityEnforceMode {
  const s = String(v ?? '').toLowerCase().trim()
  if (s === '' || s === '0' || s === 'off' || s === 'false' || s === 'shadow') return 'off'
  return 'enforcing'
}
/** Hard-exit only on a HIGH finding when enforcing. A generic-fallback render is
 *  WRONGNESS (wrong object shipped) → blocks; otherwise flags + renders. */
export function evaluateRenderQualityEnforcement(
  result: RenderQualityResult,
  mode: RenderQualityEnforceMode,
): { block: boolean; reason: string | null } {
  if (mode !== 'enforcing') return { block: false, reason: null }
  const high = result.findings.find((f) => f.severity === 'high')
  if (high) return { block: true, reason: `${high.code}: ${high.message}` }
  return { block: false, reason: null }
}
