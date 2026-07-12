import { readFileSync } from 'fs'
import { join } from 'path'
import { classifyProduct } from './product-classifier'

const BRIEFS_DIR = join(__dirname, 'briefs')

function loadBrief(slug: string, round: 'detailed' | 'minimal'): string {
  const dir = round === 'detailed' ? 'baseline-10' : 'baseline-10-minimal'
  return readFileSync(join(BRIEFS_DIR, dir, slug), 'utf-8')
}

describe('classifyProduct — baseline-10 detailed briefs', () => {
  const cases: [string, string][] = [
    ['01-cgm-wearable.md', 'wearable_medical'],
    ['02-drone-prosumer.md', 'drone'],
    ['03-edge-ai-server.md', 'edge_ai_server'],
    ['04-heatpump-30kw.md', 'thermal_system'],
    ['05-dc-fast-ev-charger.md', 'ev_charger'],
    ['06-pharma-bioreactor.md', 'bioreactor'],
    ['07-vertical-farm.md', 'vertical_farm'],
    ['08-auv-coastal.md', 'auv'],
    ['09-bess-container.md', 'energy_storage'],
    ['10-haps-stratospheric.md', 'haps'],
  ]

  for (const [slug, expected] of cases) {
    it(`classifies ${slug} as ${expected}`, () => {
      const brief = loadBrief(slug, 'detailed')
      const result = classifyProduct(brief)
      expect(result.productClass).toBe(expected)
    })
  }
})

describe('classifyProduct — baseline-10 minimal briefs', () => {
  const cases: [string, string][] = [
    ['01-cgm-wearable.md', 'wearable_medical'],
    ['02-drone-prosumer.md', 'drone'],
    ['03-edge-ai-server.md', 'edge_ai_server'],
    ['04-heatpump-30kw.md', 'thermal_system'],
    ['05-dc-fast-ev-charger.md', 'ev_charger'],
    ['06-pharma-bioreactor.md', 'bioreactor'],
    ['07-vertical-farm.md', 'vertical_farm'],
    ['08-auv-coastal.md', 'auv'],
    ['09-bess-container.md', 'energy_storage'],
    ['10-haps-stratospheric.md', 'haps'],
  ]

  for (const [slug, expected] of cases) {
    it(`classifies ${slug} as ${expected}`, () => {
      const brief = loadBrief(slug, 'minimal')
      const result = classifyProduct(brief)
      expect(result.productClass).toBe(expected)
    })
  }
})

describe('classifyProduct — edge cases', () => {
  it('classifies a brief mentioning "drone" once in passing as drone', () => {
    const result = classifyProduct('We are building a drone for the UK market.')
    expect(result.productClass).toBe('drone')
  })

  it('does NOT classify a BESS brief mentioning "thermal management" as thermal_system', () => {
    const brief = 'A 3.5 MWh BESS container with lithium-ion cells, thermal management, BMS, 400V DC, 100kW power conversion system, cycle life 6000.'
    const result = classifyProduct(brief)
    expect(result.productClass).toBe('energy_storage')
  })

  it('classifies "autonomous underwater" as AUV even without the word AUV', () => {
    const result = classifyProduct('An autonomous underwater vehicle for coastal survey, 100m depth, 24h endurance.')
    expect(result.productClass).toBe('auv')
  })

  it('classifies "high-altitude pseudo-satellite" as HAPS', () => {
    const result = classifyProduct('A high-altitude pseudo-satellite with 50m wingspan, solar-electric, 30-day endurance at 20km.')
    expect(result.productClass).toBe('haps')
  })

  it('classifies "DC fast charger" as EV charger', () => {
    const result = classifyProduct('A 150 kW DC fast charger with CCS2 connectors for motorway service stations.')
    expect(result.productClass).toBe('ev_charger')
  })

  it('classifies "bioreactor" as bioreactor', () => {
    const result = classifyProduct('A 200-litre bioreactor for pharma cell culture, sterilisable vessel.')
    expect(result.productClass).toBe('bioreactor')
  })

  it('returns unknown for a brief with no recognisable product keywords', () => {
    const result = classifyProduct('A general-purpose thing for various applications.')
    expect(result.productClass).toBe('unknown')
  })

  it('returns LOW confidence for unknown class', () => {
    const result = classifyProduct('A general-purpose thing.')
    expect(result.confidence).toBe('LOW')
  })

  it('returns HIGH confidence for a detailed drone brief', () => {
    const result = classifyProduct('A drone with brushless motors, flight controller, gimbal, 4K camera, ESC, propellers.')
    expect(result.confidence).toBe('HIGH')
  })

  // Grok P0 (2026-07-12): an optical/photometric instrument must NOT land on pcb_assembly.
  it('classifies a photometer/colorimeter brief as optical_instrument (beats the pcb_assembly catch)', () => {
    const brief = 'A portable single-wavelength photometer (colorimeter): an LED source through a 10 mm cuvette, '
      + 'photodiode detector, reports absorbance and transmittance. Deliver a schematic, PCB or module interconnect '
      + 'design, enclosure CAD, an exact bill of materials, firmware, and assembly instructions.'
    expect(classifyProduct(brief).productClass).toBe('optical_instrument')
  })
  it('a cuvette-based absorbance instrument classifies as optical_instrument', () => {
    expect(classifyProduct('Benchtop instrument: a cuvette holder, absorbance measurement across the 430–940 nm wavelength range, Beer-Lambert.').productClass).toBe('optical_instrument')
  })
  it('a genuine PCBA contract-manufacturing brief still classifies as pcb_assembly (no regression)', () => {
    expect(classifyProduct('PCBA contract line: SMT assembly, BGA reflow, solder paste stencil, 6-layer pcb assembly, pick and place.').productClass).toBe('pcb_assembly')
  })
})
