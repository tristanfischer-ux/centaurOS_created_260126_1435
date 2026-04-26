'use client'

/**
 * @file SupplierExtractedPills.tsx
 *
 * @description Client-side regex parser + pill row for supplier search.
 * Renders between the search form and the results count bar when a search is active.
 * Mirrors the "EXTRACTED FROM YOUR DECK" card in InvestorDeckSearchClient.tsx —
 * same orange-soft background, same pill structure, same visual vocabulary.
 *
 * No LLM call — supplier queries are short and structured enough for regex.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedSupplierQuery {
  process: string[]
  material: string[]
  region: string[]
  certs: string[]
  volume: string[]
}

// ---------------------------------------------------------------------------
// Regex dictionaries
// ---------------------------------------------------------------------------

// Each entry is [displayName, ...aliases] — we match any alias and return the displayName.
// Aliases are sorted longest-first inside each group so regex alternation prefers specific matches.

const PROCESS_TERMS: [string, ...string[]][] = [
  ['CNC Machining', 'cnc machining', 'cnc mill', 'cnc milled', 'cnc turned'],
  ['Lathe / Turning', 'lathe turning', 'lathe', 'turning'],
  ['Milling', 'milling'],
  ['Forging', 'forging', 'forged'],
  ['Sand Casting', 'sand casting'],
  ['Die Casting', 'die casting', 'die-casting'],
  ['Casting', 'casting', 'cast'],
  ['Sheet Metal Fabrication', 'sheet metal fabrication', 'sheet metal', 'sheet-metal'],
  ['TIG Welding', 'tig welding', 'tig weld'],
  ['MIG Welding', 'mig welding', 'mig weld'],
  ['Spot Welding', 'spot welding', 'spot weld'],
  ['Welding', 'welding', 'weld'],
  ['DMLS', 'dmls'],
  ['SLS', 'sls printing', 'sls'],
  ['SLA', 'sla printing', 'sla'],
  ['FDM', 'fdm printing', 'fdm'],
  ['3D Printing', '3d printing', '3d-printing', 'additive manufacturing', 'additive'],
  ['Injection Moulding', 'injection moulding', 'injection molding', 'injection-moulding'],
  ['Extrusion', 'extrusion', 'extruded'],
  ['Stamping', 'stamping', 'stamped'],
  ['Laser Cutting', 'laser cutting', 'laser cut'],
  ['Waterjet Cutting', 'waterjet cutting', 'waterjet'],
  ['Powder Coating', 'powder coating', 'powder coat'],
  ['Anodising', 'anodising', 'anodizing', 'anodised', 'anodized'],
  ['Heat Treatment', 'heat treatment', 'heat treating', 'heat treat'],
  ['PCB Assembly', 'pcb assembly', 'pcba', 'pcb'],
  ['Cable Harness', 'cable harness', 'wire harness', 'harness'],
  ['Assembly', 'assembly', 'assembled'],
  ['Autoclave Cure', 'autoclave cure', 'autoclave curing', 'autoclave'],
  ['Composite Layup', 'composite layup', 'layup', 'hand layup'],
]

const MATERIAL_TERMS: [string, ...string[]][] = [
  ['Stainless Steel 316L', 'stainless steel 316l', 'ss316l', '316l'],
  ['Stainless Steel 304', 'stainless steel 304', 'ss304', '304 stainless'],
  ['Stainless Steel 316', 'stainless steel 316', 'ss316', '316 stainless'],
  ['Stainless Steel', 'stainless steel', 'stainless', 'ss'],
  ['Aluminium', 'aluminium', 'aluminum', 'alu'],
  ['Titanium', 'titanium', 'ti-6al-4v', 'grade 5 titanium'],
  ['Brass', 'brass'],
  ['Copper', 'copper'],
  ['Inconel', 'inconel', 'inconel 625', 'inconel 718'],
  ['Carbon Fibre', 'carbon fibre', 'carbon fiber', 'cfrp', 'carbon composite'],
  ['Composite', 'composite', 'fibre composite', 'fiber composite'],
  ['ABS', 'abs plastic', 'abs'],
  ['PEEK', 'peek'],
  ['Nylon', 'nylon', 'pa12', 'pa6'],
  ['Rubber', 'rubber'],
  ['Silicone', 'silicone'],
  ['Plastic', 'plastic'],
]

const REGION_TERMS: [string, ...string[]][] = [
  ['United Kingdom', 'united kingdom', 'uk', 'britain', 'great britain', 'england', 'scotland', 'wales'],
  ['Germany', 'germany', 'german'],
  ['France', 'france', 'french'],
  ['Italy', 'italy', 'italian'],
  ['Spain', 'spain', 'spanish'],
  ['United States', 'united states', 'us', 'usa', 'america', 'american'],
  ['China', 'china', 'chinese'],
  ['Switzerland', 'switzerland', 'swiss'],
  ['Netherlands', 'netherlands', 'dutch', 'holland'],
  ['Sweden', 'sweden', 'swedish'],
  ['Poland', 'poland', 'polish'],
]

const CERT_TERMS: [string, ...string[]][] = [
  ['ISO 9001', 'iso 9001', 'iso9001'],
  ['AS9100', 'as9100'],
  ['IATF 16949', 'iatf 16949', 'iatf16949'],
  ['NADCAP', 'nadcap'],
  ['ITAR', 'itar'],
  ['ISO 13485', 'iso 13485', 'iso13485'],
  ['ISO 14001', 'iso 14001', 'iso14001'],
  ['RoHS', 'rohs'],
  ['REACH', 'reach'],
  ['CE', '\\bce\\b'],
]

const VOLUME_TERMS: [string, ...string[]][] = [
  ['Prototype', 'prototype', 'prototyping', 'prototypes'],
  ['Low Volume', 'low volume', 'low-volume', 'small batch', 'small batches'],
  ['Batch Production', 'batch production', 'batch manufacturing', 'batch'],
  ['Mass Production', 'mass production', 'high volume', 'high-volume', 'series production'],
  ['Minimum Order Quantity', 'minimum order quantity', 'moq', 'minimum order'],
]

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function buildPattern(terms: [string, ...string[]][]): Map<string, string[]> {
  // Map: displayName → aliases[]
  const m = new Map<string, string[]>()
  for (const [display, ...aliases] of terms) {
    m.set(display, aliases)
  }
  return m
}

function matchCategory(
  text: string,
  termMap: Map<string, string[]>
): string[] {
  const found: string[] = []
  for (const [display, aliases] of termMap) {
    // Sort aliases longest first so more specific patterns win
    const sorted = [...aliases].sort((a, b) => b.length - a.length)
    const pattern = sorted
      .map(a => {
        // If alias already has regex anchors (like \b), use as-is
        if (a.startsWith('\\b')) return a
        // Otherwise escape and wrap in word boundaries
        return `\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
      })
      .join('|')
    const re = new RegExp(pattern, 'i')
    if (re.test(text)) {
      found.push(display)
    }
  }
  return found
}

const PROCESS_MAP  = buildPattern(PROCESS_TERMS)
const MATERIAL_MAP = buildPattern(MATERIAL_TERMS)
const REGION_MAP   = buildPattern(REGION_TERMS)
const CERT_MAP     = buildPattern(CERT_TERMS)
const VOLUME_MAP   = buildPattern(VOLUME_TERMS)

export function parseSupplierQuery(q: string): ExtractedSupplierQuery {
  return {
    process:  matchCategory(q, PROCESS_MAP),
    material: matchCategory(q, MATERIAL_MAP),
    region:   matchCategory(q, REGION_MAP),
    certs:    matchCategory(q, CERT_MAP),
    volume:   matchCategory(q, VOLUME_MAP),
  }
}

export function hasAnyExtracted(e: ExtractedSupplierQuery): boolean {
  return (
    e.process.length > 0 ||
    e.material.length > 0 ||
    e.region.length > 0 ||
    e.certs.length > 0 ||
    e.volume.length > 0
  )
}

// ---------------------------------------------------------------------------
// Pill sub-component (mirrors InvestorDeckSearchClient ProfilePill)
// ---------------------------------------------------------------------------

function SupplierPill({ label, values }: { label: string; values: string[] }) {
  return (
    <span className="inline-flex gap-1.5 items-center bg-card border border-international-orange/20 rounded-full px-3.5 py-1.5 text-xs">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-foreground font-bold">{values.join(' · ')}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SupplierExtractedPillsProps {
  extracted: ExtractedSupplierQuery
  /** Called when the user clicks Edit — typically focuses the textarea */
  onEdit?: () => void
}

export function SupplierExtractedPills({
  extracted,
  onEdit,
}: SupplierExtractedPillsProps) {
  const any = hasAnyExtracted(extracted)

  if (!any) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        Searching across all suppliers
      </p>
    )
  }

  return (
    <div className="bg-international-orange/[0.06] border border-international-orange/20 rounded-lg px-5 py-4">
      {/* Header row — mirrors ExtractedProfileCard */}
      <div className="flex items-center justify-between mb-2.5">
        <strong className="text-xs text-international-orange tracking-wider uppercase">
          Extracted from your query
        </strong>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-international-orange underline"
          >
            Edit ↗
          </button>
        )}
      </div>

      {/* Pills row */}
      <div className="flex flex-wrap gap-2.5">
        {extracted.process.length > 0 && (
          <SupplierPill label="Process" values={extracted.process} />
        )}
        {extracted.material.length > 0 && (
          <SupplierPill label="Material" values={extracted.material} />
        )}
        {extracted.region.length > 0 && (
          <SupplierPill label="Region" values={extracted.region} />
        )}
        {extracted.certs.length > 0 && (
          <SupplierPill label="Certs" values={extracted.certs} />
        )}
        {extracted.volume.length > 0 && (
          <SupplierPill label="Volume" values={extracted.volume} />
        )}
      </div>
    </div>
  )
}
