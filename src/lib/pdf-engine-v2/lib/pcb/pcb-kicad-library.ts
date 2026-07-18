/**
 * @file Read-only KiCad symbol and footprint identity resolver.
 * @description Resolves exact local library records without inventing symbols,
 * pins, packages, or pad counts when library evidence is absent.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  PcbFootprintSpec,
  PcbPinKind,
  PcbPinSpec,
} from './pcb-component-resolution'

export interface KicadSymbolRef {
  library: string
  symbol: string
}

export interface KicadFootprintRef {
  library: string
  footprint: string
}

export interface ResolvedKicadSymbol {
  symbolId: string
  footprintId: string | null
  pins: PcbPinSpec[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractBalancedForm(source: string, start: number): string | null {
  let depth = 0
  let isQuoted = false
  let isEscaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (isQuoted) {
      if (isEscaped) {
        isEscaped = false
      } else if (char === '\\') {
        isEscaped = true
      } else if (char === '"') {
        isQuoted = false
      }
      continue
    }
    if (char === '"') {
      isQuoted = true
    } else if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return null
}

function extractNamedSymbol(source: string, name: string): string | null {
  const match = new RegExp(`\\(symbol\\s+"${escapeRegExp(name)}"(?=\\s|\\))`).exec(source)
  return match ? extractBalancedForm(source, match.index) : null
}

function extractForms(source: string, formName: string): string[] {
  const forms: string[] = []
  const pattern = new RegExp(`\\(${escapeRegExp(formName)}\\s`, 'g')
  for (const match of source.matchAll(pattern)) {
    const form = extractBalancedForm(source, match.index!)
    if (form) forms.push(form)
  }
  return forms
}

function pinKindFromKicad(kind: string): PcbPinKind {
  if (kind === 'power_in') return 'power_in'
  if (kind === 'power_out') return 'power_out'
  if (kind === 'input') return 'input'
  if (kind === 'output' || kind === 'open_collector' || kind === 'open_emitter') return 'output'
  if (kind === 'bidirectional' || kind === 'tri_state') return 'bidirectional'
  if (kind === 'no_connect') return 'nc'
  return 'passive'
}

function pinsFromSymbolForm(form: string): PcbPinSpec[] {
  return extractForms(form, 'pin').flatMap((pinForm): PcbPinSpec[] => {
    const kind = pinForm.match(/^\(pin\s+([^\s()]+)/)?.[1]
    const name = pinForm.match(/\(name\s+"([^"]*)"/)?.[1]
    const number = pinForm.match(/\(number\s+"([^"]+)"/)?.[1]
    if (!kind || name === undefined || !number) return []
    return [{
      number,
      name: name || '~',
      kind: pinKindFromKicad(kind),
    }]
  })
}

function resolveSymbolForm(
  source: string,
  symbolName: string,
  visited: Set<string>,
): { footprintId: string | null; pins: PcbPinSpec[] } | null {
  if (visited.has(symbolName)) return null
  visited.add(symbolName)
  const form = extractNamedSymbol(source, symbolName)
  if (!form) return null

  const baseName = form.match(/\(extends\s+"([^"]+)"/)?.[1] ?? null
  const base = baseName ? resolveSymbolForm(source, baseName, visited) : null
  const footprintId = form.match(/\(property\s+"Footprint"\s+"([^"]*)"/)?.[1]
    ?? base?.footprintId
    ?? null
  const pinsByNumber = new Map<string, PcbPinSpec>()
  for (const pin of base?.pins ?? []) pinsByNumber.set(pin.number, pin)
  for (const pin of pinsFromSymbolForm(form)) pinsByNumber.set(pin.number, pin)
  const pins = [...pinsByNumber.values()].sort((left, right) =>
    left.number.localeCompare(right.number, undefined, { numeric: true }))
  return { footprintId, pins }
}

/**
 * @description Resolves an exact symbol and inherited full pinout from a local
 * KiCad `.kicad_sym` library.
 * @param symbolsRoot Root directory containing KiCad symbol libraries.
 * @param ref Exact library and symbol identifier.
 * @returns Symbol identity, inherited footprint and pins, or null on any miss.
 */
export function resolveKicadSymbol(
  symbolsRoot: string,
  ref: KicadSymbolRef,
): ResolvedKicadSymbol | null {
  const path = join(symbolsRoot, `${ref.library}.kicad_sym`)
  if (!existsSync(path)) return null
  const source = readFileSync(path, 'utf8')
  const resolved = resolveSymbolForm(source, ref.symbol, new Set<string>())
  if (!resolved || resolved.pins.length === 0) return null
  return {
    symbolId: `${ref.library}:${ref.symbol}`,
    footprintId: resolved.footprintId,
    pins: resolved.pins,
  }
}

/**
 * @description Resolves exact physical and non-electrical pad counts from a
 * local KiCad `.kicad_mod` footprint.
 * @param footprintsRoot Root directory containing `.pretty` libraries.
 * @param ref Exact footprint library and name.
 * @returns Footprint evidence or null when the local record is absent/empty.
 */
export function resolveKicadFootprint(
  footprintsRoot: string,
  ref: KicadFootprintRef,
): PcbFootprintSpec | null {
  const path = join(
    footprintsRoot,
    `${ref.library}.pretty`,
    `${ref.footprint}.kicad_mod`,
  )
  if (!existsSync(path)) return null
  const source = readFileSync(path, 'utf8')
  const pads = extractForms(source, 'pad')
  if (pads.length === 0) return null
  // GOTCHA: repeated shell/retention pads are physically distinct but share one
  // logical symbol pin. Pin parity therefore compares unique electrical names.
  const padRecords = pads.map((pad) => ({
    number: pad.match(/^\(pad\s+"([^"]*)"/)?.[1] ?? '',
    isMechanical: /\snp_thru_hole\s/.test(pad),
  }))
  const nonElectricalPadCount = padRecords.filter(({ number, isMechanical }) =>
    number === '' || number === 'MP' || isMechanical).length
  const electricalPadCount = new Set(
    padRecords
      .filter(({ number, isMechanical }) =>
        number !== '' && number !== 'MP' && !isMechanical)
      .map(({ number }) => number),
  ).size
  return {
    library: ref.library,
    footprint: ref.footprint,
    padCount: pads.length,
    nonElectricalPadCount,
    electricalPadCount,
  }
}
