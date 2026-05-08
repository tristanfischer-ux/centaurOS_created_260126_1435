import type { StructuredBriefJSON } from './types'

export interface BriefValidation {
  isValid: boolean
  missingRequired: string[]
  missingRecommended: string[]
  warnings: string[]
  classification: string
  requiredFields: string[]
  canProceedToFullReport: boolean
  blockedReasons: string[]
}

export interface DesignBriefConstraints {
  unitCostCeilingGbp?: number
  [key: string]: unknown
}

export interface DesignBriefPayload {
  architecture_type?: string
  constraints?: DesignBriefConstraints
  [key: string]: unknown
}

/**
 * Validates the founder's brief against required fields for the specific product class.
 *
 * When state.parsedBrief is present (PA_PIPELINE=true path), validation is driven by
 * parsedBrief.missing_mandatory_fields instead of the legacy raw-text detection.
 * When parsedBrief is absent, legacy behaviour is unchanged.
 */
export function validateBrief(
  briefText: string,
  designBrief: DesignBriefPayload | null | undefined,
  productClass: string,
  requiredFields: string[],
  parsedBrief?: StructuredBriefJSON | null,
): BriefValidation {
  // ── PA path: use parsedBrief.missing_mandatory_fields as the authoritative source ──
  if (parsedBrief) {
    const missingRequired = [...parsedBrief.missing_mandatory_fields]
    const blockedReasons = missingRequired.map(f => `Missing mandatory field: ${f}`)
    const canProceed = missingRequired.length === 0

    return {
      isValid: canProceed,
      missingRequired,
      missingRecommended: [],
      warnings: parsedBrief.confidence === 'LOW'
        ? ['Brief confidence is LOW — consider providing more detail']
        : [],
      classification: productClass,
      requiredFields,
      canProceedToFullReport: canProceed,
      blockedReasons,
    }
  }

  // ── Legacy path (PA_PIPELINE=false): existing logic below ────────────────
  const missingRequired: string[] = []
  const missingRecommended: string[] = []
  const warnings: string[] = []
  const blockedReasons: string[] = []
  
  const lowerBriefText = briefText.toLowerCase()
  
  // Check each required field
  for (const field of requiredFields) {
    let value: unknown = undefined
    
    if (designBrief) {
      if (field in designBrief) {
        value = designBrief[field]
      } else if (designBrief.constraints && field in designBrief.constraints) {
        value = designBrief.constraints[field]
      }
    }
    
    // Check narrative text with flexible matching
    const fieldVariants = field.replace(/_/g, ' ').split(' ')
    const narrativeHasValue = fieldVariants.some(v => lowerBriefText.includes(v)) ||
      lowerBriefText.includes(field.replace(/_/g, ' ')) ||
      // Also check for common patterns in the brief
      (field === 'thermal_capacity_kw' && lowerBriefText.match(/\d+\s*kw/)) ||
      (field === 'cop_target' && lowerBriefText.match(/cop\s*[>=]+\s*[\d.]+/)) ||
      (field === 'refrigerant_type' && lowerBriefText.match(/r\d{2,3}[a-z]?|propane|r290/)) ||
      (field === 'architecture_type' && lowerBriefText.match(/monobloc|split|hydronic|package/)) ||
      (field === 'production_volume' && lowerBriefText.match(/\d+\s*units?\s*(?:per|a)\s*year/)) ||
      (field === 'target_cost' && lowerBriefText.match(/£[\d,]+|target.*cost/i)) ||
      (field === 'max_mass' && lowerBriefText.match(/\d+\s*kg/)) ||
      (field === 'jurisdiction' && lowerBriefText.match(/uk|eu|us|united kingdom|europe|united states/)) ||
      (field === 'product_type' && (lowerBriefText.includes('heat pump') || lowerBriefText.includes('chiller') || lowerBriefText.includes('hvac') || lowerBriefText.includes('thermal'))) ||
      (field === 'max_mass' && lowerBriefText.match(/max|limit|weight|mass/))
    
    if (value === null || value === undefined || value === '' || value === 0) {
      if (narrativeHasValue) {
        warnings.push(`Field '${field}' not in structured brief but appears in narrative — extraction may have failed`)
      } else {
        missingRequired.push(field)
      }
    }
  }
  
  // Check for £0.00, blank, "-", "None" rendered as values
  if (designBrief?.constraints?.unitCostCeilingGbp === 0) {
    missingRequired.push('unit_cost_ceiling (found £0.00 — likely not extracted)')
    blockedReasons.push('Cost ceiling is £0.00 which is not a valid engineering constraint')
  }
  
  // Check for architecture decision (product-specific)
  if (productClass === 'thermal_system' || productClass === 'fluid_processing') {
    const hasArchitectureMatch = lowerBriefText.match(/monobloc|split|hydronic|package/)
    if (!designBrief?.architecture_type && !hasArchitectureMatch) {
      missingRequired.push('architecture_type')
      blockedReasons.push('Architecture type not specified — cannot generate modules without it')
    }
  }
  
  // Check for coefficient of performance and capacity targets (thermal systems)
  if (productClass === 'thermal_system') {
    if (!lowerBriefText.match(/cop|scop|efficiency|seasonal/)) {
      missingRecommended.push('cop_target')
      warnings.push('No coefficient of performance or efficiency target specified')
    }
    if (!lowerBriefText.match(/kw|btu|ton|capacity/)) {
      missingRecommended.push('thermal_capacity')
      warnings.push('No capacity target specified')
    }
  }
  
  const canProceed = missingRequired.length === 0 && blockedReasons.length === 0
  
  return {
    isValid: canProceed,
    missingRequired,
    missingRecommended,
    warnings,
    classification: productClass,
    requiredFields,
    canProceedToFullReport: canProceed,
    blockedReasons,
  }
}
