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
    const missingRequired = [...(parsedBrief.missing_mandatory_fields ?? [])]

    // core_constraints_present: the brief must have at least a project_id,
    // a product_description, and one physical/cost anchor before the pipeline
    // can do any useful work.  Without these the LLM stages cannot be steered.
    const hasProjectId = Boolean(parsedBrief.project_id?.trim())
    const hasProductDesc = Boolean(parsedBrief.product_description?.trim())
    const hasOneAnchor =
      (parsedBrief.constraints?.unit_cost_ceiling?.value != null) ||
      (parsedBrief.constraints?.max_mass_kg?.value != null) ||
      (parsedBrief.constraints?.max_dimensions_mm?.w != null ||
       parsedBrief.constraints?.max_dimensions_mm?.d != null ||
       parsedBrief.constraints?.max_dimensions_mm?.h != null)
    const coreConstraintsPresent = hasProjectId && hasProductDesc && hasOneAnchor

    // Only block when the brief is truly unparseable (no core constraints).
    // HIGH/MEDIUM/LOW confidence with missing optional fields is NOT a block —
    // the report-type router (PA Stage 9) decides report length based on
    // confidence + missing_mandatory_fields count.  The validator's only job
    // here is to prevent completely empty briefs from entering the pipeline.
    const canProceed = coreConstraintsPresent

    const blockedReasons: string[] = canProceed
      ? []
      : [
          !hasProjectId ? 'Brief has no project_id — cannot identify the project' : '',
          !hasProductDesc ? 'Brief has no product_description — pipeline cannot be steered' : '',
          !hasOneAnchor ? 'Brief has no physical/cost anchor (unit_cost_ceiling, max_mass_kg, or max_dimensions_mm) — at least one is required' : '',
        ].filter(Boolean)

    const warnings: string[] = []
    if (parsedBrief.confidence === 'LOW') {
      warnings.push('Brief confidence is LOW — consider providing more detail')
    }
    if (missingRequired.length > 0) {
      warnings.push(`${missingRequired.length} mandatory field(s) missing: ${missingRequired.join(', ')} — report-type router will decide report length`)
    }

    return {
      isValid: canProceed,
      missingRequired,
      missingRecommended: [],
      warnings,
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
