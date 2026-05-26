/**
 * scripts/lib/illustration-i2i.ts
 *
 * Shared illustration pipeline for the ForgeOS PDF Engine v2 chain.
 * Implements the validated 2026-05-16 BESS bake-off architecture
 * (mempalace drawer "illustration architecture VALIDATED — image-to-
 * image with hero + programmatic palette card"):
 *
 *   1. Blender renders ONE structural reference image of the system
 *      envelope (deterministic geometry, correct scale, correct
 *      module positions). Schematic wireframe quality — NOT what the
 *      reader sees.
 *   2. Gemini 3.1 Flash Image preview takes the Blender PNG as an
 *      inlineData reference + a text prompt requesting photorealistic
 *      industrial-installation photography. Produces the cover hero
 *      that the reader actually sees.
 *   3. For each module, Gemini Flash Image is called AGAIN with the
 *      hero PNG + a programmatic palette card as two reference images
 *      ("i2i conditioning"). This enforces visual continuity — same
 *      lighting / finish / palette across hero and module zooms.
 *
 * Council verdict (2026-05-21 sub-agent a66e6ee7cdd05270f): port
 * this from `~/Downloads/forgeos-illustration-experiments/run-i2i-v3
 * .tsx`. Bake-off scored:
 *   - text-only gpt-image-1: 5.6/10
 *   - text-only Gemini: 6.8/10
 *   - i2i Gemini with hero + palette card: 8.2/10
 *
 * UNIVERSAL across product classes. Works for any product with an
 * envelope + module decomposition (VF, BESS, HAPS, heat pump, drone,
 * AUV, bioreactor, ev-charger, CGM, edge-AI).
 *
 * COST (measured 2026-05-21 smoke test, Tristan): ~$0.07 per image
 * via OpenRouter (`google/gemini-3.1-flash-image-preview`). 12 images
 * (1 hero + 11 modules) = ~$0.84 per chain. ~13-25 s per image, ~3-5
 * min total with concurrency 3.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { execFileSync } from 'child_process'

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? loadKey('openrouter.env', 'OPENROUTER_API_KEY')
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'google/gemini-3.1-flash-image-preview'

function loadKey(envFile: string, varName: string): string | undefined {
  const candidates = [
    `/Users/tristanfischer/.claude/secrets/${envFile}`,
    `/Users/tristanfischer/secrets/${envFile}`,
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const txt = readFileSync(p, 'utf-8')
    const m = txt.match(new RegExp(`${varName}\\s*=\\s*['"]?([^'"\\s]+)['"]?`))
    if (m) return m[1]
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Core i2i call
// ---------------------------------------------------------------------------

export interface ImageRef {
  data: Buffer
  mime: 'image/png' | 'image/jpeg'
}

/**
 * Call Gemini 3.1 Flash Image preview via OpenRouter's chat/completions
 * endpoint with text + N image references. Returns the generated image
 * as a Buffer, or null if the call failed.
 *
 * OpenRouter's chat API supports image inputs via content blocks of
 * type 'image_url' with data: URLs, and image outputs are returned on
 * `message.images[0].image_url.url` as a data: URL.
 */
export async function callGeminiI2I(opts: {
  prompt: string
  references: ImageRef[]
  maxTokens?: number
  temperature?: number
}): Promise<Buffer | null> {
  if (!OPENROUTER_KEY) {
    console.error('[i2i] OPENROUTER_API_KEY missing')
    return null
  }
  const content: any[] = [{ type: 'text', text: opts.prompt }]
  for (const ref of opts.references) {
    const b64 = ref.data.toString('base64')
    content.push({ type: 'image_url', image_url: { url: `data:${ref.mime};base64,${b64}` } })
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://fractionalforge.com',
      'X-Title': 'ForgeOS i2i illustration',
    },
    body: JSON.stringify({
      model: GEMINI_IMAGE_MODEL,
      messages: [{ role: 'user', content }],
      modalities: ['image', 'text'],
      max_tokens: opts.maxTokens ?? 8192,
      temperature: opts.temperature ?? 0.4,
    }),
  })
  if (!res.ok) {
    console.error(`[i2i] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return null
  }
  const j: any = await res.json()
  if (j?.error) {
    console.error(`[i2i] error: ${JSON.stringify(j.error).slice(0, 300)}`)
    return null
  }
  // Response shape: choices[0].message.images[0].image_url.url (data: URL)
  const msg = j?.choices?.[0]?.message
  const images: string[] = []
  if (Array.isArray(msg?.images)) {
    for (const im of msg.images) {
      if (im?.image_url?.url) images.push(im.image_url.url)
    }
  }
  if (Array.isArray(msg?.content)) {
    for (const part of msg.content) {
      if (part?.type === 'image_url' && part?.image_url?.url) images.push(part.image_url.url)
    }
  }
  if (images.length === 0) {
    console.error(`[i2i] no image in response: ${JSON.stringify(msg).slice(0, 300)}`)
    return null
  }
  const m = images[0].match(/^data:image\/[^;]+;base64,(.+)$/)
  if (!m) {
    console.error(`[i2i] image URL not a data URL: ${images[0].slice(0, 100)}`)
    return null
  }
  return Buffer.from(m[1], 'base64')
}

// ---------------------------------------------------------------------------
// Blender structural reference pass (one cover image)
// ---------------------------------------------------------------------------

const BLENDER_BIN = process.env.BLENDER_BIN
  || '/Applications/Blender.app/Contents/MacOS/Blender'

/**
 * Render the Blender structural reference cover for the brief at
 * statePath. Writes <out-dir>/blender-cover.png, returns the absolute
 * path. Returns null if Blender is absent (fail-soft — chain falls
 * back to text-only Gemini hero).
 */
export function runBlenderCoverPass(statePath: string): string | null {
  if (!existsSync(BLENDER_BIN)) {
    console.error(`[i2i] Blender binary missing at ${BLENDER_BIN}; falling back to text-only hero`)
    return null
  }
  const outDir = dirname(statePath)
  const blenderCover = resolve(outDir, 'blender-cover.png')
  const projectRoot = resolve(__dirname, '..', '..')
  const blenderScript = resolve(projectRoot, 'scripts', 'render-product-blender.py')
  try {
    execFileSync(BLENDER_BIN, [
      '--background',
      '--python', blenderScript,
      '--',
      '--state', statePath,
      '--module', 'cover',
      '--azimuth', '-35',
      '--out', blenderCover,
    ], { stdio: 'pipe', timeout: 60_000 })
    return existsSync(blenderCover) ? blenderCover : null
  } catch (err) {
    console.error(`[i2i] Blender cover render failed: ${(err as Error).message}`)
    return null
  }
}

/**
 * Render the Blender structural reference for a single module (focal
 * module SATURATED, sibling modules GREYSCALE). Same orbital sphere
 * as runBlenderCoverPass — only azimuth varies. The output is the
 * canonical SPATIAL ANCHOR: every part's bounding box is derived from
 * state.moduleDecomposition + max_dimensions_mm, so parts actually
 * fit inside the envelope.
 *
 * 2026-05-21 (Tristan critique): "the blender sub module system meant
 * that all the parts actually fit in the system accurately from a
 * space and layout perspective". Pure photoreal i2i without this
 * reference produces beautiful but spatially fictional zooms. The
 * fix is to pass this PNG as a Gemini i2i reference so the photoreal
 * output respects the same geometry.
 *
 * Returns the absolute output path, or null on failure / Blender
 * absent. Universal across product classes.
 */
export function runBlenderModulePass(opts: {
  statePath: string
  moduleId: string
  azimuth: number
  outPath: string
}): string | null {
  if (!existsSync(BLENDER_BIN)) return null
  const projectRoot = resolve(__dirname, '..', '..')
  const blenderScript = resolve(projectRoot, 'scripts', 'render-product-blender.py')
  try {
    execFileSync(BLENDER_BIN, [
      '--background',
      '--python', blenderScript,
      '--',
      '--state', opts.statePath,
      '--module', opts.moduleId,
      '--azimuth', String(opts.azimuth),
      '--out', opts.outPath,
    ], { stdio: 'pipe', timeout: 60_000 })
    return existsSync(opts.outPath) ? opts.outPath : null
  } catch (err) {
    console.error(`[i2i] Blender module render failed (${opts.moduleId}): ${(err as Error).message}`)
    return null
  }
}

/**
 * Pick a per-module orbital azimuth. Phase8 contract (mempalace
 * forgeos_blender_per_module_quality_bar 2026-05-22 + bess-camera-orbit
 * 2026-05-17): avoid end-on cones around 0°/180° which compress a long
 * container into a thin sliver. Distribute modules across TWO safe
 * arcs (30°-150° and 210°-330°), alternating by index parity so even
 * indices land on +Y side, odd on -Y. Cover stays at -35°.
 *
 * For N=10: 30°, 210°, 60°, 240°, 90°, 270°, 120°, 300°, 150°, 330°.
 * For N=12 (BESS L9): 30°, 210°, 50°, 230°, 70°, 250°, 90°, 270°,
 * 110°, 290°, 130°, 310°, 150°, 330° (stride 20° per arc).
 */
export function moduleAzimuth(moduleIndex: number, totalModules: number): number {
  if (totalModules <= 0) return 0
  const inArc1 = moduleIndex % 2 === 0
  const indexInArc = Math.floor(moduleIndex / 2)
  const countInArc = Math.ceil((totalModules - (inArc1 ? 0 : 1)) / 2)
  const stride = countInArc > 1 ? 120 / (countInArc - 1) : 0
  const arcStart = inArc1 ? 30 : 210
  return arcStart + indexInArc * stride
}

// ---------------------------------------------------------------------------
// Palette card — programmatic SVG → PNG via sharp
// ---------------------------------------------------------------------------

interface PaletteEntry {
  module: string
  hex: string
  label: string
}

const MODULE_PALETTE_HEX: Record<string, string> = {
  energy_storage_source: '#4d6b8c',
  energy_conversion_transduction: '#d18b2a',
  structure_containment: '#6b8fb5',
  sensing_instrumentation: '#5a7d3a',
  control_compute_communication: '#3a7baf',
  safety_protection: '#a83232',
  environmental_interface: '#5b8a72',
  power_distribution: '#c7873a',
  actuation_kinematics: '#8a5a3a',
  maintenance_serviceability: '#7a7a7a',
  hmi_ergonomics: '#9a6b9a',
  mass_fluid_transport_process: '#3a8a7a',
}

function paletteForModules(modules: string[]): PaletteEntry[] {
  return modules.map((m) => ({
    module: m,
    hex: MODULE_PALETTE_HEX[m] ?? '#888888',
    label: m.replace(/_/g, ' '),
  }))
}

/**
 * Build a palette-card PNG that anchors style decisions for the i2i
 * call — colour swatches per module + a finish/lighting contract text
 * block. Gemini sees this as a SECOND reference and locks its output
 * style accordingly.
 *
 * Programmatic SVG → PNG via sharp. Deterministic, no LLM, ~25 ms.
 */
export async function buildPaletteCardPng(modules: string[]): Promise<Buffer> {
  const palette = paletteForModules(modules)
  const W = 1024
  const H = 1024
  const cols = 4
  const rows = Math.ceil(palette.length / cols)
  const swatchW = (W - 80) / cols
  const swatchH = 100
  const startY = 240
  const swatches = palette.map((p, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = 40 + col * swatchW
    const y = startY + row * (swatchH + 36)
    return `
      <rect x="${x}" y="${y}" width="${swatchW - 16}" height="${swatchH}" fill="${p.hex}" stroke="#1a1f26" stroke-width="2" />
      <text x="${x + 8}" y="${y + swatchH + 22}" font-family="Helvetica" font-size="14" fill="#1a1f26">${p.hex} · ${p.label}</text>
    `
  }).join('\n')
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f5f6f8" />
  <text x="40" y="60" font-family="Helvetica" font-size="32" font-weight="bold" fill="#1a1f26">ForgeOS — Style Contract</text>
  <text x="40" y="100" font-family="Helvetica" font-size="16" fill="#3a4754">Photorealistic industrial photography. Sharp focus, neutral studio or factory lighting.</text>
  <text x="40" y="124" font-family="Helvetica" font-size="16" fill="#3a4754">No text, no labels, no watermarks, no people. Clean composition.</text>
  <text x="40" y="148" font-family="Helvetica" font-size="16" fill="#3a4754">Match the reference image's perspective, scale, and module positions exactly.</text>
  <text x="40" y="220" font-family="Helvetica" font-size="18" font-weight="bold" fill="#1a1f26">Module palette</text>
  ${swatches}
  <text x="40" y="${H - 60}" font-family="Helvetica" font-size="14" fill="#3a4754">These colours suggest each module's family — respect them LOOSELY when a focal surface clearly belongs to a module. For most surfaces prefer natural material colours (brushed aluminium, painted steel, copper, polymer, anodised, powder-coated, etc.).</text>
</svg>`
  // Lazy-import sharp so this lib stays import-safe even when sharp isn't installed
  const sharp = (await import('sharp')).default
  const png = await sharp(Buffer.from(svg, 'utf-8')).png().toBuffer()
  return png
}

// ---------------------------------------------------------------------------
// Prompt composers
// ---------------------------------------------------------------------------

interface BriefSummary {
  product_class: string
  product_display: string
  envelope_text: string | null
  module_list_text: string
}

function summariseBrief(state: any): BriefSummary {
  const productClass = String(state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? '').trim()
  const productDisplay = String(state?.parsedBrief?.product_display_name ?? productClass.replace(/_/g, ' ')).trim()
  const maxDim = state?.parsedBrief?.constraints?.max_dimensions_mm
  let envelope_text: string | null = null
  if (maxDim?.w && maxDim?.d && maxDim?.h) {
    envelope_text = `${(Number(maxDim.w) / 1000).toFixed(1)} m long × ${(Number(maxDim.d) / 1000).toFixed(1)} m wide × ${(Number(maxDim.h) / 1000).toFixed(1)} m tall`
  }
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  const module_list_text = modules.slice(0, 12).map((m) => {
    const id = String(m?.module ?? '')
    const name = String(m?.display_name ?? id).replace(/_/g, ' ')
    return name
  }).join(', ')
  return { product_class: productClass, product_display: productDisplay, envelope_text, module_list_text }
}

// Council 2026-05-21 verdict Q5: "Photorealistic industrial-installation"
// is wrong for at least 3 of 10 product classes. CGM is a hospital-reject
// in a factory shoot; HAPS wing reads as a wind-turbine blade; consumer
// drone needs retail style. Class-aware style strings.
const STYLE_BY_CLASS: Record<string, string> = {
  // Medical / wearable
  cgm: 'clinical product photography. Soft daylight, clean white or pale-grey backdrop, medical-device catalogue aesthetic. Sharp focus on the device; supporting elements minimal.',
  wearable_medical_device: 'clinical product photography. Soft daylight, clean white or pale-grey backdrop, medical-device catalogue aesthetic. Sharp focus on the device; supporting elements minimal.',
  insulin_pump: 'clinical product photography. Soft daylight, clean white or pale-grey backdrop, medical-device catalogue aesthetic.',
  // Aerospace / unmanned aviation
  haps: 'aerospace prototype photography. Composite-shop or hangar lighting, polished concrete floor, the aircraft posed three-quarter front with one wing visible. Carbon-fibre, painted-aluminium, kapton-tape finishes. Like an Airbus / BAE programme photograph.',
  // Subsea / autonomous marine
  auv: 'autonomous marine vehicle photography. Workshop or dry-dock lighting, the hull resting on cradles. Polished anodised aluminium, anti-fouling paint, syntactic foam. Like a Kongsberg or Teledyne product page.',
  // Consumer
  consumer_cinematography_drone: 'retail product photography. Soft studio gradient backdrop, key light + fill, slight reflection on a glossy white surface, drone hovering or angled three-quarter. Premium consumer-electronics aesthetic.',
  drone: 'retail product photography. Soft studio gradient backdrop, key light + fill, premium consumer-electronics aesthetic.',
  // Industrial / installed default — covers BESS, EV charger, heat pump,
  // bioreactor, edge-AI rack, vertical farm, PV inverter
  __default: 'photorealistic industrial-installation photography. Sharp focus, neutral studio or factory lighting, real materials (brushed aluminium / painted steel / copper / polymer / cables), proper shadows and reflections, no people.',
}

function styleForClass(productClass: string): string {
  const key = String(productClass ?? '').toLowerCase().trim()
  return STYLE_BY_CLASS[key] ?? STYLE_BY_CLASS.__default
}

// Stronger text-suppression imperative (council Q8). The 5-word negative
// list "no text, no labels, no watermarks" was insufficient per the
// gpt-image-1 garbled-text drawer. Imperative form lands more reliably.
const NO_TEXT_NEGATIVE = `Do NOT include any text, words, letters, numbers, typography, written labels, dimension callouts, or watermarks in the image whatsoever. Surfaces must be unmarked.`

// ---------------------------------------------------------------------------
// Per-class primary structural feature — for internal-count enforcement
// ---------------------------------------------------------------------------
//
// Each entry identifies ONE deterministic quantity key from
// state.engineeringContract.quantities whose numeric value is the
// canonical "primary structural feature count" for that class (the thing
// the buyer's eye immediately counts: racks in a BESS, grow tiers in a VF,
// blades on a turbine, etc.).
//
// Universal fallback: if product_class is absent from this map the count
// block is SKIPPED entirely — no fabrication for unknown classes.
//
// quantity_key:  the key to read from state.engineeringContract.quantities
// noun:          singular noun used in the prompt
// noun_plural:   plural noun used in the prompt
// arrangement_hint: optional guidance on spatial arrangement

interface PrimaryFeature {
  quantity_key: string
  noun: string
  noun_plural: string
  arrangement_hint: string
}

const PRIMARY_FEATURE_BY_CLASS: Record<string, PrimaryFeature> = {
  // ---- Energy storage / BESS -------------------------------------------------
  bess: {
    quantity_key: 'rack_count',
    noun: 'battery rack',
    noun_plural: 'battery racks',
    arrangement_hint: 'arranged side-by-side in a single row along the container long axis',
  },
  // ---- Vertical farm ---------------------------------------------------------
  vertical_farm: {
    quantity_key: 'tray_count',
    noun: 'grow tray',
    noun_plural: 'grow trays',
    arrangement_hint: 'stacked vertically in trolley columns visible in rows from the front',
  },
  // ---- HAPS (high-altitude pseudo-satellite) ---------------------------------
  haps: {
    quantity_key: 'wing_area_m2',  // no rack-like count; use module count fallback
    noun: 'solar panel bay',
    noun_plural: 'solar panel bays',
    arrangement_hint: 'distributed along the full wingspan from root to tip',
  },
  // ---- Drone -----------------------------------------------------------------
  drone: {
    quantity_key: 'motor_count',
    noun: 'motor and propeller arm',
    noun_plural: 'motor and propeller arms',
    arrangement_hint: 'evenly distributed around the central frame',
  },
  // ---- AUV (autonomous underwater vehicle) -----------------------------------
  auv: {
    quantity_key: 'thruster_count',
    noun: 'thruster',
    noun_plural: 'thrusters',
    arrangement_hint: 'mounted at the stern and on lateral frames',
  },
  // ---- Wind turbine ----------------------------------------------------------
  wind_turbine: {
    quantity_key: 'blade_count',
    noun: 'blade',
    noun_plural: 'blades',
    arrangement_hint: 'attached to the hub at equal 120° intervals',
  },
  // ---- H2 electrolyser -------------------------------------------------------
  h2_electrolyser: {
    quantity_key: 'stack_count',
    noun: 'electrolyser stack',
    noun_plural: 'electrolyser stacks',
    arrangement_hint: 'arranged in a rack or skid frame within the enclosure',
  },
  // ---- PEMFC (proton-exchange membrane fuel cell) ----------------------------
  pemfc: {
    quantity_key: 'cells_count',
    noun: 'membrane electrode assembly cell',
    noun_plural: 'membrane electrode assembly cells',
    arrangement_hint: 'stacked in series within the fuel-cell stack housing',
  },
  // ---- CNC machine -----------------------------------------------------------
  cnc_machine: {
    quantity_key: 'axis_count',
    noun: 'machining axis',
    noun_plural: 'machining axes',
    arrangement_hint: 'reflected in the number of controlled linear and rotary stages visible on the machine',
  },
  // ---- EV charger ------------------------------------------------------------
  // No single "count" quantity — use module count fallback (quantity_key absent → fallback)
  // ---- eVTOL -----------------------------------------------------------------
  evtol: {
    quantity_key: 'motor_count',
    noun: 'lift motor and rotor',
    noun_plural: 'lift motors and rotors',
    arrangement_hint: 'mounted at wingtip and canard positions around the fuselage',
  },
  // ---- Humanoid robot --------------------------------------------------------
  humanoid: {
    quantity_key: 'dof_count_total',
    noun: 'degrees-of-freedom joint',
    noun_plural: 'degrees-of-freedom joints',
    arrangement_hint: 'distributed across hips, knees, ankles, shoulders, elbows, wrists, and neck',
  },
  // ---- Bioreactor ------------------------------------------------------------
  // Single vessel — no repeating count. quantity_key absent → fallback to module count.
}

// ---------------------------------------------------------------------------
// Per-class exterior engineering detail
// ---------------------------------------------------------------------------
//
// String describing what exterior engineering features the product class
// MUST show. Gemini i2i tends to produce "clean studio props" without
// these — the buyer's eye reads them as unrealistic on sight.
//
// Universal fallback: if product_class absent from this map, the exterior
// detail block is SKIPPED — no fabrication.

const EXTERIOR_DETAIL_BY_CLASS: Record<string, string> = {
  // ---- Energy storage / BESS -------------------------------------------------
  bess: 'FLAT roof (no decorative slope, no colour stripes) with roof-walk planks, HVAC/chiller penetrations, and deflagration vent panels (flush louvres per NFPA 68). Sides show cable glands and earth-bonding lugs near the door end, fire-detection externals (addressable smoke/heat detector heads) on the exterior wall, and a hinged access door with a slam-latch handle.',
  // ---- Vertical farm ---------------------------------------------------------
  vertical_farm: 'Side-mounted irrigation supply and return manifold ports, electrical service entry gland (HV cable entry + earthing label), a hinged control panel access door, and a condensate drain outlet at the base.',
  // ---- HAPS ------------------------------------------------------------------
  haps: 'Control-surface actuator fairings at the trailing edge, pitot-static sensor ports near the nose, stubby antenna mounts underneath the fuselage pod, and retracted-landing-gear bay covers on the underbelly.',
  // ---- Drone -----------------------------------------------------------------
  drone: 'Visible motor nacelles with prop-guard mounts, landing gear legs with anti-vibration feet, battery bay hatch on the underside, and payload gimbal mount below centre.',
  // ---- AUV -------------------------------------------------------------------
  auv: 'Flood-port grid on the forward fairing, pressure-rated connector penetrators on the end-cap, acoustic transducer dome on the nose, syntactic foam blocks bonded to the hull sides, and lift-point slots on the top rail.',
  // ---- Wind turbine ----------------------------------------------------------
  wind_turbine: 'Blade root bolted flanges, nacelle ventilation louvres, lightning-receptor tips on each blade, and a service crane pick-point beam visible at the nacelle top.',
  // ---- H2 electrolyser -------------------------------------------------------
  h2_electrolyser: 'Visible H2 and O2 outlet flanges on the stack manifold, safety pressure-relief valve (red handle) on the hydrogen circuit, deionised-water inlet port, and HV power-cable entry glands on the rectifier cabinet.',
  // ---- PEMFC -----------------------------------------------------------------
  pemfc: 'H2 inlet and exhaust ports with colour-coded fittings (green = hydrogen, blue = coolant), air-intake filter box with pre-filter housing, coolant manifold with bleed nipples, and mounting flange with anti-vibration isolators.',
  // ---- EV charger ------------------------------------------------------------
  ev_charger: 'Liquid-cooled charging cable with CCS2 holster, RFID reader on the front fascia, ventilation slots on the lower side panels, ground-fault indicator LED strip visible on the pedestal, and padlock hasp on the access panel.',
  // ---- Heat pump (residential / commercial) ----------------------------------
  heat_pump_residential: 'Top-discharge fan grille with finger-guard mesh, refrigerant service ports (Schrader valves) on the side panel, electrical conduit entry at the base, and vibration-isolation feet.',
  // ---- CNC machine -----------------------------------------------------------
  cnc_machine: 'Chip-conveyor outlet at the base rear, coolant spray nozzle fittings inside the guarding, pneumatic quick-connects on the side panel, and an emergency-stop mushroom button at each operator station.',
  // ---- eVTOL -----------------------------------------------------------------
  evtol: 'Visible rotor hub retention bolts, passenger door sill step, emergency parachute hatch cover on the fuselage top, and nav/strobe light pods at wingtips.',
  // ---- Bioreactor ------------------------------------------------------------
  bioreactor: 'Sterile sparger port at the vessel bottom, agitator shaft seal housing at the top with sterile vent filter, sample valve (tri-clamp, 316L), and jacket supply/return flanges on the side.',
  // ---- Edge AI server rack ---------------------------------------------------
  edge_ai: 'Blanking panels in unused 1U slots, power-distribution unit (PDU) strip on the right rail, grounding lug on the frame, cable management arm folded at the rear, and front-door lock cylinder.',
  // ---- SMR (small modular reactor) -------------------------------------------
  smr: 'Containment dome hatch with bolted flange ring, primary coolant isolation valve handles visible at grade, passive safety water tank inlet on the shield building, and dosimetry instrument ports on the outer wall.',
  // ---- Quantum computer ------------------------------------------------------
  quantum_computer: 'Dilution refrigerator flange stack (gold-coloured can series narrowing from top), coaxial cable tree entering the topmost flange, vacuum pump service port at the base, and vibration-isolation active-pneumatic mounts.',
}

// ---------------------------------------------------------------------------
// Internal count helper
// ---------------------------------------------------------------------------

/**
 * Resolve the primary structural feature count for the given product class.
 * Reads from state.engineeringContract.quantities[quantity_key].value,
 * falling back to the module count when the key is absent.
 * Returns null if neither source yields a valid positive integer.
 */
function resolvePrimaryFeatureCount(
  state: any,
  productClass: string,
): { count: number; noun: string; noun_plural: string; arrangement_hint: string } | null {
  const feat = PRIMARY_FEATURE_BY_CLASS[productClass]
  if (!feat) return null  // unknown class — skip block

  // Attempt contract quantities first
  const quantities = state?.engineeringContract?.quantities ?? {}
  const qty = quantities[feat.quantity_key]
  const contractValue = qty?.value !== undefined ? Number(qty.value) : NaN

  if (Number.isFinite(contractValue) && contractValue > 0 && Number.isInteger(contractValue)) {
    return { count: contractValue, noun: feat.noun, noun_plural: feat.noun_plural, arrangement_hint: feat.arrangement_hint }
  }

  // Fallback: total module count from moduleDecomposition
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  if (modules.length > 0) {
    // Only use module count if it's semantically meaningful for this class
    // (i.e. the quantity_key miss was a data-availability issue, not a
    // "this class doesn't have a repeating structural count" situation).
    // We don't fabricate — return null so the prompt block is omitted.
    return null
  }

  return null
}

export function composeHeroPrompt(state: any): string {
  const b = summariseBrief(state)
  const style = styleForClass(b.product_class)

  // --- FIX 1: STRICT DIMENSIONS block ---
  // Conditional on envelope_text being non-null. When present, replace the
  // soft "Envelope: X m long × Y m wide × Z m tall." with a hard constraint
  // block that survives Gemini's tendency to free-style proportions.
  let strictDimensionsBlock = ''
  if (b.envelope_text) {
    // Parse the three values back out of the formatted string so we can
    // emit them individually with ratio context.
    const maxDim = state?.parsedBrief?.constraints?.max_dimensions_mm
    if (maxDim?.w && maxDim?.d && maxDim?.h) {
      const lengthM = (Number(maxDim.w) / 1000).toFixed(1)
      const widthM  = (Number(maxDim.d) / 1000).toFixed(1)
      const heightM = (Number(maxDim.h) / 1000).toFixed(1)
      const lengthNum = Number(maxDim.w)
      const widthNum  = Number(maxDim.d)
      const ratio = widthNum > 0 ? (lengthNum / widthNum).toFixed(1) : null
      const ratioHint = ratio ? ` The width:length ratio is approximately 1:${ratio} — this is a LONG, narrow object, not a cube or stubby box.` : ''
      strictDimensionsBlock = `
**STRICT DIMENSIONS** (do not shorten, do not scale, do not pad — these are hard constraints):
  Length: ${lengthM} m
  Width:  ${widthM} m
  Height: ${heightM} m
${ratioHint}
The rendered object MUST visually honour these proportions. A buyer familiar with this product class will immediately spot wrong proportions.`
    } else {
      // Fallback: use the pre-formatted envelope_text string
      strictDimensionsBlock = `
**STRICT DIMENSIONS** (do not shorten, do not scale, do not pad):
  ${b.envelope_text}
The rendered object MUST visually honour these proportions.`
    }
  }

  // --- FIX 2: INTERNAL COUNT block ---
  // Conditional on PRIMARY_FEATURE_BY_CLASS having an entry for this class
  // AND the contract supplying a valid count. Skip entirely otherwise.
  let internalCountBlock = ''
  const primaryFeature = resolvePrimaryFeatureCount(state, b.product_class)
  if (primaryFeature) {
    internalCountBlock = `
**INTERNAL COUNT** (exact — do not invent fewer or more):
  The interior shows EXACTLY ${primaryFeature.count} ${primaryFeature.noun_plural} ${primaryFeature.arrangement_hint}.
  Do not show fewer; do not invent more. A buyer will count them.`
  }

  // --- FIX 3: EXTERIOR DETAIL block ---
  // Conditional on EXTERIOR_DETAIL_BY_CLASS having an entry for this class.
  const exteriorDetail = EXTERIOR_DETAIL_BY_CLASS[b.product_class]
  const exteriorDetailBlock = exteriorDetail
    ? `
**EXTERIOR ENGINEERING DETAIL** (required — these are NOT decorative):
  ${exteriorDetail}`
    : ''

  return `${style.charAt(0).toUpperCase() + style.slice(1)} of ${b.product_display ? `a ${b.product_display}` : 'an industrial engineering system'}. The visible engineering modules are: ${b.module_list_text}.
${strictDimensionsBlock}
${internalCountBlock}
${exteriorDetailBlock}

Use the provided reference image (a Blender wireframe of the structural layout) ONLY for the OVERALL POSITIONS and PROPORTIONS — where modules sit, how big the envelope is, how doors and access panels are arranged. Do NOT replicate the schematic style. The OUTPUT must match the style description above.

Composition: open or cutaway view that lets the reader see the modules inside the envelope (for installed products), or a clean three-quarter hero (for consumer / wearable / aerospace). No people. ${NO_TEXT_NEGATIVE} Generate at high resolution.`
}

export function composeModulePrompt(state: any, moduleId: string): string {
  const b = summariseBrief(state)
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  const mod = modules.find((m: any) => m?.module === moduleId)
  const display = String(mod?.display_name ?? moduleId).replace(/_/g, ' ')
  const briefText = String(mod?.module_brief ?? '').slice(0, 300)
  const subModules: any[] = Array.isArray(mod?.sub_modules) ? mod.sub_modules : []
  const subList = subModules.slice(0, 5).map((s: any) => String(s?.name_human ?? s?.id ?? '').replace(/_/g, ' ')).join(', ')
  return `Photorealistic close-up photograph of the "${display}" module within a ${b.product_display}. Module description: ${briefText}. Key sub-systems visible: ${subList}.

You have THREE reference images (the order matters):
1. The system hero (full assembly) — produce an image that reads as a ZOOM-IN of the corresponding region of that hero. Same lighting, same finish, same perspective style, same palette. The viewer should believe this close-up came from the same shoot as the hero.
2. The style contract / palette card — use these hex values when surfaces correspond to the modules listed there; otherwise natural material colours.
3. A Blender schematic wireframe showing the focal module SATURATED in colour with sibling modules in GREYSCALE. This is the SPATIAL ANCHOR — the focal module's geometry, bounding box, and position relative to the envelope are CORRECT in this wireframe. Respect them. The parts you draw MUST FIT inside the focal module's bounds. Use the wireframe to size and position the focal sub-systems; then paint over with photorealistic finish (matching reference 1's style).

Composition: sharp focus on the focal sub-systems, neutral lighting matching the hero, real materials, no people. ${NO_TEXT_NEGATIVE} Square aspect ratio. Generate at high resolution.`
}

// ---------------------------------------------------------------------------
// Convenience: read image as ImageRef
// ---------------------------------------------------------------------------

export function readImageRef(path: string): ImageRef | null {
  if (!existsSync(path)) return null
  const data = readFileSync(path)
  const mime: 'image/png' | 'image/jpeg' = path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')
    ? 'image/jpeg' : 'image/png'
  return { data, mime }
}

export function writeImage(path: string, data: Buffer): void {
  writeFileSync(path, data)
}
