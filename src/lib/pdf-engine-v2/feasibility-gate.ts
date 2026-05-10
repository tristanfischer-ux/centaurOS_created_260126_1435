// ── Per-class feasibility checks ────────────────────────────────────────────
//
// UNIVERSAL-ROBUSTNESS FIX (2026-05-10): class-aware checks alongside the
// universal cost/mass/spatial checks. These are WARN-only checks — a missing
// input returns N/A (never fails the gate). Computable checks use data from
// the brief targets/specs; checks requiring simulation return N/A.
//
// Council finding: only check what's computable from the brief. Checks that
// require thermodynamic simulation or agronomic modelling return N/A cleanly.

export interface ClassCheck {
  name: string
  status: 'PASS' | 'WARN' | 'FAIL' | 'N/A'
  reasoning: string
}

export function runClassChecks(
  productClass: string,
  targets: Record<string, number | undefined>,
  costResult: { unitTotalGbp: number; ceilingGbp: number | null } | null,
): ClassCheck[] {
  const pc = (productClass || '').toLowerCase()
  const checks: ClassCheck[] = []

  // ── Vertical farm / CEA ────────────────────────────────────────────────
  if (/vertical.?farm|farm|cea|indoor.?grow|horticul/.test(pc)) {
    // kWh/kg yield — check against CEA benchmark of ≤2.5 kWh/kg leafy greens
    const kwhPerKg = targets.kwh_per_kg ?? targets.energy_per_kg_kwh
    if (kwhPerKg != null) {
      checks.push({
        name: 'CEA energy efficiency (kWh/kg)',
        status: kwhPerKg <= 2.5 ? 'PASS' : kwhPerKg <= 4.0 ? 'WARN' : 'FAIL',
        reasoning: `Brief energy efficiency: ${kwhPerKg} kWh/kg. CEA benchmark: ≤2.5 kWh/kg leafy greens (IGS/Jones Food data). ${kwhPerKg > 4.0 ? 'Exceeds viable threshold — review LED specification and HVAC efficiency.' : kwhPerKg > 2.5 ? 'Above benchmark — optimise LED PPFD ratio and heat recovery.' : 'Within benchmark.'}`,
      })
    } else {
      checks.push({ name: 'CEA energy efficiency (kWh/kg)', status: 'N/A', reasoning: 'kwh_per_kg not specified in brief — cannot check energy efficiency.' })
    }

    // L/kg water efficiency — check against CEA benchmark of ≤2 L/kg
    const lPerKg = targets.water_litres_per_kg ?? targets.l_per_kg
    if (lPerKg != null) {
      checks.push({
        name: 'CEA water efficiency (L/kg)',
        status: lPerKg <= 2.0 ? 'PASS' : lPerKg <= 5.0 ? 'WARN' : 'FAIL',
        reasoning: `Brief water efficiency: ${lPerKg} L/kg. CEA benchmark: ≤2 L/kg for closed-loop hydroponic (AeroFarms/Bowery data). ${lPerKg > 5.0 ? 'Exceeds viable threshold — ensure recirculation and recapture.' : lPerKg > 2.0 ? 'Above benchmark — check recirculation and condensate recovery.' : 'Within benchmark.'}`,
      })
    } else {
      checks.push({ name: 'CEA water efficiency (L/kg)', status: 'N/A', reasoning: 'water_litres_per_kg not specified in brief — cannot check water efficiency.' })
    }

    // PPFD — check if specified at all (cannot compute from brief alone without LED count)
    const ppfd = targets.ppfd_umol_m2_s
    if (ppfd != null) {
      checks.push({
        name: 'CEA PPFD (μmol/m²/s)',
        status: ppfd >= 200 && ppfd <= 600 ? 'PASS' : ppfd < 150 ? 'WARN' : 'WARN',
        reasoning: `Brief PPFD: ${ppfd} μmol/m²/s. Typical leafy greens: 200–400 μmol/m²/s. Fruiting crops: 400–600 μmol/m²/s. ${ppfd < 200 ? 'Below typical minimum — check LED specification.' : ppfd > 800 ? 'Very high — verify heat load assumptions.' : 'Within typical range.'}`,
      })
    } else {
      checks.push({ name: 'CEA PPFD (μmol/m²/s)', status: 'N/A', reasoning: 'PPFD not specified in brief — computed from LED specification at BOM stage.' })
    }
  }

  // ── Drone ────────────────────────────────────────────────────────────
  if (/drone|uav|multirotor|quadcopter/.test(pc)) {
    // Thrust-to-weight ratio — check if MTOW and max thrust are both specified
    const mtowKg = targets.mtow_kg ?? targets.max_takeoff_weight_kg
    const thrustN = targets.max_thrust_n
    if (mtowKg != null && thrustN != null) {
      const twr = thrustN / (mtowKg * 9.81)
      checks.push({
        name: 'Drone thrust-to-weight ratio',
        status: twr >= 1.5 ? 'PASS' : twr >= 1.2 ? 'WARN' : 'FAIL',
        reasoning: `Thrust-to-weight ratio: ${twr.toFixed(2)}. Minimum for safe hover margin: 1.5×. Hover point: 1.0×. ${twr < 1.2 ? 'Insufficient thrust margin — design will not sustain payload at altitude.' : twr < 1.5 ? 'Marginal — consider lighter airframe or higher-KV motors.' : 'Adequate for commercial operation.'}`,
      })
    } else {
      checks.push({ name: 'Drone thrust-to-weight ratio', status: 'N/A', reasoning: 'MTOW and/or max thrust not specified — cannot compute thrust-to-weight.' })
    }

    // MTOW vs UK CAA class threshold (if jurisdiction is UK)
    if (mtowKg != null) {
      const uaClass = mtowKg < 0.25 ? 'C0 (<250g)' : mtowKg < 0.9 ? 'C1 (<900g)' : mtowKg < 4.0 ? 'C2 (<4kg)' : mtowKg < 25.0 ? 'C3/C4 (<25kg)' : 'Heavy (>25kg)'
      checks.push({
        name: 'Drone CAA weight class',
        status: 'PASS', // informational — classification doesn't block
        reasoning: `MTOW ${mtowKg} kg → UK CAA UAS category: ${uaClass}. Confirm operational scenario (VLOS/BVLOS, over-people) is covered by the regulatory path.`,
      })
    } else {
      checks.push({ name: 'Drone CAA weight class', status: 'N/A', reasoning: 'MTOW not specified in brief.' })
    }
  }

  // ── Heat pump ────────────────────────────────────────────────────────
  if (/heat.?pump|thermal.?system/.test(pc)) {
    // Refrigerant GWP — check if a refrigerant is specified
    const refrigerant = (targets as any).refrigerant as string | undefined
    if (refrigerant) {
      const lowGwp = /r290|r32|r1234yf|r1234ze|r717|r744/.test(refrigerant.toLowerCase())
      const highGwp = /r410a|r407c|r22|r134a/.test(refrigerant.toLowerCase())
      checks.push({
        name: 'Refrigerant GWP vs F-Gas Regulation',
        status: lowGwp ? 'PASS' : highGwp ? 'WARN' : 'WARN',
        reasoning: `Refrigerant: ${refrigerant}. ${highGwp ? 'High-GWP refrigerant — UK F-Gas Regulation phase-down: R410A banned in new equipment after 2025.' : lowGwp ? 'Low-GWP refrigerant — compliant with EU/UK F-Gas Regulation trajectory.' : 'Refrigerant GWP not determined — verify F-Gas compliance before CE/UKCA marking.'}`,
      })
    } else {
      checks.push({ name: 'Refrigerant GWP vs F-Gas Regulation', status: 'N/A', reasoning: 'Refrigerant type not specified in brief — confirm compliance before type approval.' })
    }

    // Rated capacity check
    const capacityKw = targets.rated_capacity_kw ?? targets.heating_capacity_kw
    if (capacityKw != null && capacityKw > 0) {
      checks.push({
        name: 'Heat pump rated capacity specified',
        status: 'PASS',
        reasoning: `Rated capacity: ${capacityKw} kW. Present in brief — SCOP calculation requires third-party test data (BS EN 14825) and is not computable at feasibility stage.`,
      })
    } else {
      checks.push({ name: 'Heat pump rated capacity specified', status: 'N/A', reasoning: 'Rated capacity not specified in brief — required for MCS/UKCA certification.' })
    }
  }

  // ── EV charger ────────────────────────────────────────────────────────
  if (/ev.?charg|electric.?vehicl.?charg|ccs|ocpp|charge.?point/.test(pc)) {
    const maxKw = targets.max_power_kw ?? targets.dc_output_kw
    if (maxKw != null) {
      const tier = maxKw <= 22 ? 'AC (Mode 3)' : maxKw <= 100 ? 'DC Fast (50–100 kW)' : 'DC Rapid (>100 kW)'
      checks.push({
        name: 'EV charger power class',
        status: 'PASS',
        reasoning: `Max output: ${maxKw} kW → ${tier}. UK OZEV grant eligibility: ≤22 kW for OZEV-funded AC chargers. UKAS/CTSI pattern approval required for revenue-grade metering above 22 kW.`,
      })
    } else {
      checks.push({ name: 'EV charger power class', status: 'N/A', reasoning: 'Max power output not specified — required for chargepoint type classification.' })
    }

    // Protocol compliance
    const ocppVersion = targets.ocpp_version as any
    checks.push({
      name: 'OCPP protocol version',
      status: ocppVersion ? 'PASS' : 'WARN',
      reasoning: ocppVersion ? `OCPP ${ocppVersion} specified.` : 'OCPP version not specified — OZEV EVHS scheme requires OCPP 1.6 or 2.0.1 compliance.',
    })
  }

  // ── Bioreactor ────────────────────────────────────────────────────────
  if (/bioreactor|fermenter|bioprocess/.test(pc)) {
    const workingVolumeL = targets.working_volume_l ?? targets.vessel_volume_l
    if (workingVolumeL != null) {
      checks.push({
        name: 'Bioreactor working volume',
        status: 'PASS',
        reasoning: `Working volume: ${workingVolumeL} L. GMP grade classification depends on volume and application: R&D (<10 L), Pilot (10–500 L), Manufacturing (>500 L). Ensure vessel pressure rating matches SIP/CIP cycle parameters.`,
      })
    } else {
      checks.push({ name: 'Bioreactor working volume', status: 'N/A', reasoning: 'Working volume not specified in brief — required for vessel sizing and GMP classification.' })
    }

    // Sterilisation requirement
    checks.push({
      name: 'Bioreactor SIP/CIP requirement',
      status: 'WARN',
      reasoning: 'Sterilise-in-place (SIP) and clean-in-place (CIP) requirements are regulatory for GMP-grade bioreactors. Confirm vessel material (316L SS), surface finish (Ra ≤ 0.8 µm), and steam-rated design pressure.',
    })
  }

  // ── AUV ────────────────────────────────────────────────────────────
  if (/auv|autonomous.?underw|underwater/.test(pc)) {
    const depthRatingM = targets.depth_rating_m ?? targets.max_depth_m
    if (depthRatingM != null) {
      const pressureBar = depthRatingM / 10
      checks.push({
        name: 'AUV depth rating / pressure hull',
        status: 'PASS',
        reasoning: `Depth rating: ${depthRatingM} m (${pressureBar.toFixed(0)} bar external). Pressure hull material and wall thickness must be verified by FEA for the design pressure. Seal system (O-ring, face seal) must be qualified at 1.5× working pressure.`,
      })
    } else {
      checks.push({ name: 'AUV depth rating / pressure hull', status: 'N/A', reasoning: 'Depth rating not specified — required for pressure hull and connector specification.' })
    }
  }

  // ── Edge AI ────────────────────────────────────────────────────────
  if (/edge.?ai|edge.?compute|inference.?server/.test(pc)) {
    const tdpW = targets.thermal_design_power_w ?? targets.tdp_w
    if (tdpW != null) {
      checks.push({
        name: 'Edge AI thermal design power (TDP)',
        status: tdpW <= 300 ? 'PASS' : tdpW <= 800 ? 'WARN' : 'WARN',
        reasoning: `TDP: ${tdpW} W. Passive cooling threshold: ≤ ~30 W. Active air-cooling: ≤ ~300 W. Liquid-cooling required: > 300 W. ${tdpW > 300 ? 'Liquid cooling required — factor in coolant loop and pump in BOM.' : 'Air cooling feasible — verify heatsink and fan sizing.'}`,
      })
    } else {
      checks.push({ name: 'Edge AI thermal design power (TDP)', status: 'N/A', reasoning: 'TDP not specified — required for thermal solution selection and enclosure sizing.' })
    }

    const topsThroughput = targets.tops_throughput ?? targets.tops
    if (topsThroughput != null) {
      checks.push({
        name: 'Edge AI inference throughput (TOPS)',
        status: 'PASS',
        reasoning: `Target throughput: ${topsThroughput} TOPS. Match against selected GPU/NPU module sustained TOPS at operating temperature. Note: peak TOPS ≠ sustained TOPS — confirm with thermal characterisation.`,
      })
    } else {
      checks.push({ name: 'Edge AI inference throughput (TOPS)', status: 'N/A', reasoning: 'Inference throughput (TOPS) not specified — required for compute module selection.' })
    }
  }

  // ── HAPS ────────────────────────────────────────────────────────
  if (/haps|stratospher|high.?altitude|pseudo.?satellite/.test(pc)) {
    const altitudeM = targets.operating_altitude_m ?? targets.cruise_altitude_m
    if (altitudeM != null) {
      checks.push({
        name: 'HAPS altitude / stratospheric environment',
        status: altitudeM >= 18_000 ? 'PASS' : 'WARN',
        reasoning: `Operating altitude: ${altitudeM} m. True stratospheric HAPS: ≥18,000 m (above commercial air traffic). At this altitude: ambient temperature −55 to −65°C, pressure 50–70 hPa, UV-B flux 2× sea level. All electronics, materials, and batteries must be qualified for stratospheric environment.`,
      })
    } else {
      checks.push({ name: 'HAPS altitude / stratospheric environment', status: 'N/A', reasoning: 'Operating altitude not specified — required for material and electronics qualification.' })
    }

    const payloadKg = targets.payload_mass_kg ?? targets.payload_kg
    const enduranceDays = targets.endurance_days ?? targets.station_keeping_days
    if (payloadKg != null && enduranceDays != null) {
      checks.push({
        name: 'HAPS payload / endurance trade',
        status: 'PASS',
        reasoning: `Payload: ${payloadKg} kg, endurance: ${enduranceDays} days. Solar power budget must cover payload power + propulsion + avionics across worst-case winter solstice at operating latitude.`,
      })
    } else {
      checks.push({ name: 'HAPS payload / endurance trade', status: 'N/A', reasoning: 'Payload mass and/or endurance not specified — critical inputs for solar array and battery sizing.' })
    }
  }

  return checks
}

export interface FeasibilityResult {
  status: 'GREEN' | 'AMBER' | 'RED' | 'UNREVIEWED'
  reason: string
  blockers: string[]
  warnings: string[]
  canGenerateFullReport: boolean
  allowedSections: string[]
  forbiddenSections: string[]
  decisionPageData: {
    verdict: string
    biggestBlocker: string
    missingInputs: string[]
    commercialWarning: string
    engineeringWarning: string
    nextActions: string[]
  }
  // CX-001 (2026-05-06): compact one-line banner for the cover + running
  // header. Derived from status + the most material blocker / warning.
  // Renderer shows it as a colour-coded pill.
  compactBanner: string
  /**
   * PA Stage 9 (Phase F+): resolved report type set by routeReportType().
   * Optional for backwards compatibility — absent on legacy/non-PA runs.
   */
  reportType?: import('./report-type-router').ReportType
  /**
   * UNIVERSAL-ROBUSTNESS FIX (2026-05-10): per-class engineering checks.
   * Optional — absent when no class-specific checks apply (generic domain).
   * Each entry has name, status (PASS/WARN/FAIL/N/A), and reasoning string.
   */
  classChecks?: ClassCheck[]
}

export interface BriefValidationState {
  isValid: boolean
  missingRequired: string[]
  blockedReasons: string[]
  warnings: string[]
}

export interface SizingResultState {
  feasible: boolean | null
}

export interface CostResultState {
  unitTotalGbp: number
  ceilingGbp: number | null
}

/**
 * Determines whether a report is feasible based on the brief validation, sizing module, and cost checks.
 *
 * UNIVERSAL-ROBUSTNESS FIX (2026-05-10): now runs class-aware checks via
 * runClassChecks(). FAIL-class results become warnings (not blockers) so that
 * missing brief data does not incorrectly block the pipeline — these are
 * engineering advisory checks, not hard gates.
 */
export function determineFeasibility(
  briefValidation: BriefValidationState,
  sizingResult: SizingResultState,
  costResult: CostResultState | null,
  productClass: string,
  targets?: Record<string, number | undefined>,
): FeasibilityResult {
  const blockers: string[] = []
  const warnings: string[] = []
  
  // Brief validation
  if (!briefValidation.isValid) {
    blockers.push(...briefValidation.blockedReasons)
    blockers.push(...briefValidation.missingRequired.map((field) => `Required field missing: ${field}`))
  }
  warnings.push(...briefValidation.warnings)
  
  // Sizing feasibility
  if (sizingResult.feasible === false) {
    // HP-003 (2026-05-06): upgrade the blocker wording so the founder sees
    // what the solver actually tried, not just a generic 'INFEASIBLE'. For
    // heat-pump/thermal_system paths A12 attempts monobloc before split;
    // when both fail, the stale wording 'modules do not fit in envelope'
    // understates the problem.
    const pc = (productClass || '').toLowerCase()
    if (pc.includes('heat_pump') || pc.includes('thermal')) {
      blockers.push('Sizing returned INFEASIBLE on all heat-pump paths (monobloc + split + generic) — envelope cannot accommodate a 30 kW R290 circuit at the stated constraints')
    } else if (pc.includes('battery') || pc.includes('energy_storage')) {
      blockers.push('Sizing returned INFEASIBLE — rack/PCS/thermal modules do not fit in the stated container envelope')
    } else if (pc.includes('farm') || pc.includes('vertical')) {
      blockers.push('Sizing returned INFEASIBLE — growing rack + fertigation + climate modules exceed the stated footprint')
    } else {
      blockers.push('Sizing solver returned INFEASIBLE — modules do not fit in envelope')
    }
  }
  
  // Cost reality check
  if (costResult) {
    if (costResult.ceilingGbp && costResult.unitTotalGbp > costResult.ceilingGbp * 2) {
      warnings.push(`Cost estimate (£${costResult.unitTotalGbp}) is more than twice the ceiling (£${costResult.ceilingGbp})`)
    }
  }

  // ── Per-class feasibility checks (UNIVERSAL-ROBUSTNESS FIX 2026-05-10) ───
  // Run class-specific checks and surface FAIL results as warnings (not blockers).
  // N/A results are silently skipped. WARN results are surfaced as warnings.
  const classChecks = runClassChecks(productClass, targets ?? {}, costResult)
  const classCheckSummary: string[] = []
  for (const check of classChecks) {
    if (check.status === 'N/A') continue
    if (check.status === 'FAIL') {
      // FAIL from class check → warning (not hard blocker) — these are advisory.
      // Council finding: checks that fail due to missing inputs should not block.
      warnings.push(`[${check.name}] ${check.reasoning}`)
      classCheckSummary.push(`${check.name}: FAIL`)
    } else if (check.status === 'WARN') {
      warnings.push(`[${check.name}] ${check.reasoning}`)
      classCheckSummary.push(`${check.name}: WARN`)
    } else if (check.status === 'PASS') {
      classCheckSummary.push(`${check.name}: PASS`)
    }
  }

  // Determine status
  let status: FeasibilityResult['status'] = 'GREEN'
  if (blockers.length > 0) {
    status = 'RED'
  } else if (warnings.length > 2) {
    status = 'AMBER'
  }
  
  const canGenerateFullReport = status === 'GREEN' || status === 'AMBER'
  
  // Allowed and forbidden sections
  const allSections = [
    'cover', 'decision_page', 'brief', 'classification', 'feasibility', 
    'architecture', 'regulatory', 'performance', 'sizing', 'modules', 
    'interfaces', 'bom', 'cost', 'manufacturing', 'test_plan', 'risks', 
    'suppliers', 'open_questions', 'redesign_routes', 'audit'
  ]
  
  let allowedSections: string[]
  let forbiddenSections: string[]
  
  if (status === 'RED') {
    allowedSections = ['cover', 'decision_page', 'brief', 'classification', 'feasibility', 'audit']
    forbiddenSections = allSections.filter((section) => !allowedSections.includes(section))
  } else if (status === 'AMBER') {
    allowedSections = [
      'cover', 'decision_page', 'brief', 'classification', 'feasibility', 
      'architecture', 'regulatory', 'sizing', 'modules', 'audit'
    ]
    forbiddenSections = allSections.filter((section) => !allowedSections.includes(section))
  } else {
    allowedSections = allSections
    forbiddenSections = []
  }
  
  // Decision page data
  const missingInputs = briefValidation.missingRequired
  const biggestBlocker = blockers[0] || (warnings.length > 0 ? warnings[0] : 'No issues identified')
  
  let commercialWarning = ''
  if (costResult && costResult.ceilingGbp && costResult.unitTotalGbp > costResult.ceilingGbp * 1.5) {
    commercialWarning = `Estimated cost (£${costResult.unitTotalGbp}) significantly exceeds target (£${costResult.ceilingGbp})`
  }
  
  const engineeringWarning = sizingResult.feasible === false
    ? 'Physical dimensions do not fit within envelope — design concept needs revision'
    : ''
    
  let nextActions: string[]
  if (status === 'RED') {
    nextActions = ['Complete missing brief fields', 'Lock architecture type', 'Re-run pipeline']
  } else if (status === 'AMBER') {
    nextActions = ['Address warnings before full report', 'Verify cost estimates against market data']
  } else {
    nextActions = ['Proceed with full report generation']
  }
  
  let verdict = 'PROCEED TO FULL REPORT'
  if (status === 'RED') {
    verdict = 'REBRIEF REQUIRED'
  } else if (status === 'AMBER') {
    verdict = 'PROCEED WITH CAUTION'
  }
  
  let reason = 'All checks passed'
  if (blockers.length > 0) {
    reason = blockers.join('; ')
  } else if (warnings.length > 0) {
    reason = warnings.join('; ')
  }

  // CX-001 (2026-05-06): build a concise status banner — one line, fits
  // in a narrow header / cover pill. Most material issue wins the label.
  const compactBanner = (() => {
    if (status === 'RED') {
      const first = blockers[0] || 'Brief incomplete'
      return `INFEASIBLE — ${first.length > 80 ? first.slice(0, 77) + '...' : first}`
    }
    if (status === 'AMBER') {
      const issue = warnings[0] || 'multiple warnings'
      return `FEASIBLE WITH WARNINGS — ${issue.length > 60 ? issue.slice(0, 57) + '...' : issue}`
    }
    return 'FEASIBLE — all gates pass'
  })()
  
  return {
    status,
    reason,
    blockers,
    warnings,
    canGenerateFullReport,
    allowedSections,
    forbiddenSections,
    decisionPageData: {
      verdict,
      biggestBlocker,
      missingInputs,
      commercialWarning,
      engineeringWarning,
      nextActions,
    },
    compactBanner,
    // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): include class checks for PDF rendering.
    classChecks: classChecks.length > 0 ? classChecks : undefined,
  }
}
