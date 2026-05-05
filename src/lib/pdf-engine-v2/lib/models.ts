// Source grades
export type SourceGrade = 'A' | 'B' | 'C' | 'D' | 'E'

// BOM
export interface BOMLine {
  lineNo: number
  partNumber: string
  description: string
  module: string
  quantity: number
  unitCostGBP: number
  extendedCostGBP: number  // qty * unitCost
  makeOrBuy: 'Make' | 'Buy'
  supplier: string
  supplierGrade: SourceGrade
  leadTimeWeeks: number | null
  sourceUrl: string | null
}

// FMEA
export interface FMEARisk {
  riskId: string
  moduleId: string
  failureMode: string
  cause: string
  localEffect: string
  systemEffect: string
  severity: number  // 1-10
  occurrence: number  // 1-10
  detection: number  // 1-10
  rpn: number  // severity * occurrence * detection
  existingControls: string
  plannedMitigation: string
  verificationTest: string
  owner: string
  sourceGrade: SourceGrade
}

// Regulatory
export interface RegulatoryStandard {
  standardId: string
  name: string
  version: string
  jurisdiction: string
  owner: string
  status: 'not_started' | 'in_progress' | 'complete'
  applicability: string
  engineeringImpact: string
  evidenceRequired: string[]
  gapAction: string
  gapCostGBP: number
  gapTimelineWeeks: number
  sourceGrade: SourceGrade
}

// Cost Waterfall
export interface CostWaterfall {
  bomTotal: number
  labour: number
  testing: number
  shipping: number
  overheads: number
  contingencyPct: number
  contingencyAmount: number
  unitCost: number
  nreItems: NREItem[]
  nreTotal: number
  ceilingGBP: number
  headroomGBP: number
  headroomPct: number
}

export interface NREItem {
  item: string
  costGBP: number
  timelineWeeks: number
  owner: string
}

// Feasibility
export interface FeasibilityCheck {
  checkName: string
  status: 'PASS' | 'FAIL' | 'WARN'
  reason: string
  evidence: string
}

// Module
export interface Module {
  id: string
  name: string
  purpose: string
  whyItMatters: string
  technicalDescription: string
  keySpecs: Record<string, string>
  bomLines: BOMLine[]
  maturity: 'concept' | 'prototype' | 'production'
  sourceGrade: SourceGrade
  risks: string[]
}

// Zone allocation
export interface ZoneAllocation {
  zoneId: string
  name: string
  modules: string[]
  lengthMM: number
  widthMM: number
  heightMM: number
  volumeM3: number
  massKg: number
}

// Full report
export interface EngineeringReport {
  projectId: string
  feasibility: FeasibilityCheck[]
  brief: { narrative: string; constraints: Record<string, string>; sources: Array<{ title: string; grade: SourceGrade; relevance: string }> }
  regulatory: RegulatoryStandard[]
  sizing: { zones: ZoneAllocation[]; feasible: boolean; volumeUtilisation: number }
  modules: Module[]
  cost: CostWaterfall
  fmea: FMEARisk[]
  auditLog: Array<{ step: string; status: string; duration: number; source: string }>
  sourceAttribution: Array<{ section: string; grade: SourceGrade; source: string }>
}
