import type { BriefModel, BriefRequirement, ProvenanceRef } from '../schema/types'

const briefRef: ProvenanceRef = { kind: 'brief', ref: 'input.brief' }

export interface ParsedBrief {
  brief: BriefModel
  numericFacts: Record<string, number>
}

export function parseBrief(briefText: string): ParsedBrief {
  const productName = inferProductName(briefText)
  const requirements: BriefRequirement[] = []
  const numericFacts: Record<string, number> = {}

  const mwh = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*MWh/i)
  if (mwh !== null) {
    numericFacts.capacity_mwh = mwh
    requirements.push({ id: 'capacity_mwh', label: 'Energy capacity', value: mwh, unit: 'MWh', source: briefRef })
  }

  const mw = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*MW(?!h)/i)
  if (mw !== null) {
    numericFacts.power_mw = mw
    requirements.push({ id: 'power_mw', label: 'Power rating', value: mw, unit: 'MW', source: briefRef })
  }

  const kg = firstNumber(briefText, /(\d[\d,]*(?:\.\d+)?)\s*(?:kg|kilogram)/i)
  if (kg !== null) {
    numericFacts.mass_kg = kg
    requirements.push({ id: 'mass_kg', label: 'Mass constraint', value: kg, unit: 'kg', source: briefRef })
  }

  const tonnes = firstNumber(briefText, /(\d[\d,]*(?:\.\d+)?)\s*(?:tonne|tonnes|metric tons?|t)\b/i)
  if (kg === null && tonnes !== null) {
    const massKg = tonnes * 1000
    numericFacts.mass_kg = massKg
    requirements.push({ id: 'mass_kg', label: 'Mass constraint', value: massKg, unit: 'kg', source: briefRef })
  }

  const envelope = briefText.match(/(\d+(?:\.\d+)?)\s*m\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*m/i)
  if (envelope) {
    const lengthM = Number(envelope[1])
    const widthM = Number(envelope[2])
    if (Number.isFinite(lengthM) && Number.isFinite(widthM)) {
      numericFacts.envelope_length_m = lengthM
      numericFacts.envelope_width_m = widthM
      numericFacts.footprint_m2 = Math.round(lengthM * widthM * 100) / 100
      requirements.push({ id: 'envelope_length_m', label: 'Envelope length', value: lengthM, unit: 'm', source: briefRef })
      requirements.push({ id: 'envelope_width_m', label: 'Envelope width', value: widthM, unit: 'm', source: briefRef })
      requirements.push({ id: 'footprint_m2', label: 'Footprint', value: numericFacts.footprint_m2, unit: 'm2', source: { kind: 'formula', ref: 'length_m * width_m' } })
    }
  }

  const wearDays = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*(?:day|days)\s*(?:wear|sensor\s*wear|patch\s*wear|lifetime)/i)
    ?? firstNumber(briefText, /(?:wear|sensor\s*wear|patch\s*wear|lifetime)[^\d]{0,30}(\d+(?:\.\d+)?)\s*(?:day|days)/i)
  if (wearDays !== null) {
    numericFacts.wear_days = wearDays
    requirements.push({ id: 'wear_days', label: 'Wear duration', value: wearDays, unit: 'days', source: briefRef })
  }

  const readingIntervalMinutes = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*(?:min|minute|minutes)\s*(?:reading|readings|sample|samples|sampling|interval)/i)
    ?? firstNumber(briefText, /(?:reading|readings|sample|samples|sampling|interval)[^\d]{0,30}(\d+(?:\.\d+)?)\s*(?:min|minute|minutes)/i)
  if (readingIntervalMinutes !== null) {
    numericFacts.reading_interval_minutes = readingIntervalMinutes
    requirements.push({ id: 'reading_interval_minutes', label: 'Reading interval', value: readingIntervalMinutes, unit: 'minutes', source: briefRef })
  }

  const mardPercent = firstNumber(briefText, /MARD\s*(?:<=|<|of|target|=|:)?\s*(\d+(?:\.\d+)?)\s*%/i)
    ?? firstNumber(briefText, /(\d+(?:\.\d+)?)\s*%\s*MARD/i)
  if (mardPercent !== null) {
    numericFacts.mard_percent = mardPercent
    requirements.push({ id: 'mard_percent', label: 'MARD target', value: mardPercent, unit: '%', source: briefRef })
  }

  const wingspanM = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*m\s*(?:wingspan|wing\s*span|span)/i)
    ?? firstNumber(briefText, /(?:wingspan|wing\s*span|span)[^\d]{0,30}(\d+(?:\.\d+)?)\s*m/i)
  if (wingspanM !== null) {
    numericFacts.wingspan_m = wingspanM
    requirements.push({ id: 'wingspan_m', label: 'Wingspan', value: wingspanM, unit: 'm', source: briefRef })
  }

  const minutes = readingIntervalMinutes === null ? firstNumber(briefText, /(\d+(?:\.\d+)?)\s*(?:min|minutes)/i) : null
  if (minutes !== null) {
    numericFacts.duration_minutes = minutes
    requirements.push({ id: 'duration_minutes', label: 'Duration', value: minutes, unit: 'minutes', source: briefRef })
  }

  const enduranceDays = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*(?:day|days)\s*(?:endurance|mission|station[-\s]*keeping|station keeping)/i)
    ?? firstNumber(briefText, /(?:endurance|mission|station[-\s]*keeping|station keeping)[^\d]{0,30}(\d+(?:\.\d+)?)\s*(?:day|days)/i)
  if (enduranceDays !== null) {
    numericFacts.endurance_days = enduranceDays
    requirements.push({ id: 'endurance_days', label: 'Endurance', value: enduranceDays, unit: 'days', source: briefRef })
  }

  const enduranceHours = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(?:survey\s*)?(?:endurance|mission|runtime|run\s*time)?/i)
    ?? firstNumber(briefText, /(?:endurance|mission|runtime|run\s*time)[^\d]{0,30}(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/i)
  if (enduranceHours !== null) {
    numericFacts.endurance_hours = enduranceHours
    requirements.push({ id: 'endurance_hours', label: 'Endurance', value: enduranceHours, unit: 'hours', source: briefRef })
  }

  const depthRatingM = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*m\s*(?:depth[-\s]*rated|depth rated|rated|operating depth|depth|water depth)/i)
    ?? firstNumber(briefText, /(?:depth[-\s]*rated|depth rated|rated to|operating depth|water depth)[^\d]{0,30}(\d+(?:\.\d+)?)\s*m/i)
  if (depthRatingM !== null) {
    numericFacts.depth_rating_m = depthRatingM
    requirements.push({ id: 'depth_rating_m', label: 'Depth rating', value: depthRatingM, unit: 'm', source: briefRef })
  }

  const altitudeKm = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*km\s*(?:altitude|stratospheric|operating altitude)/i)
    ?? firstNumber(briefText, /(?:altitude|operating altitude|stratospheric)[^\d]{0,30}(\d+(?:\.\d+)?)\s*km/i)
  if (altitudeKm !== null) {
    numericFacts.altitude_km = altitudeKm
    requirements.push({ id: 'altitude_km', label: 'Operating altitude', value: altitudeKm, unit: 'km', source: briefRef })
  }

  const computeTops = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*TOPS/i)
    ?? firstNumber(briefText, /(?:inference|accelerator|compute)[^\d]{0,30}(\d+(?:\.\d+)?)\s*TOPS/i)
  if (computeTops !== null) {
    numericFacts.compute_tops = computeTops
    requirements.push({ id: 'compute_tops', label: 'Inference throughput', value: computeTops, unit: 'TOPS', source: briefRef })
  }

  const rackUnits = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*U\s*(?:rack|enclosure|chassis|server|appliance)?/i)
  if (rackUnits !== null) {
    numericFacts.rack_units = rackUnits
    requirements.push({ id: 'rack_units', label: 'Rack height', value: rackUnits, unit: 'U', source: briefRef })
  }

  const powerBudgetW = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*W\s*(?:power|budget|input|TDP|thermal)?/i)
    ?? firstNumber(briefText, /(?:power|budget|input|TDP|thermal)[^\d]{0,30}(\d+(?:\.\d+)?)\s*W/i)
  if (powerBudgetW !== null) {
    numericFacts.power_budget_w = powerBudgetW
    requirements.push({ id: 'power_budget_w', label: 'Power budget', value: powerBudgetW, unit: 'W', source: briefRef })
  }

  const dcPowerKw = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*kW\s*(?:DC|dc|charger|charging|fast|output)/i)
    ?? firstNumber(briefText, /(?:DC|dc|charging|charger|fast|output)[^\d]{0,24}(\d+(?:\.\d+)?)\s*kW/i)
  if (dcPowerKw !== null) {
    numericFacts.dc_power_kw = dcPowerKw
    requirements.push({ id: 'dc_power_kw', label: 'DC output power', value: dcPowerKw, unit: 'kW', source: briefRef })
  }

  const thermalKw = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*kW\s*(?:thermal|heat|heating|output|capacity)/i)
    ?? firstNumber(briefText, /(?:thermal|heat|heating|output|capacity)[^\d]{0,20}(\d+(?:\.\d+)?)\s*kW/i)
  if (thermalKw !== null) {
    numericFacts.thermal_output_kw = thermalKw
    requirements.push({ id: 'thermal_output_kw', label: 'Thermal output', value: thermalKw, unit: 'kW', source: briefRef })
  }

  const cop = firstNumber(briefText, /COP\s*(?:of|target|=|:)?\s*(\d+(?:\.\d+)?)/i)
  if (cop !== null) {
    numericFacts.cop = cop
    requirements.push({ id: 'cop', label: 'Coefficient of performance', value: cop, unit: 'COP', source: briefRef })
  }

  const workingVolumeL = firstNumber(briefText, /(\d+(?:\.\d+)?)\s*(?:L|litre|liter)s?\s*(?:single-use\s*)?(?:mammalian-cell\s*)?bioreactor/i)
    ?? firstNumber(briefText, /bioreactor[^\d]{0,40}(\d+(?:\.\d+)?)\s*(?:L|litre|liter)s?/i)
  if (workingVolumeL !== null) {
    numericFacts.working_volume_l = workingVolumeL
    requirements.push({ id: 'working_volume_l', label: 'Working volume', value: workingVolumeL, unit: 'L', source: briefRef })
  }

  const assumptions = requirements.length === 0
    ? ['No quantified requirements were extracted; compiler used class-pack defaults.']
    : ['Extracted quantified requirements directly from the brief where possible.']

  return {
    brief: { originalText: briefText, productName, requirements, assumptions },
    numericFacts,
  }
}

function inferProductName(text: string): string {
  const firstLine = text.split(/\r?\n/).map(line => line.trim()).find(Boolean)
  if (firstLine && firstLine.length <= 90) return firstLine.replace(/^#+\s*/, '')
  const sentence = text.split(/[.!?]/)[0]?.trim()
  return sentence && sentence.length <= 90 ? sentence : 'Untitled hardware project'
}

function firstNumber(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern)
  if (!match) return null
  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}
