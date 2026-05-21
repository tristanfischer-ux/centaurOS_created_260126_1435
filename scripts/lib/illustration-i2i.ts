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
  <text x="40" y="${H - 60}" font-family="Helvetica" font-size="14" fill="#3a4754">Use these hex values when a part / surface corresponds to a module above. Otherwise use natural material colours (brushed aluminium, painted steel, copper, polymer, etc.).</text>
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

export function composeHeroPrompt(state: any): string {
  const b = summariseBrief(state)
  const envBlock = b.envelope_text
    ? `Envelope: ${b.envelope_text}.`
    : ''
  return `Photorealistic professional product photograph of ${b.product_display ? `a ${b.product_display}` : 'an industrial engineering system'}. ${envBlock} The visible engineering modules are: ${b.module_list_text}.

Use the provided reference image (a Blender wireframe of the structural layout) ONLY for the OVERALL POSITIONS and PROPORTIONS — where modules sit, how big the container/envelope is, how doors and access panels are arranged. Do NOT replicate the schematic style. The OUTPUT must be photorealistic industrial-installation photography: sharp focus, neutral studio or factory lighting, real materials (brushed aluminium / painted steel / copper / polymer / cables), proper shadows and reflections, no people.

Composition: open or cutaway view that lets the reader see the modules inside the envelope. Slight three-quarter or front-on angle, like a manufacturer's product photo. No text, no labels, no watermarks, no logos, no callouts. Clean factory or studio backdrop. Generate at high resolution.`
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

You have TWO reference images:
1. The system hero (full assembly) — produce an image that reads as a ZOOM-IN of the corresponding region of that hero. Same lighting, same finish, same perspective style, same palette. The viewer should believe this close-up came from the same shoot as the hero.
2. The style contract / palette card — use these hex values when surfaces correspond to the modules listed there; otherwise natural material colours.

Composition: sharp focus on the focal sub-systems, neutral industrial lighting, real materials, no people. NO text, NO labels, NO callouts, NO watermarks. Square aspect ratio. Generate at high resolution.`
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
