/**
 * audit-dossier-coordination.ts — "is the rendered dossier COORDINATED with all the
 * subsystems the engine now produces?" (Tristan 2026-06-11: the PDF must be fully
 * coordinated with the new work — drawings, manufacturing layer, cost grounding, the
 * clean CAD render, the Part-1 BFD — not a hand-patched re-render).
 *
 * This is a UNIVERSAL, deterministic coordination gate (no LLM). It reads a finished
 * chain output dir and checks that every new subsystem actually flowed through to the
 * artifacts + the rendered PDF, and that the document is internally scale-consistent
 * with its OWN brief headline (so a stale half-scale number can't leak through).
 *
 * Usage:  npx tsx scripts/audit-dossier-coordination.ts <outDir> [--pdf <file>]
 * Exit:   0 = all HARD checks pass · 1 = at least one HARD check failed.
 *
 * It complements (does not replace) gate 10 (audit-pdf-bom) + gate 11
 * (audit-pdf-layout): those check BoM arithmetic + layout overlap; this checks that
 * the PART-2 / drawings / render / cost subsystems are PRESENT + consistent.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { execFileSync } from 'child_process'

type Sev = 'HARD' | 'SOFT'
interface Check { name: string; ok: boolean; sev: Sev; detail: string }
const checks: Check[] = []
const add = (name: string, ok: boolean, sev: Sev, detail: string) => checks.push({ name, ok, sev, detail })

const outDir = resolve(process.argv[2] || '')
if (!outDir || !existsSync(outDir)) {
  console.error('Usage: npx tsx scripts/audit-dossier-coordination.ts <outDir> [--pdf <file>]')
  process.exit(2)
}
const pdfFlag = process.argv.indexOf('--pdf')
let pdfPath = pdfFlag > -1 ? resolve(process.argv[pdfFlag + 1]) : ''

function readJson(p: string): any { try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null } }

// ── locate the rendered PDF (largest *.pdf in outDir) if not supplied ──────────
if (!pdfPath) {
  const pdfs = readdirSync(outDir).filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => ({ f, sz: statSync(join(outDir, f)).size })).sort((a, b) => b.sz - a.sz)
  if (pdfs.length) pdfPath = join(outDir, pdfs[0].f)
}
const havePdf = pdfPath && existsSync(pdfPath)
add('rendered PDF present', !!havePdf, 'HARD', havePdf ? pdfPath : 'no .pdf in outDir')

// pdftotext → full text (used by several checks)
let pdfText = ''
let pageCount = 0
if (havePdf) {
  try { pdfText = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }) }
  catch { try { pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }) } catch {} }
  try { const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf-8' }); const m = info.match(/Pages:\s+(\d+)/); pageCount = m ? Number(m[1]) : 0 } catch {}
}
add('PDF has a sensible page count (>= 40)', pageCount >= 40, 'SOFT', `${pageCount} pages`)

// ── 1. the 8 design-and-construction drawings on disk + manifest ───────────────
const drawDir = join(outDir, 'drawings')
const manifest = readJson(join(outDir, 'drawing-manifest.json'))
const drawPngs = existsSync(drawDir) ? readdirSync(drawDir).filter(f => /\.png$/i.test(f)) : []
add('drawing-manifest.json present', !!manifest, 'HARD', manifest ? `${Object.keys(manifest).length} keys` : 'missing')
add('>= 6 drawing PNGs generated', drawPngs.length >= 6, 'HARD', `${drawPngs.length} PNGs in drawings/`)
const manifestHero = manifest && (manifest.hero || manifest.block_flow_diagram)
add('manifest carries a hero / BFD', !!manifestHero, 'SOFT', manifestHero ? String(manifestHero).split('/').pop()! : 'none')

// ── 2. the clean universal-CAD render wired into state ─────────────────────────
const statePath = ['state.json', 'final-state.json'].map(f => join(outDir, f)).find(existsSync) || join(outDir, 'state.json')
const state = readJson(statePath)
const cadHero = state && state.cad_hero_image_path
const cadHeroExists = cadHero && existsSync(cadHero.startsWith('/') ? cadHero : join(outDir, cadHero))
add('state.cad_hero_image_path set', !!cadHero, 'SOFT', cadHero || 'absent (template hero or skipped)')
if (cadHero) add('  └ CAD hero file exists', !!cadHeroExists, 'HARD', cadHeroExists ? 'ok' : 'path set but file missing (STALE)')

// ── 3. Part-2 manufacturing layer + distribution present in the PDF ────────────
// Precise anchors = the EXACT rendered section headings (not generic prose words —
// /manufactur/ etc. false-positive on any process-plant text; calibrated vs v21).
const sectionProbe: Array<[string, RegExp, Sev]> = [
  ['Part-1 process-flow page (BFD)', /\bprocess flow\b|block[- ]flow diagram/i, 'SOFT'],
  ['Part-2 "How it is manufactured"', /how it is manufactured|made items\s*[—–-]\s*manufacturing route/i, 'HARD'],
  ['Part-2 assembly & erection sequence', /assembly & erection|assembly and erection|\berection sequence\b/i, 'HARD'],
  ['Part-3 Distribution & cabling BoM', /distribution & cabling|distribution and cabling/i, 'HARD'],
  ['Part-2 Design drawings page', /\bdesign drawings\b|general arrangement|single[- ]line diagram|\bP&ID\b/i, 'SOFT'],
  ['Cost methodology (DOE/NETL grounding)', /DOE\/NETL|\bNETL\b|material take[- ]?off|\bcost basis\b|AACE Class\s*4|six[- ]tenths/i, 'SOFT'],
]
for (const [label, rx, sev] of sectionProbe) {
  const ok = rx.test(pdfText)
  add(label, ok, havePdf ? sev : 'SOFT', ok ? 'present' : (havePdf ? 'NOT FOUND in PDF text' : 'no PDF to scan'))
}

// ── 4. cost grounding actually applied (partVerifications provenance) ──────────
const pv = readJson(join(outDir, '10-part-verifications.json')) || (state && state.partVerifications)
if (Array.isArray(pv)) {
  const grounded = pv.filter((p: any) => {
    const prov = JSON.stringify(p.cost_provenance ?? p.provenance ?? p.basis ?? '').toLowerCase()
    return /doe|netl|take[- ]?off|curve|distributor|cache|corpus/.test(prov)
  }).length
  add('>= 1 BoM line cost-grounded (DOE/NETL/cache)', grounded >= 1, 'SOFT', `${grounded}/${pv.length} grounded`)
}

// ── 5. scale-consistency vs the brief's OWN headline metric ────────────────────
const brief = readJson(join(outDir, '1-parsed-brief.json'))
const tp = brief && brief.constraints && brief.constraints.target_performance
const headline = tp && (tp.value ?? (tp.metrics && tp.metrics[0] && tp.metrics[0].value))
const headlineUnit = tp && (tp.unit ?? (tp.metrics && tp.metrics[0] && tp.metrics[0].unit)) || ''
if (headline && havePdf) {
  // the headline value must appear in the PDF (formatted with or without a thousands comma)
  const v = Number(headline)
  const variants = [String(v), v.toLocaleString('en-US'), v.toLocaleString('en-GB')]
  const present = variants.some(s => pdfText.includes(s))
  add(`brief headline (${headline} ${headlineUnit}) appears in PDF`, present, 'HARD', present ? 'ok' : `none of ${variants.join(' / ')} found`)
  // dump every "<n> t/yr" and "<n> kg/h" figure so scale leakage is eyeballable
  const tpy = Array.from(new Set((pdfText.match(/[\d,\.]+\s*(?:t\/yr|tonnes?\/year|tpy|t\/year)/gi) || []).map(s => s.trim()))).slice(0, 30)
  const kgh = Array.from(new Set((pdfText.match(/[\d,\.]+\s*kg\/h/gi) || []).map(s => s.trim()))).slice(0, 30)
  add('  └ throughput figures (eyeball for stale half-scale)', true, 'SOFT', `t/yr: ${tpy.join(', ') || '—'}  ||  kg/h: ${kgh.join(', ') || '—'}`)
}

// ── 6. fold in the existing hard gates (BoM + layout) if available ─────────────
function runGate(label: string, cmd: string, args: string[]): void {
  try { execFileSync(cmd, args, { encoding: 'utf-8', stdio: 'pipe' }); add(label, true, 'HARD', 'exit 0') }
  catch (e: any) { add(label, false, 'HARD', `exit ${e.status ?? '?'} — ${String(e.stdout || e.message).split('\n').slice(-3).join(' ').slice(0, 160)}`) }
}
const here = dirname(new URL(import.meta.url).pathname)
if (existsSync(join(here, 'audit-pdf-bom.ts'))) runGate('gate 10 · BoM quality', 'npx', ['tsx', join(here, 'audit-pdf-bom.ts'), outDir])
if (havePdf && existsSync(join(here, 'audit-pdf-layout.py'))) runGate('gate 11 · layout overlap', 'python3', [join(here, 'audit-pdf-layout.py'), pdfPath])

// ── report ─────────────────────────────────────────────────────────────────────
const hardFails = checks.filter(c => c.sev === 'HARD' && !c.ok)
const softFails = checks.filter(c => c.sev === 'SOFT' && !c.ok)
console.log(`\n  DOSSIER COORDINATION AUDIT — ${outDir}`)
console.log(`  ${'-'.repeat(72)}`)
for (const c of checks) {
  const mark = c.ok ? '✓' : (c.sev === 'HARD' ? '✗ HARD' : '· soft')
  console.log(`  ${c.ok ? '✓' : (c.sev === 'HARD' ? '✗' : '·')} [${c.sev}] ${c.name}\n        ${c.detail}`.replace(/\n        $/, ''))
}
console.log(`  ${'-'.repeat(72)}`)
console.log(`  ${hardFails.length === 0 ? 'PASS' : 'FAIL'} — ${checks.filter(c => c.ok).length}/${checks.length} checks ok; ${hardFails.length} HARD fail, ${softFails.length} soft.`)
if (hardFails.length) console.log('  HARD fails: ' + hardFails.map(c => c.name).join('; '))
process.exit(hardFails.length === 0 ? 0 : 1)
