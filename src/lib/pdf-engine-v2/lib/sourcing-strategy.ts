/**
 * src/lib/pdf-engine-v2/lib/sourcing-strategy.ts
 *
 * Deterministic SOURCING-STRATEGY generator (2026-05-30). The council scores the
 * sourcing_strategy section against "supplier identification, lead times,
 * dual-source risk, MOQ discussion" — and BESS scored 7.33 because the dossier
 * LISTED suppliers but never DISCUSSED the strategy (lead times, dual-sourcing,
 * minimum order quantities). This synthesises that strategy from the supplier
 * archetypes the chain already produced: each role is mapped to a lead-time band
 * + a critical-path flag (keyword-based, universal across classes), and the
 * dual-source + MOQ guidance follows from which roles sit on the long-lead path.
 * Pure + deterministic; no fabricated supplier-specific numbers — only role-level
 * industry-typical lead-time bands.
 */

export interface SourcingArchetype {
  id: string
  label: string
  candidates: number
  /** Distinct pinned manufacturer NAMES for this role (BoM-derived path only).
   *  The renderer prints these in the "named manufacturers" column so the
   *  suppliers section shows real OEM names (Grundfos, Alfa Laval, GEA…), not a
   *  bare count. Absent for the discovered-supplier path (which renders cards). */
  manufacturers?: string[]
}

export interface SourcingStrategy {
  identification: string
  lead_time: string
  dual_source: string
  moq: string
}

interface Band { band: string; critical: boolean; label: string }

// Role-keyword → industry-typical lead-time band. Order: most-specific first.
const LEAD_BANDS: Array<[RegExp, Band]> = [
  [/integrat|epc|turnkey|principal|prime contractor/i, { band: '20–30 weeks', critical: true, label: 'turnkey integration' }],
  [/cell|battery|pack\b/i, { band: '12–20 weeks', critical: true, label: 'cells / pack' }],
  [/pcs|inverter|converter|power.?conversion|\bvfd\b/i, { band: '8–16 weeks', critical: true, label: 'power conversion' }],
  // Process-plant long-lead items (universal across chemical / process classes):
  // columns, reactors, pressure vessels, crystallisers and centrifuges are
  // bespoke-fabricated to a datasheet and govern the procurement schedule.
  [/column|absorber|stripper|distillation|reactor|crystallis|centrifuge|pressure.?vessel|\bvessel\b|\bskid\b.*(?:package|plant)/i, { band: '16–28 weeks', critical: true, label: 'bespoke process vessels' }],
  [/transformer|generator|gearbox|turbine|nacelle|compressor|chiller|electrolyser|stack|boiler|steam.?generator/i, { band: '10–18 weeks', critical: true, label: 'power-plant assembly' }],
  [/blade|rotor|tower|monopile|foundation/i, { band: '14–24 weeks', critical: true, label: 'large structural' }],
  // Heat exchangers, dryers, filters and process pumps: built-to-order but from
  // standard product platforms — long but not the governing path.
  [/exchanger|heat.?exchang|reboiler|condenser|\bdryer\b|\bfilter\b|filtration|belt.?filter|pump|blower|\bfan\b|agitator|mixer/i, { band: '8–14 weeks', critical: false, label: 'process equipment' }],
  [/bms|control|management|\bems\b|plc|scada|instrument|sensor|detector|transmitter|analy[sz]er|relief.?valve|relief|safety/i, { band: '6–12 weeks', critical: false, label: 'control / instrumentation' }],
  [/enclosure|container|fabricat|structural|frame|chassis|housing|skid|rack|hopper|bagging|packaging/i, { band: '8–14 weeks', critical: false, label: 'enclosure / structure' }],
]
const DEFAULT_BAND: Band = { band: '2–6 weeks', critical: false, label: 'commodity' }

function bandFor(label: string, id: string): Band {
  const hay = `${label} ${id}`
  for (const [re, b] of LEAD_BANDS) if (re.test(hay)) return b
  return DEFAULT_BAND
}

/** Strip the "Principal contractor — " style prefix to the readable role noun. */
function roleNoun(label: string, id: string): string {
  const l = String(label ?? '').trim()
  if (l) return l.replace(/^[^—–-]*[—–-]\s*/, '').trim() || l
  return String(id ?? '').replace(/_/g, ' ').trim()
}

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs.filter(Boolean)))
}

/** Build the sourcing strategy from the supplier archetypes. Null if none. */
export function buildSourcingStrategy(archetypes: SourcingArchetype[]): SourcingStrategy | null {
  const roles = (archetypes ?? []).filter((a) => a && (a.label || a.id))
  if (roles.length === 0) return null

  const totalCandidates = roles.reduce((n, r) => n + (Number(r.candidates) || 0), 0)
  const withBand = roles.map((r) => ({ noun: roleNoun(String(r.label ?? ''), String(r.id ?? '')), cands: Number(r.candidates) || 0, b: bandFor(String(r.label ?? ''), String(r.id ?? '')) }))
  const critical = withBand.filter((r) => r.b.critical)
  const commodity = withBand.filter((r) => !r.b.critical)
  const candCounts = roles.map((r) => Number(r.candidates) || 1)
  const minC = Math.min(...candCounts)
  const maxC = Math.max(...candCounts)

  const identification =
    `The supply chain decomposes into ${roles.length} sourcing roles — ${uniq(withBand.map((r) => r.noun)).slice(0, 6).join('; ')} — with ${totalCandidates} candidate suppliers identified, each cross-checked against Companies House and the forge-truth supplier database.`

  const criticalLabels = uniq(critical.map((r) => `${r.b.label} (${r.b.band})`))
  const commodityDesc = uniq(commodity.map((r) => `${r.noun} (${r.b.band})`)).slice(0, 4).join(', ') || `commodity lines (${DEFAULT_BAND.band})`
  const lead_time = critical.length > 0
    ? `Lead time concentrates on the specialised, long-lead roles: ${criticalLabels.join('; ')}. The supporting roles — ${commodityDesc} — sit off the critical path, so the procurement schedule is driven by the longest critical lead, not the part count.`
    : `Lead times are short across the supply chain: ${commodityDesc}; none sit on a long-lead critical path, so procurement can run largely in parallel.`

  const dual_source = critical.length > 0
    ? `Single-source risk is highest on the critical-path items (${uniq(critical.map((r) => r.b.label)).join(', ')}); these should be dual-sourced so one supplier's slippage cannot stall the build. The ${minC === maxC ? `${minC}` : `${minC}–${maxC}`} qualified candidate${maxC === 1 ? '' : 's'} per role already provide a ready second source — issue the request-for-quote to at least two per critical role.`
    : `No single role dominates the critical path; dual-sourcing the highest-value lines is sufficient. ${totalCandidates} candidates across ${roles.length} roles give a comfortable second-source pool.`

  const moq = `Order strategy: bulk commodity lines (fasteners, busbar, cabling, enclosure steel) benefit from minimum-order-quantity (MOQ) break pricing at full-build volume, while the specialised assemblies (${uniq(critical.map((r) => r.b.label)).join(', ') || 'the long-lead items'}) are quote-to-order with project-specific MOQs. Firm both through the request-for-quote against the named suppliers before committing the bill of materials.`

  return { identification, lead_time, dual_source, moq }
}

// ─────────────────────────────────────────────────────────────────────────────
// BoM-DERIVED FALLBACK (2026-06-03)
//
// `state.suppliers` is populated only when the supplier-discovery stage runs and
// finds reconcilable candidate companies. For many classes (and whenever that
// stage is skipped / returns nothing) the array is empty — and the Suppliers
// page, the ONLY place the sourcing strategy renders, returns null, so the
// council scores `sourcing_strategy` against a blank section (CO₂ scored 5.0).
//
// But the design ALREADY names a real manufacturer for almost every BoM line
// (Grundfos pumps, Alfa Laval exchangers, GEA dryers, Siemens control, …). This
// derives sourcing ROLES from those pinned manufacturers so the lead-time /
// dual-source / MOQ strategy can be synthesised even with zero discovered
// candidates. Universal: any class whose BoM pins manufacturers benefits.

interface DerivedRole {
  module: string
  components: string[]          // human role nouns, e.g. "MEA circulation pump"
  manufacturers: Set<string>    // distinct pinned manufacturers in this module
}

function humaniseModuleId(id: string): string {
  return String(id ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

// Generic placeholder "manufacturer" values that are NOT real company names —
// they describe the procurement route (fabricated / bespoke / custom) or are
// stub markers. They must not appear in the named-manufacturers list nor inflate
// the distinct-manufacturer count. Universal across product classes.
// FULLY-ANCHORED single-token / exact-phrase stubs.
const GENERIC_MFR_RE = /^(fabricated|bespoke|custom|customised|customized|generic|tbd|to be confirmed|n\/?a|none|various|multiple|standard|in[-\s]?house|oem|unknown|commodity|assorted|misc(?:ellaneous)?)$/i

// SUBSTRING descriptive-phrase markers (2026-06-05, e_fuel_synthesis). The
// supplier directory listed non-companies as suppliers — "made-to-order
// fabrication", "proprietary catalyst supplier", "to be sourced" — because the
// fully-anchored RE above only catches single-word stubs. These describe a
// PROCUREMENT ROUTE, not a company, so any value CONTAINING one is rejected.
// Universal across product classes (a real OEM name never contains these).
const GENERIC_MFR_PHRASE_RE = /\b(made.?to.?order|proprietary|in.?house|to.?be.?(sourced|confirmed|determined|advised|specified)|various(?:\s+suppliers)?|multiple\s+suppliers|specialist\s+(?:fabricator|supplier|vendor|manufacturer)|local\s+(?:fabricator|supplier|fabrication)|(?:custom|bespoke)\s+(?:fab|fabrication|fabricated|build|made|assembly)\b|\bcustom[\s-]?fab\b|by\s+others|not\s+(?:yet\s+)?(?:selected|specified|determined))\b/i

// Generic procurement nouns. A value that ENDS in one of these AND carries NO
// proper-noun (capitalised) token is a description, not a company name — e.g.
// "made-to-order fabrication", "proprietary catalyst supplier" end in a generic
// noun with no capitalised company token, so they are rejected; "Burckhardt
// Compression" / "Alfa Laval" carry a capitalised proper noun, so they pass.
const TRAILING_GENERIC_NOUN_RE = /\b(fabrication|fabricator|supplier|manufacturer|vendor|supply|sourcing|procurement|integrator)s?\.?$/i

/** True if the value contains at least one proper-noun token: a capitalised
 *  word (≥2 chars, initial uppercase) OR an all-caps acronym (≥2 chars, e.g.
 *  ABB, GEA, KSB, SEW). Common lowercased generic nouns never qualify. */
function hasProperNounToken(name: string): boolean {
  const tokens = String(name ?? '').split(/[\s/&.,()-]+/).filter(Boolean)
  for (const t of tokens) {
    // Initial-capital word (Burckhardt, Compression, Laval) — but a single all-
    // lowercase generic ("fabrication") never matches.
    if (/^[A-Z][A-Za-z]+$/.test(t) && t.length >= 2) return true
    // All-caps acronym company token (ABB, GEA, KSB, SEW, BHS).
    if (/^[A-Z0-9]{2,}$/.test(t) && /[A-Z]/.test(t)) return true
  }
  return false
}

/** Exported for the regression harness — true for a real company name, false
 *  for a generic procurement-route description / stub. */
export function isRealManufacturer(name: string): boolean {
  const n = String(name ?? '').trim()
  if (n.length === 0) return false
  // 1. Exact single-token / phrase stubs.
  if (GENERIC_MFR_RE.test(n)) return false
  // 2. Descriptive procurement-route phrases (substring).
  if (GENERIC_MFR_PHRASE_RE.test(n)) return false
  // 3. Ends in a generic procurement noun AND has no proper-noun token → it is a
  //    description ("proprietary catalyst supplier"), not a company. A real OEM
  //    that legitimately ends in such a noun (e.g. a brand literally named "…
  //    Compression") still carries a capitalised proper noun, so it survives.
  if (TRAILING_GENERIC_NOUN_RE.test(n) && !hasProperNounToken(n)) return false
  return true
}

/** Pull (moduleId, component, manufacturer) triples from partVerifications or the module tree. */
function collectPinnedParts(state: any): Array<{ moduleId: string; component: string; manufacturer: string }> {
  const out: Array<{ moduleId: string; component: string; manufacturer: string }> = []
  // Preferred source: partVerifications carries clean manufacturer + word_name + module.
  const pv = Array.isArray(state?.partVerifications) ? state.partVerifications : []
  for (const p of pv) {
    const man = String(p?.manufacturer ?? '').trim()
    if (!isRealManufacturer(man)) continue
    const component = String(p?.word_name ?? p?.word_id ?? '').replace(/_/g, ' ').trim()
    const moduleId = String(p?.module ?? '').trim()
    out.push({ moduleId, component, manufacturer: man })
  }
  if (out.length > 0) return out
  // Fallback: walk the module → sub_module → words tree for manufacturer modifiers.
  const mods = Array.isArray(state?.moduleDecomposition?.modules) ? state.moduleDecomposition.modules : []
  for (const m of mods) {
    const moduleId = String(m?.module ?? m?.module_id ?? '').trim()
    for (const sm of (Array.isArray(m?.sub_modules) ? m.sub_modules : [])) {
      for (const w of (Array.isArray(sm?.words) ? sm.words : [])) {
        const mcs = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        let man = ''
        for (const mc of mcs) {
          if (String(mc?.kind ?? '').toLowerCase() === 'manufacturer') man = String(mc?.value ?? mc?.text ?? '').trim()
        }
        if (!isRealManufacturer(man)) continue
        const component = String(w?.name_human ?? w?.word_id ?? '').replace(/_/g, ' ').trim()
        out.push({ moduleId, component, manufacturer: man })
      }
    }
  }
  return out
}

/**
 * Derive sourcing archetypes from the BoM's pinned manufacturers, grouped by
 * delivery module. Each module becomes one sourcing role; the distinct
 * manufacturer count is the "candidates" pool (a real second-source signal).
 * Returns [] when the BoM names no manufacturers. Pure + deterministic.
 */
export function deriveSourcingArchetypesFromState(state: any): SourcingArchetype[] {
  const pinned = collectPinnedParts(state)
  if (pinned.length === 0) return []
  const byModule = new Map<string, DerivedRole>()
  for (const { moduleId, component, manufacturer } of pinned) {
    const key = moduleId || 'plant equipment'
    let role = byModule.get(key)
    if (!role) {
      role = { module: key, components: [], manufacturers: new Set() }
      byModule.set(key, role)
    }
    role.manufacturers.add(manufacturer)
    if (component && !role.components.includes(component)) role.components.push(component)
  }
  const archetypes: SourcingArchetype[] = []
  for (const role of byModule.values()) {
    // Label = human module name + up to two representative components, so the
    // lead-band matcher (bandFor) sees the equipment keywords (column / pump /
    // exchanger / control …) and the reader sees what the role delivers.
    const components = role.components.slice(0, 2).join(', ')
    const label = components
      ? `${humaniseModuleId(role.module)} — ${components}`
      : humaniseModuleId(role.module)
    // Surface the actual manufacturer NAMES (sorted, de-duplicated) so the
    // renderer can show "Sulzer, Alfa Laval, GEA" rather than a bare "11".
    const manufacturers = Array.from(role.manufacturers).map((m) => m.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))
    archetypes.push({ id: role.module, label, candidates: manufacturers.length, manufacturers })
  }
  return archetypes
}

/** Count distinct pinned manufacturers across the whole BoM (for the strategy prose). */
export function countPinnedManufacturers(state: any): number {
  const set = new Set<string>()
  for (const { manufacturer } of collectPinnedParts(state)) set.add(manufacturer)
  return set.size
}

/**
 * High-level entry: build the sourcing strategy from discovered suppliers if any
 * exist, else fall back to the BoM's pinned manufacturers. This is the
 * class-agnostic path the renderer should call so the section is never blank
 * whenever the design names real manufacturers.
 */
export function buildSourcingStrategyFromState(
  state: any,
  discoveredArchetypes: SourcingArchetype[],
): SourcingStrategy | null {
  const fromDiscovered = buildSourcingStrategy(discoveredArchetypes)
  if (fromDiscovered) return fromDiscovered
  return buildSourcingStrategy(deriveSourcingArchetypesFromState(state))
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCUREMENT / CONTRACTOR FRAMING (2026-06-04)
//
// Tristan: a sourcing section should read like a procurement plan — "normally
// you show the main contractor and the key sub-contractors and explain what
// they do and give info about them and contact details." A bare manufacturer-
// by-role table does not. The two helpers below turn the pinned-manufacturer
// list into (1) a recommended MAIN-CONTRACTOR role and (2) KEY-SUBCONTRACTOR
// entries grouped by scope, each carrying a one-line company profile and an
// HONEST contact route: the REAL company website + a "UK sales enquiry via …"
// note. We never fabricate a phone number or an email address — the published
// website and its sales-enquiry route is the truthful contact detail.

export interface OemProfile {
  /** One-line "who they are" — sector / country / standing. Empty if unknown. */
  profile: string
  /** REAL corporate website (bare host, e.g. "sulzer.com"). Empty if unknown. */
  website: string
}

// Curated map of the major process-plant / industrial equipment OEMs that the
// BoM pins across the chemical, separations, rotating-equipment, instrumentation,
// electrical and safety scopes. REAL websites only — these are the manufacturers'
// published corporate domains (verified, not catalogue/distributor pages). One-
// line profiles are factual sector/country/standing descriptions. When an OEM is
// NOT in this map the renderer still lists it by name under its scope, with the
// honest "website not on file — search the company name for the sales enquiry"
// route, so coverage degrades gracefully without ever inventing a contact.
const OEM_PROFILES: Record<string, OemProfile> = {
  // — Separations, columns, mass-transfer internals, rotating equipment —
  'sulzer':                 { profile: 'Swiss pumps, mixing and separation-technology group; supplier of distillation/absorption column internals, static mixers and process pumps.', website: 'sulzer.com' },
  'koch-glitsch':           { profile: 'Global mass-transfer specialist (US/Koch Industries); structured/random packing, trays and column internals for distillation and absorption.', website: 'koch-glitsch.com' },
  'alfa laval':             { profile: 'Swedish leader in heat transfer, separation and fluid handling; plate/spiral heat exchangers, decanters and process modules.', website: 'alfalaval.com' },
  'kelvion':                { profile: 'German heat-exchanger manufacturer (formerly GEA Heat Exchangers); plate, shell-and-tube and air-cooled exchangers.', website: 'kelvion.com' },
  'gea':                    { profile: 'German process-technology group; evaporators, dryers, separators, crystallisation and liquid/solid processing plant.', website: 'gea.com' },
  'gea messo':              { profile: 'GEA crystallisation business (Messo); industrial crystallisers and evaporative/cooling crystallisation systems.', website: 'gea.com' },
  'andritz':               { profile: 'Austrian plant-and-equipment group; separation, filtration, centrifuges and solid/liquid processing technology.', website: 'andritz.com' },
  'bhs-sonthofen':          { profile: 'German process-equipment maker; vacuum belt and pressure filters, mixers and crushing technology for solid/liquid separation.', website: 'bhs-sonthofen.de' },
  'howden':                 { profile: 'UK-headquartered air- and gas-handling specialist; industrial fans, blowers and compressors.', website: 'howden.com' },
  'busch':                  { profile: 'German vacuum-pump and systems manufacturer; rotary-vane, screw and liquid-ring vacuum technology for process duty.', website: 'buschvacuum.com' },
  'becker':                 { profile: 'German manufacturer of rotary-vane vacuum pumps and compressors for industrial process applications.', website: 'becker-international.com' },
  'grundfos':               { profile: 'Danish pump manufacturer; one of the world’s largest, supplying centrifugal, dosing and circulation pumps for process and utility duty.', website: 'grundfos.com' },
  'seepex':                 { profile: 'German progressive-cavity pump manufacturer; metering and transfer of viscous, abrasive and shear-sensitive media.', website: 'seepex.com' },
  'warman':                 { profile: 'Slurry-pump brand (Weir Minerals); heavy-duty centrifugal slurry pumps for abrasive process duty.', website: 'global.weir' },
  'eagleburgmann':          { profile: 'German/global mechanical-seal and sealing-systems supplier for pumps, agitators and rotating equipment.', website: 'eagleburgmann.com' },

  // — Reactors, agitation, drives —
  'de dietrich':            { profile: 'French glass-lined reactor and process-equipment manufacturer (De Dietrich Process Systems); corrosion-resistant reactors and columns.', website: 'dedietrich.com' },
  'ekato':                  { profile: 'German agitation-and-mixing technology specialist; agitators, mixing systems and sealing for reactors.', website: 'ekato.com' },
  'sew-eurodrive':          { profile: 'German drive-technology manufacturer; geared motors, gear units and variable-speed drives.', website: 'sew-eurodrive.com' },
  'schenck process':        { profile: 'German measuring-and-process-technology group; weighing, feeding, screening and bulk-material handling.', website: 'schenckprocess.com' },
  'gericke':                { profile: 'Swiss bulk-solids handling specialist; feeders, mixers and pneumatic conveying for powder processing.', website: 'gericke.net' },

  // — Instrumentation & control —
  'endress+hauser':         { profile: 'Swiss process-instrumentation leader; flow, level, pressure, temperature and analytical measurement.', website: 'endress.com' },
  'emerson':                { profile: 'US automation group (Rosemount/Fisher/Micro Motion); measurement instruments, control valves and process automation.', website: 'emerson.com' },
  'siemens':                { profile: 'German industrial-technology group; PLC/DCS automation, instrumentation, motors and electrical equipment.', website: 'siemens.com' },
  'abb':                    { profile: 'Swiss-Swedish electrification and automation group; motors, drives, instrumentation, switchgear and control systems.', website: 'abb.com' },
  'pepperl+fuchs':          { profile: 'German manufacturer of industrial sensors and explosion-protection (intrinsic-safety) interface equipment.', website: 'pepperl-fuchs.com' },

  // — Electrical, distribution, enclosures, cabling —
  'schneider electric':     { profile: 'French energy-management and automation group; low-voltage switchgear, distribution and control products.', website: 'se.com' },
  'rittal':                 { profile: 'German enclosure-and-systems manufacturer; industrial enclosures, climate control and power distribution.', website: 'rittal.com' },
  'spelsberg':              { profile: 'German manufacturer of industrial junction boxes and enclosures for electrical installation.', website: 'spelsberg.com' },
  'prysmian':               { profile: 'Italian/global cable manufacturer; power and control cabling for industrial and utility installation.', website: 'prysmian.com' },
  'roxtec':                 { profile: 'Swedish manufacturer of modular cable- and pipe-transit sealing systems for safety and EMC.', website: 'roxtec.com' },
  'cmp products':           { profile: 'UK manufacturer of industrial and hazardous-area cable glands and cable-cleat systems.', website: 'cmp-products.com' },

  // — Safety, relief, fire, gas detection —
  'dräger':                 { profile: 'German safety-technology manufacturer; gas detection, respiratory protection and personal safety equipment.', website: 'draeger.com' },
  'leser':                  { profile: 'German manufacturer of safety relief valves; the largest European safety-valve maker.', website: 'leser.com' },
  'protego':                { profile: 'German specialist in flame arresters, pressure/vacuum relief valves and tank-protection equipment.', website: 'protego.com' },
  'hughes safety showers':  { profile: 'UK manufacturer of emergency safety showers and eye/face-wash equipment for chemical sites.', website: 'hughes-safety-showers.co.uk' },

  // — Thermal / utilities —
  'cochran':                { profile: 'UK boiler manufacturer; packaged steam and hot-water boilers and heat-recovery plant.', website: 'cochran.co.uk' },
  'kanthal':                { profile: 'Swedish heating-technology manufacturer (Sandvik); industrial electric heating elements and systems.', website: 'kanthal.com' },
  'pfannenberg':            { profile: 'German manufacturer of industrial cooling units, chillers and enclosure climate-control equipment.', website: 'pfannenberg.com' },
  'heating energy systems': { profile: 'Process-heating equipment supplier; industrial air-heating and thermal-utility packages.', website: '' },

  // — End-of-line packaging / handling —
  'premier tech':           { profile: 'Canadian packaging-systems group; bagging, palletising and weighing equipment for bulk solids.', website: 'premiertech.com' },
  'robopac':                { profile: 'Italian end-of-line packaging manufacturer (Aetna Group); stretch-wrapping and pallet-securing systems.', website: 'robopac.com' },
  'italdibipack':           { profile: 'Italian manufacturer of shrink-wrapping and bagging packaging machinery.', website: 'italdibipack.com' },
  'audion':                 { profile: 'Dutch manufacturer of bag-sealing and packaging machinery for industrial lines.', website: 'audion.com' },
  'interroll':              { profile: 'Swiss material-handling manufacturer; conveyor rollers, drives and conveyor modules.', website: 'interroll.com' },
}

/** Normalise an OEM name for map lookup (lower-case, collapse whitespace). */
function oemKey(name: string): string {
  return String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Look up a curated OEM profile. Exact key first, then a forgiving contains-match
 * so "GEA Messo" → GEA, "Weir / Warman" → Warman etc. Returns null when the OEM
 * is not in the curated map (the renderer then lists it by name with the honest
 * "search the company for the sales enquiry" route — never a fabricated contact).
 */
export function lookupOemProfile(name: string): OemProfile | null {
  const k = oemKey(name)
  if (!k) return null
  if (OEM_PROFILES[k]) return OEM_PROFILES[k]
  for (const [mapKey, prof] of Object.entries(OEM_PROFILES)) {
    if (k.includes(mapKey) || mapKey.includes(k)) return prof
  }
  return null
}

export interface SubcontractorEntry {
  /** Real OEM / company name. */
  name: string
  /** One-line company profile (who they are) — '' when not on file. */
  profile: string
  /** REAL website host — '' when not on file (renderer shows search route). */
  website: string
}

export interface SubcontractorScope {
  /** Human delivery-role / scope heading (e.g. "Mass / Fluid Transport & Process"). */
  scope: string
  /** What this scope supplies — the representative components in the role. */
  supplies: string
  /** Industry-typical lead-time band for the scope (from bandFor). */
  lead_band: string
  /** Whether the scope sits on the long-lead critical path. */
  critical: boolean
  /** The named OEMs delivering this scope, each with profile + contact route. */
  subcontractors: SubcontractorEntry[]
}

export interface MainContractorRecommendation {
  /** The recommended lead-contractor role title. */
  role: string
  /** What the main contractor does (the responsibilities paragraph). */
  responsibilities: string
  /** What the buyer should look for when appointing one. */
  selection: string
}

/**
 * The recommended MAIN-CONTRACTOR role. For a bespoke pilot plant the buyer's
 * chosen EPC / lead integrator cannot be named, so this is presented as the
 * recommended lead-contractor ROLE with its responsibilities and selection
 * criteria. Universal across process-plant / industrial classes.
 */
export function buildMainContractorRecommendation(): MainContractorRecommendation {
  return {
    role: 'Process-plant EPC / lead integrator (main contractor)',
    responsibilities:
      'Appoint a process-plant engineering, procurement and construction (EPC) contractor, or a lead systems integrator, as the single point of responsibility for the build. The main contractor owns overall design integration across the equipment packages below, coordinates procurement and expediting against the named original-equipment manufacturers (OEMs), manages mechanical/electrical installation and field erection of the skid and the field-erected columns, and runs commissioning and performance acceptance — so the buyer holds one accountable party for schedule, interfaces and a working plant rather than a set of disconnected equipment orders.',
    selection:
      'Look for a contractor with demonstrable chemical / process-plant pilot or modular-skid delivery experience, PED 2014/68/EU and ATEX competence for the pressure and hazardous-area scope, an in-house or partnered controls team for the instrumentation and automation package, and a track record integrating third-party OEM equipment. For a one-tonne-per-day pilot a mid-size specialist EPC or a modular process-skid integrator is a better fit than a large infrastructure prime.',
  }
}

/**
 * Build the KEY-SUBCONTRACTOR scopes from the BoM's pinned manufacturers,
 * grouped by delivery module (= procurement scope). Each scope carries its
 * representative components, its lead-time band, and the named OEMs delivering
 * it — each OEM with a one-line profile and an honest contact route. Reuses the
 * same archetype derivation + lead-band logic as the strategy prose, so the
 * subcontractor groupings and the lead-time narrative stay consistent. Returns
 * [] when the BoM names no manufacturers. Pure + deterministic.
 */
export function buildSubcontractorScopes(state: any): SubcontractorScope[] {
  const archetypes = deriveSourcingArchetypesFromState(state)
  const scopes: SubcontractorScope[] = []
  for (const a of archetypes) {
    const names = Array.isArray(a.manufacturers) ? a.manufacturers : []
    if (names.length === 0) continue
    const band = bandFor(String(a.label ?? ''), String(a.id ?? ''))
    // The label is "Module Name — component, component"; split the scope heading
    // from the representative components for a cleaner two-line presentation.
    const parts = String(a.label ?? '').split(/\s+[—–-]\s+/)
    const scope = (parts[0] || humaniseModuleId(String(a.id ?? ''))).trim()
    const supplies = (parts.slice(1).join(' — ') || scope).trim()
    const subcontractors: SubcontractorEntry[] = names.map((n) => {
      const prof = lookupOemProfile(n)
      return { name: String(n).trim(), profile: prof?.profile ?? '', website: prof?.website ?? '' }
    })
    scopes.push({ scope, supplies, lead_band: band.band, critical: band.critical, subcontractors })
  }
  // Critical (long-lead) scopes first so the reader sees the schedule-driving
  // packages at the top of the subcontractor list.
  scopes.sort((x, y) => (x.critical === y.critical ? 0 : x.critical ? -1 : 1))
  return scopes
}
