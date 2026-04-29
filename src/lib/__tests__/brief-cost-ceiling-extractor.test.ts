/**
 * @file brief-cost-ceiling-extractor.test.ts
 *
 * Loop 25 P1 Fix 4: regression suite for the brief cost-ceiling extractor.
 * Verifies all five demo briefs extract correctly, including the two new
 * patterns added in Fix 4 — "system unit cost" keyword and "X million pounds"
 * multiplier.
 *
 * Brief texts are embedded verbatim from the cad_lab_projects table
 * (project IDs as of 2026-04-29) so failures are immediately diagnosable
 * without a database query.
 */

import {
    extractCostCeilingFromProse,
    extractAllCostCeilingsFromProse,
} from '../brief-cost-ceiling-extractor'

// ---------------------------------------------------------------------------
// Demo brief texts — verbatim from cad_lab_projects.founder_raw_brief
// ---------------------------------------------------------------------------

const BESS_BRIEF =
    'A 40-foot containerised battery energy storage system delivering 3.5 MWh and 1.5 MW for behind-the-meter commercial and industrial sites in the United Kingdom. Lithium iron phosphate cells, integrated battery management, bi-directional power conversion with grid-forming capability, liquid-cooled thermal management, and certified fire detection and suppression. Target installed capital cost under 180,000 pounds. Must ship complete on a flatbed lorry, install on a prepared concrete pad, and commission inside two days. Compliant with United Kingdom G99 grid code and the latest National Fire Chiefs Council guidance for lithium battery storage.'

const DESALINATION_BRIEF =
    'A 40-foot containerised seawater reverse-osmosis desalination unit producing 500 cubic metres per day of potable water from seawater feed. Pre-treatment, two-pass reverse osmosis, post-treatment (remineralisation and chlorination), 50 per cent recovery rate, energy-recovery device on the brine stream. Target specific energy consumption under 3.5 kilowatt-hours per cubic metre. Designed for coastal disaster relief, remote-island municipal water, and construction-site freshwater supply. Target installed capital cost under 350,000 pounds. Must ship complete on a flatbed lorry, plug into a three-phase mains supply or local diesel genset, and start producing within four hours of arrival on site.'

const HAPS_BRIEF =
    'A European-sovereign high-altitude pseudo-satellite for persistent stratospheric operations, modelled on the Wren Aerospace Wren Flyer. Hybrid solar plus hydrogen propulsion: solar arrays sized for daytime cruise, fuel-cell-grade hydrogen storage for night and cloud-cover endurance, a regenerative buffer battery, and a space-grade composite airframe. Target operating ceiling 20 kilometres, multi-week endurance, 35-metre wingspan, 25-kilogram sensor payload (electro-optical, signals intelligence, secure 5G relay). Fixed-wing unmanned, autonomous flight controller, 1090 ES transponder, ground station with satellite uplink. Must launch from a 200-metre runway and recover via gentle stratospheric descent. Target system unit cost under 2.5 million pounds. Compliant with Eurocontrol stratospheric airspace coordination.'

const HEDGEROW_BRIEF =
    'A premium garden bird feeder for the United Kingdom market — working name Hedgerow — with integrated camera, solar power, and on-device machine-learning inference. Body in ceramic or powder-coated steel, real horticultural-grade materials, designed to look beautiful in a garden in year five not just year one (deliberately not the plastic of competitors). Modular seed reservoirs (nyjer, sunflower, suet ball) so the user can attract specific species. Sensors: 12-megapixel camera with optical zoom (key differentiator — competitors skimp on optics), microphone, weight sensor on the perch for individual-bird identification (mass plus visual), temperature, light, and weather sensors. Compute: ~5 trillion operations per second neural processing unit, on-device species identification, individual identification, video clipping. Power: solar panel with lithium iron phosphate battery, target 100 per cent off-grid year-round in United Kingdom conditions; oversized panel for winter solar reliability; optional mains-powered variant for low-light gardens. Connectivity: Wi-Fi to home network, with optional cellular module for users without garden Wi-Fi coverage (£5 per month add-on); LoRa mesh between multiple feeders if the user expands. Companion app: species log, individual identification with naming, daily 60-second auto-curated highlight reel, seasonal trends, citizen-science contribution toggle, family sharing. Citizen science: formal partnership with the British Trust for Ornithology Garden BirdWatch programme, contributing anonymised data with proper provenance. Target retail £220, premium tier £320, target landed bill of materials ~£155. Indicative bill-of-materials targets: camera and optics £30, neural processing unit system-on-chip plus memory plus storage £25, solar panel plus battery plus power management £20, microphone plus weight sensor plus environmental sensors £10, Wi-Fi/Bluetooth-Low-Energy module £5, body (ceramic or steel for longevity) £35, modular reservoirs plus perches plus hardware £15, assembly plus packaging plus quality assurance £15. Compliance: Conformité Européenne Radio Equipment Directive on the radio module (standard module certification carries), United Kingdom Conformity Assessed mark, battery transport regulations, Waste Electrical and Electronic Equipment plus battery waste compliance, EN safety marks for outdoor electricals. No medical, no clinical, no human-face privacy concerns. British Trust for Ornithology data partnership requires a simple data-sharing agreement. Go-to-market: phase one direct-to-consumer plus Royal Horticultural Society partnership plus National Trust shops; strong gifting category (Christmas, Father\'s Day, retirement). Phase two garden centre chains (Dobbies, Wyevale, independents) plus Royal Society for the Protection of Birds shop partnership. Phase three selective international (United States is 5x larger but saturated; Germany and the Netherlands are underserved). Phase four platform play — nest box camera, hedgehog camera, pond camera; the Hedgerow garden-wildlife observation platform.'

const VERTICAL_FARM_BRIEF =
    'A 40-foot containerised modular vertical farm growing year-round leafy greens (lettuce, herbs, brassicas) for the United Kingdom market. Six thousand simultaneous plant slots across multi-tier hydroponic stacks, target yield four tonnes per year per container. LED grow-lights with daily light integral control, climate and carbon-dioxide dosing, recirculating nutrient system, IoT sensor mesh feeding a remote farm-management dashboard. Energy use under 250 kilowatt-hours per day in standard mode. Target installed capital cost under 150,000 pounds. Designed to ship complete on a flatbed lorry, plug into a three-phase mains supply, and run unattended between weekly plantings.'

// ---------------------------------------------------------------------------
// Demo brief assertions — all five must return non-null
// ---------------------------------------------------------------------------

describe('extractCostCeilingFromProse — five demo briefs', () => {
    it('BESS — extracts 180,000 from "Target installed capital cost under 180,000 pounds" and classifies as installed-capex [Item 8]', () => {
        const result = extractCostCeilingFromProse(BESS_BRIEF)
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(180_000)
        // "installed capital cost" should classify as installed-capex, NOT
        // unit-manufacturing-cost. Comparing this against Finn's per-unit
        // output would be a type mismatch.
        expect(result!.ceilingType).toBe('installed-capex')
    })

    it('Vertical Farm — extracts 150,000 and classifies as installed-capex [Item 8]', () => {
        const result = extractCostCeilingFromProse(VERTICAL_FARM_BRIEF)
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(150_000)
        expect(result!.ceilingType).toBe('installed-capex')
    })

    it('Desalination — extracts 350,000 and classifies as installed-capex [Item 8]', () => {
        const result = extractCostCeilingFromProse(DESALINATION_BRIEF)
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(350_000)
        expect(result!.ceilingType).toBe('installed-capex')
    })

    it('HAPS — extracts 2,500,000 from "Target system unit cost under 2.5 million pounds" and classifies as unit-manufacturing-cost [Item 8]', () => {
        const result = extractCostCeilingFromProse(HAPS_BRIEF)
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(2_500_000)
        // "system unit cost" is explicitly a per-unit manufacturing cost.
        expect(result!.ceilingType).toBe('unit-manufacturing-cost')
    })

    it('Hedgerow — returns non-null (bill of materials ~£155)', () => {
        const result = extractCostCeilingFromProse(HEDGEROW_BRIEF)
        expect(result).not.toBeNull()
    })
})

// ---------------------------------------------------------------------------
// Item 8: ceiling type classification
// ---------------------------------------------------------------------------

describe('extractCostCeilingFromProse — ceiling type classification [Item 8]', () => {
    it('classifies "installed capital cost" as installed-capex', () => {
        const result = extractCostCeilingFromProse(
            'Target installed capital cost under £150,000.',
        )
        expect(result).not.toBeNull()
        expect(result!.ceilingType).toBe('installed-capex')
    })

    it('classifies "unit cost" as unit-manufacturing-cost', () => {
        const result = extractCostCeilingFromProse(
            'Target unit cost under £50,000 per system.',
        )
        expect(result).not.toBeNull()
        expect(result!.ceilingType).toBe('unit-manufacturing-cost')
    })

    it('classifies "system unit cost" as unit-manufacturing-cost', () => {
        const result = extractCostCeilingFromProse(
            'Target system unit cost under 2.5 million pounds.',
        )
        expect(result).not.toBeNull()
        expect(result!.ceilingType).toBe('unit-manufacturing-cost')
    })

    it('classifies "annual opex" as annual-opex', () => {
        const result = extractCostCeilingFromProse(
            'Annual opex under £20,000 per year.',
        )
        expect(result).not.toBeNull()
        expect(result!.ceilingType).toBe('annual-opex')
    })

    it('classifies "annual operating cost" as annual-opex', () => {
        const result = extractCostCeilingFromProse(
            'Target annual operating cost below £30,000.',
        )
        expect(result).not.toBeNull()
        expect(result!.ceilingType).toBe('annual-opex')
    })

    it('classifies "project budget" as project-budget', () => {
        const result = extractCostCeilingFromProse(
            'Total project budget under £500,000 for phase one.',
        )
        expect(result).not.toBeNull()
        expect(result!.ceilingType).toBe('project-budget')
    })

    it('defaults generic "target ... under £X" to unit-manufacturing-cost', () => {
        // No specific type qualifier — backward-compatible default.
        const result = extractCostCeilingFromProse(
            'Target under £100,000 for this system.',
        )
        expect(result).not.toBeNull()
        expect(result!.ceilingType).toBe('unit-manufacturing-cost')
    })
})

// ---------------------------------------------------------------------------
// Item 8: extractAllCostCeilingsFromProse — multiple ceiling extraction
// ---------------------------------------------------------------------------

describe('extractAllCostCeilingsFromProse — multiple ceilings [Item 8]', () => {
    it('returns empty array for text with no costs', () => {
        const result = extractAllCostCeilingsFromProse('A solar wildlife monitor.')
        expect(result).toHaveLength(0)
    })

    it('extracts distinct types when brief has multiple ceilings', () => {
        const text =
            'Target system unit cost under £2.5 million. ' +
            'Target installed capital cost under £3.5 million. ' +
            'Annual opex target under £50,000.'
        const result = extractAllCostCeilingsFromProse(text)
        // Should find all three distinct ceiling types.
        const types = result.map((r) => r.ceilingType)
        expect(types).toContain('unit-manufacturing-cost')
        expect(types).toContain('installed-capex')
        expect(types).toContain('annual-opex')
    })

    it('deduplicates when the same type appears twice — keeps first occurrence', () => {
        const text =
            'Unit cost under £100,000. ' +
            'Build cost should not exceed £120,000.'
        const result = extractAllCostCeilingsFromProse(text)
        const unitCostEntries = result.filter(
            (r) => r.ceilingType === 'unit-manufacturing-cost',
        )
        // Both phrases map to unit-manufacturing-cost; only the first is kept.
        expect(unitCostEntries).toHaveLength(1)
        expect(unitCostEntries[0].gbp).toBe(100_000)
    })

    it('returns a single entry for a single-ceiling brief', () => {
        const result = extractAllCostCeilingsFromProse(
            'Target installed capital cost under £180,000 pounds.',
        )
        expect(result).toHaveLength(1)
        expect(result[0].ceilingType).toBe('installed-capex')
        expect(result[0].gbp).toBe(180_000)
    })
})

// ---------------------------------------------------------------------------
// Edge-case tests — multipliers, qualifiers, currency variants
// ---------------------------------------------------------------------------

describe('extractCostCeilingFromProse — edge cases', () => {
    it('handles "approximately £350k"', () => {
        const result = extractCostCeilingFromProse('approximately £350k unit cost')
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(350_000)
    })

    it('handles "1.5 million pounds"', () => {
        const result = extractCostCeilingFromProse(
            'Target build cost under 1.5 million pounds for the prototype.',
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(1_500_000)
    })

    it('handles "1.5M GBP"', () => {
        const result = extractCostCeilingFromProse('Target unit cost ceiling: GBP 1.5M')
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(1_500_000)
    })

    it('handles "GBP 1,500,000"', () => {
        const result = extractCostCeilingFromProse(
            'Budget ceiling GBP 1,500,000 for the installed system.',
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(1_500_000)
    })

    it('handles "2.5 million pounds sterling"', () => {
        const result = extractCostCeilingFromProse(
            'Target system unit cost under 2.5 million pounds sterling.',
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(2_500_000)
    })

    it('handles "around £350,000"', () => {
        const result = extractCostCeilingFromProse(
            'Target capital cost around £350,000 installed.',
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(350_000)
    })

    it('returns null for text with no numeric cost', () => {
        const result = extractCostCeilingFromProse(
            'A solar-powered device for monitoring wildlife in remote locations.',
        )
        expect(result).toBeNull()
    })

    it('returns null for empty string', () => {
        expect(extractCostCeilingFromProse('')).toBeNull()
    })

    it('handles "unit cost under £500,000" (new unit cost keyword)', () => {
        const result = extractCostCeilingFromProse(
            'The target unit cost under £500,000 per system.',
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(500_000)
    })

    it('handles "system unit price under 3 million pounds"', () => {
        const result = extractCostCeilingFromProse(
            'Target system unit price under 3 million pounds.',
        )
        expect(result).not.toBeNull()
        expect(result!.gbp).toBe(3_000_000)
    })
})
