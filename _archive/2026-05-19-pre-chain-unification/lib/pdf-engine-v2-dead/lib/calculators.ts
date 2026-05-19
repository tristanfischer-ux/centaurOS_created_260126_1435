import { BOMLine, CostWaterfall, NREItem, FMEARisk, ZoneAllocation, EngineeringReport, FeasibilityCheck } from './models'

// BOM rollup
export function computeBomSummary(lines: BOMLine[]): {
  total: number
  byModule: Record<string, number>
  supplierCoverage: number
  lineCount: number
  supplierCount: number
} {
  const total = lines.reduce((sum, line) => sum + line.extendedCostGBP, 0)
  
  const byModule: Record<string, number> = {}
  for (const line of lines) {
    byModule[line.module] = (byModule[line.module] || 0) + line.extendedCostGBP
  }
  
  const uniqueSuppliers = new Set(lines.map(l => l.supplier).filter(Boolean))
  const linesWithSuppliers = lines.filter(l => Boolean(l.supplier)).length
  
  return {
    total,
    byModule,
    supplierCoverage: lines.length > 0 ? linesWithSuppliers / lines.length : 0,
    lineCount: lines.length,
    supplierCount: uniqueSuppliers.size,
  }
}

// Cost waterfall
export function computeCostWaterfall(params: {
  bomTotal: number
  labourHours: number
  labourRateGBP: number
  testingCost: number
  shippingCost: number
  overheadPct: number
  contingencyPct: number
  nreItems: NREItem[]
  ceilingGBP: number
}): CostWaterfall {
  const labour = params.labourHours * params.labourRateGBP
  const testing = params.testingCost
  const shipping = params.shippingCost
  
  const subtotal = params.bomTotal + labour + testing + shipping
  const overheads = subtotal * (params.overheadPct / 100)
  
  const totalBeforeContingency = subtotal + overheads
  const contingencyAmount = totalBeforeContingency * (params.contingencyPct / 100)
  
  const unitCost = totalBeforeContingency + contingencyAmount
  
  const nreTotal = params.nreItems.reduce((sum, item) => sum + item.costGBP, 0)
  
  const headroomGBP = params.ceilingGBP - unitCost
  const headroomPct = params.ceilingGBP > 0 ? (headroomGBP / params.ceilingGBP) * 100 : 0

  return {
    bomTotal: params.bomTotal,
    labour,
    testing,
    shipping,
    overheads,
    contingencyPct: params.contingencyPct,
    contingencyAmount,
    unitCost,
    nreItems: params.nreItems,
    nreTotal,
    ceilingGBP: params.ceilingGBP,
    headroomGBP,
    headroomPct,
  }
}

// FMEA RPN
export function computeRPN(severity: number, occurrence: number, detection: number): { rpn: number; critical: boolean } {
  const rpn = severity * occurrence * detection
  // Usually FMEA treats RPN > 100 or Severity >= 9 as critical risks
  const critical = rpn >= 100 || severity >= 9
  
  return { rpn, critical }
}

// Zone volumes
export function computeZoneVolumes(zones: ZoneAllocation[]): { totalVolume: number; totalMass: number } {
  const totalVolume = zones.reduce((sum, zone) => sum + zone.volumeM3, 0)
  const totalMass = zones.reduce((sum, zone) => sum + zone.massKg, 0)
  
  return { totalVolume, totalMass }
}

// Feasibility gate (7 checks)
export function computeFeasibilityGate(report: Partial<EngineeringReport>): FeasibilityCheck[] {
  const checks: FeasibilityCheck[] = []

  // 1. Cost check
  if (report.cost && report.cost.ceilingGBP > 0) {
    if (report.cost.unitCost <= report.cost.ceilingGBP) {
      checks.push({
        checkName: 'Unit Cost',
        status: 'PASS',
        reason: 'Unit cost is under target ceiling.',
        evidence: `£${report.cost.unitCost.toFixed(2)} <= £${report.cost.ceilingGBP.toFixed(2)}`,
      })
    } else {
      checks.push({
        checkName: 'Unit Cost',
        status: 'FAIL',
        reason: 'Unit cost exceeds target ceiling.',
        evidence: `£${report.cost.unitCost.toFixed(2)} > £${report.cost.ceilingGBP.toFixed(2)}`,
      })
    }
  }

  // 2. Spatial sizing check
  if (report.sizing) {
    if (report.sizing.feasible && report.sizing.volumeUtilisation <= 1.0) {
      checks.push({
        checkName: 'Spatial Sizing',
        status: 'PASS',
        reason: 'Components fit within physical envelope constraints.',
        evidence: `${(report.sizing.volumeUtilisation * 100).toFixed(1)}% volume utilisation`,
      })
    } else {
      checks.push({
        checkName: 'Spatial Sizing',
        status: 'FAIL',
        reason: 'Components exceed available physical volume.',
        evidence: `Feasible: ${report.sizing.feasible}, Utilisation: ${(report.sizing.volumeUtilisation * 100).toFixed(1)}%`,
      })
    }
  }

  // 3. FMEA Critical Risks check
  if (report.fmea) {
    const criticalCount = report.fmea.filter(risk => computeRPN(risk.severity, risk.occurrence, risk.detection).critical).length
    if (criticalCount === 0) {
      checks.push({
        checkName: 'Risk Profile',
        status: 'PASS',
        reason: 'No critical unmitigated risks found.',
        evidence: '0 items with RPN >= 100 or Severity >= 9',
      })
    } else {
      checks.push({
        checkName: 'Risk Profile',
        status: 'WARN',
        reason: 'Critical risks identified needing mitigation.',
        evidence: `${criticalCount} critical risks found`,
      })
    }
  }

  // 4. Regulatory compliance check
  if (report.regulatory) {
    const gaps = report.regulatory.filter(r => r.status === 'not_started').length
    if (gaps === 0) {
      checks.push({
        checkName: 'Regulatory Standards',
        status: 'PASS',
        reason: 'All applicable regulatory standards are addressed.',
        evidence: '0 standards in not_started status',
      })
    } else {
      checks.push({
        checkName: 'Regulatory Standards',
        status: 'WARN',
        reason: 'Action required on pending regulatory requirements.',
        evidence: `${gaps} standards not started`,
      })
    }
  }

  // 5. BOM completeness check
  if (report.modules) {
    const allLines = report.modules.flatMap(m => m.bomLines)
    const summary = computeBomSummary(allLines)
    
    if (summary.supplierCoverage > 0.8) {
      checks.push({
        checkName: 'Supply Chain',
        status: 'PASS',
        reason: 'Strong supplier coverage on BOM.',
        evidence: `${(summary.supplierCoverage * 100).toFixed(1)}% supplier identification`,
      })
    } else {
      checks.push({
        checkName: 'Supply Chain',
        status: 'WARN',
        reason: 'Poor supplier identification limits reliability.',
        evidence: `${(summary.supplierCoverage * 100).toFixed(1)}% supplier identification`,
      })
    }
  }

  // 6. Sourcing maturity check
  if (report.sourceAttribution) {
    const lowQualityCount = report.sourceAttribution.filter(s => s.grade === 'D' || s.grade === 'E').length
    if (lowQualityCount === 0) {
      checks.push({
        checkName: 'Data Fidelity',
        status: 'PASS',
        reason: 'Report is grounded in high-grade data sources.',
        evidence: '0 low-grade (D/E) sources used',
      })
    } else {
      checks.push({
        checkName: 'Data Fidelity',
        status: 'WARN',
        reason: 'Report relies on some low-confidence or assumed sources.',
        evidence: `${lowQualityCount} low-grade sources identified`,
      })
    }
  }

  // 7. Timeline / Lead Time check
  if (report.cost && report.modules) {
    const allLines = report.modules.flatMap(m => m.bomLines)
    const maxBomLeadTime = Math.max(...allLines.map(l => l.leadTimeWeeks || 0), 0)
    const maxNreLeadTime = Math.max(...report.cost.nreItems.map(n => n.timelineWeeks || 0), 0)
    const longestPath = Math.max(maxBomLeadTime, maxNreLeadTime)
    
    if (longestPath <= 52) {
      checks.push({
        checkName: 'Schedule Realism',
        status: 'PASS',
        reason: 'Critical path lead times are within one year.',
        evidence: `Longest lead item is ${longestPath} weeks`,
      })
    } else {
      checks.push({
        checkName: 'Schedule Realism',
        status: 'WARN',
        reason: 'Extended critical path lead time.',
        evidence: `Longest lead item is ${longestPath} weeks (> 1 year)`,
      })
    }
  }

  return checks
}
