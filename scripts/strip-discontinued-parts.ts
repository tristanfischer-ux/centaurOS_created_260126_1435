/**
 * @file strip-discontinued-parts.ts
 *
 * One-shot maintenance script — removes explicitly discontinued parts from a
 * state.json BoM.
 *
 * Background (2026-05-17 Track D audit): 17 discontinued parts were found
 * across active state.json files. Serving discontinued parts to PDF output
 * misleads the user into sourcing parts that are no longer available.
 *
 * Usage:
 *   npx tsx scripts/strip-discontinued-parts.ts <path/to/state.json> [--dry-run]
 *
 * Output:
 *   Writes <path/to/state.stripped.json> (original file untouched).
 *   --dry-run prints the list of parts that would be stripped without writing.
 *
 * DO NOT run automatically — invoke manually per-state-file.
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname, basename, extname } from 'path'

// ---------------------------------------------------------------------------
// Discontinued part numbers — case-insensitive, prefix match for Murata GRM.
// Source: 2026-05-17 Track D audit (17 confirmed discontinued).
// ---------------------------------------------------------------------------
const DISCONTINUED_PARTS: string[] = [
  // Murata GRM (multilayer ceramic capacitors — any GRMxxxxx that is discontinued)
  // Matched as a prefix: any MPN starting with GRM and flagged discontinued.
  // Listed individually below — add more as confirmed:
  'GRM155R71C104KA88D',
  'GRM188R71H104KA93D',
  'GRM21BR61A106KE18L',
  'GRM31CR61E226KE15L',
  // Eaton / Bussmann
  'BUSSMANN170M1566',
  '170M1566',
  // Cisco (end-of-sale / end-of-life)
  'IE-3000-8TC',
  'IE-3000-4TC',
  // Bosch Sensortec
  'BMP388',
  // STMicroelectronics
  'LIS3MDL',
  // Qorvo
  'TQP3M9009',
  // Micron Technology
  'MT53D512M32D2NP',
  'MT53D512',
]

/**
 * Returns true if a manufacturer_part_number should be stripped.
 * Rules:
 *  1. Exact case-insensitive match against the DISCONTINUED_PARTS list.
 *  2. Any MPN that starts with "GRM" and appears in the discontinued prefix
 *     set (catches Murata variants not individually listed).
 */
function isDiscontinued(mpn: string): boolean {
  if (!mpn) return false
  const norm = mpn.trim().toUpperCase()

  for (const d of DISCONTINUED_PARTS) {
    if (norm === d.toUpperCase()) return true
    // Prefix match for GRM family
    if (d.toUpperCase().startsWith('GRM') && norm.startsWith(d.toUpperCase())) return true
  }
  return false
}

interface BomLine {
  manufacturer_part_number?: string
  mpn?: string
  [key: string]: unknown
}

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('Usage: npx tsx scripts/strip-discontinued-parts.ts <path/to/state.json> [--dry-run]')
    process.exit(1)
  }

  const inputPath = resolve(args[0])
  const dryRun = args.includes('--dry-run')

  console.log(`[strip-discontinued] Reading: ${inputPath}`)
  console.log(`[strip-discontinued] Dry-run: ${dryRun}`)
  console.log(`[strip-discontinued] Discontinued parts list (${DISCONTINUED_PARTS.length} entries):`)
  for (const p of DISCONTINUED_PARTS) console.log(`  - ${p}`)

  let state: Record<string, unknown>
  try {
    state = JSON.parse(readFileSync(inputPath, 'utf8')) as Record<string, unknown>
  } catch (err) {
    console.error(`[strip-discontinued] Failed to read/parse ${inputPath}: ${(err as Error).message}`)
    process.exit(1)
  }

  // Locate bom_lines — may be nested under various keys depending on pipeline version.
  // Try the common locations.
  function findAndStrip(obj: Record<string, unknown>, path: string): number {
    let stripped = 0

    if (Array.isArray(obj['bom_lines'])) {
      const before = (obj['bom_lines'] as BomLine[]).length
      obj['bom_lines'] = (obj['bom_lines'] as BomLine[]).filter(line => {
        const mpn = (line.manufacturer_part_number ?? line.mpn ?? '') as string
        if (isDiscontinued(mpn)) {
          console.log(`[strip-discontinued] Removing discontinued part at ${path}.bom_lines: "${mpn}"`)
          return false
        }
        return true
      })
      stripped += before - (obj['bom_lines'] as BomLine[]).length
    }

    // Recurse into nested objects (handles module-scoped BoM structure)
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'bom_lines') continue  // already handled
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        stripped += findAndStrip(val as Record<string, unknown>, `${path}.${key}`)
      }
    }

    return stripped
  }

  const totalStripped = findAndStrip(state, 'root')

  if (totalStripped === 0) {
    console.log('[strip-discontinued] No discontinued parts found — nothing to strip.')
    process.exit(0)
  }

  console.log(`\n[strip-discontinued] Total lines stripped: ${totalStripped}`)

  if (dryRun) {
    console.log('[strip-discontinued] Dry-run mode — no file written.')
    process.exit(0)
  }

  // Write to .stripped.json suffix (original file untouched)
  const dir = dirname(inputPath)
  const ext = extname(basename(inputPath))
  const base = basename(inputPath, ext)
  const outputPath = resolve(dir, `${base}.stripped${ext}`)

  writeFileSync(outputPath, JSON.stringify(state, null, 2), 'utf8')
  console.log(`[strip-discontinued] Written: ${outputPath}`)
}

main()
