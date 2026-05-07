import { REQUIRED_PARTS } from './required-parts-manifest'
import { classifyRegime } from './part-regime'
import { routePartLookup } from './regime-router'
import type { Part, BomLine, Module } from '../types'

const MASS_ESTIMATES: Record<string, number> = {
  'Battery Management System': 5,
  'Fire Detection and Suppression': 3,
  'DC Busbars and Fusing': 2,
  'Expansion Tank': 8,
  'Pressure Relief Valve': 1.5,
  'Thermal Insulation': 15,
  'Liquid Cooling Loop': 12,
  'EMS (Energy Management System)': 2,
  'Propeller Guards': 0.3,
  'Emergency Parachute': 0.5,
  'LED Navigation Lights': 0.1,
  'LiPo Battery Safety Bag': 0.2,
  'Emergency Drop Weight': 5,
  'Leak Detector': 0.3,
  'Recovery Beacon': 0.2,
  'G99 Protection Relay': 2,
  'Isolation Contactors': 1.5,
  'Residual Current Device': 0.5,
  'Surge Protection Device': 0.5,
  'Metering': 1,
  'Solar Array': 25,
  'Battery Pack': 30,
  'GPS + IMU Navigation': 0.3,
  'Radiation-Tolerant Electronics': 1,
  'Sterilisation System': 10,
  'pH / DO / Temperature Sensors': 0.5,
  'Aeration System': 3,
  'BMC / IPMI Module': 0.2,
  'Redundant PSU': 2,
  'Thermal Solution': 1,
  'Biocompatible Skin Adhesive': 0.1,
  'Battery Safety Circuit': 0.1,
  'ESD Protection Components': 0.01,
  'Conformal Coating': 0.01,
}

export async function buildDeterministicPhase(
  productClass: string | undefined,
  modules: Module[]
): Promise<{ deterministicParts: Part[]; deterministicBomLines: BomLine[] }> {
  if (!productClass || !REQUIRED_PARTS[productClass]) {
    return { deterministicParts: [], deterministicBomLines: [] }
  }

  const parts: Part[] = []
  const bomLines: BomLine[] = []
  const requirements = REQUIRED_PARTS[productClass]

  const sourceModuleId = modules[0]?.id || 'mod-001'

  let counter = 1
  for (const req of requirements) {
    const id = `det-part-${Date.now()}-${counter++}`
    const part: Part = {
      id,
      partNumber: id,
      name: req.name,
      sourceModuleId,
      process: req.typicalProcess,
      isPurchased: req.typicalProcess.toLowerCase().includes('cots'),
      material: 'varies',
      massKg: MASS_ESTIMATES[req.name] || 1,
      estimatedUnitCostGbp: undefined,
    }
    
    ;(part as any).sourceManifest = true

    // Phase 2: Distributor Lookup
    const regimeClass = classifyRegime(part)
    try {
      const result = await routePartLookup({
        name: part.name,
        partNumber: part.partNumber,
        regime: regimeClass.regime,
        sourceModuleId: part.sourceModuleId,
      })
      if (result.priceGbp !== undefined) {
        part.estimatedUnitCostGbp = result.priceGbp
        ;(part as any).supplier = result.supplier
        ;(part as any).sku = result.sku
        ;(part as any).datasheetUrl = result.datasheetUrl
        ;(part as any).priceSource = 'distributor'
      }
    } catch (e) {
      console.warn(`[bom-builder] distributor lookup failed for ${part.name}:`, (e as Error).message)
    }

    parts.push(part)
    bomLines.push({
      parentPartId: null, // Top level
      childPartId: id,
      quantity: 1
    })
  }

  return { deterministicParts: parts, deterministicBomLines: bomLines }
}

export function deduplicateBom(
  deterministicParts: Part[],
  deterministicBomLines: BomLine[],
  llmParts: Part[],
  llmBomLines: BomLine[],
  productClass?: string
): { finalParts: Part[]; finalBomLines: BomLine[] } {
  const finalParts = [...deterministicParts]
  const finalBomLines = [...deterministicBomLines]
  
  // Create a fast lookup for deterministic names to check similarity
  const detNames = deterministicParts.map(p => p.name.toLowerCase())
  const requirements = productClass ? REQUIRED_PARTS[productClass] || [] : []

  // Check if LLM part is covered by a deterministic part
  for (const llmPart of llmParts) {
    const llmName = llmPart.name.toLowerCase()
    
    let isDuplicate = false

    // Check search terms from REQUIRED_PARTS first to be rigorous
    for (const req of requirements) {
      // Is this requirement in deterministic parts? (It should be)
      if (detNames.includes(req.name.toLowerCase())) {
        for (const term of req.searchTerms) {
          if (llmName.includes(term.toLowerCase())) {
            isDuplicate = true
            break
          }
        }
      }
      if (isDuplicate) break
    }

    // Fallback: simple string inclusion check for safety
    if (!isDuplicate) {
      for (const detName of detNames) {
        if (detName.includes(llmName) || llmName.includes(detName)) {
          isDuplicate = true
          break
        }
      }
    }

    if (!isDuplicate) {
      finalParts.push(llmPart)
    }
  }

  // Add the LLM BOM lines only for parts that survived deduplication
  const validPartIds = new Set(finalParts.map(p => p.id || p.partNumber))
  for (const bl of llmBomLines) {
    if (validPartIds.has(bl.childPartId)) {
      finalBomLines.push(bl)
    }
  }

  return { finalParts, finalBomLines }
}
