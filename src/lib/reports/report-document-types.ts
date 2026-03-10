/**
 * @file report-document-types.ts
 *
 * @description Type definitions for the composable report generation system.
 * A ReportDocument is composed of ordered sections, each with its own data
 * shape and visual renderer. Templates are pre-configured section selections.
 *
 * @related
 * - src/lib/reports/templates.ts — Pre-built template definitions
 * - src/actions/report-generator.ts — Data collection server action
 * - src/components/reports/ReportDocument.tsx — Main renderer
 */

// ========================
// Section Types
// ========================

export type ReportSectionType =
  | 'cover'
  | 'executive-summary'
  | 'key-metrics'
  | 'objectives-progress'
  | 'team-activity'
  | 'blockers-risks'
  | 'completion-trend'
  | 'week-ahead'
  | 'financial-snapshot'
  | 'sales-pipeline'
  | 'engineering-activity'
  | 'knowledge-learning'
  | 'workshop-design'
  | 'workshop-specify'
  | 'workshop-source'
  | 'workshop-assemble'

export interface ReportSectionConfig {
  type: ReportSectionType
  enabled: boolean
  order: number
}

// ========================
// Section Data Shapes
// ========================

export interface CoverSectionData {
  companyName: string
  reportTitle: string
  subtitle: string
  dateRange: { start: string; end: string }
  generatedAt: string
  coverImageUrl?: string
}

export interface ExecutiveSummarySectionData {
  narrative: string
  highlights: string[]
}

export interface KPIMetric {
  label: string
  value: number
  previousValue: number
  format: 'number' | 'percentage' | 'decimal' | 'currency'
  trend: 'up' | 'down' | 'stable'
  changePercent: number
  sparklineData?: number[]
}

export interface KeyMetricsSectionData {
  metrics: KPIMetric[]
  sectionNarrative?: string
  chartImageUrl?: string
}

export interface ObjectiveRow {
  id: string
  title: string
  progress: number
  status: string
  health: 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
  tasksCompleted: number
  tasksRemaining: number
  endDate: string | null
  progressDelta?: number
}

export interface ObjectivesProgressSectionData {
  objectives: ObjectiveRow[]
  totalActive: number
  totalCompleted: number
  sectionNarrative?: string
  chartImageUrl?: string
}

export interface TeamMemberRow {
  id: string
  name: string
  role: string | null
  tasksCompleted: number
  avatarUrl?: string | null
}

export interface TeamActivitySectionData {
  members: TeamMemberRow[]
  totalTeamCompleted: number
  standupParticipationRate: number | null
  sectionNarrative?: string
}

export interface BlockerRow {
  id: string
  reporterName: string
  reporterRole: string | null
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical' | null
  needsHelp: boolean
  reportedDate?: string
  ageInDays?: number
}

export interface AtRiskObjective {
  id: string
  title: string
  progress: number
  daysRemaining: number
}

export interface BlockersRisksSectionData {
  blockers: BlockerRow[]
  atRiskObjectives: AtRiskObjective[]
  sectionNarrative?: string
}

export interface DailyDataPoint {
  date: string
  completed: number
  created: number
}

export interface CompletionTrendSectionData {
  dataPoints: DailyDataPoint[]
  periodLabel: string
  sectionNarrative?: string
  chartImageUrl?: string
}

export interface UpcomingTask {
  id: string
  title: string
  assigneeName: string | null
  dueDate: string
  priority: string | null
  objectiveTitle: string | null
}

export interface WeekAheadSectionData {
  tasks: UpcomingTask[]
  totalDueNextWeek: number
  sectionNarrative?: string
}

// ========================
// Financial Snapshot
// ========================

export interface BudgetHealthRow {
  category: string
  budgeted: number
  actual: number
  variance: number
  variancePercent: number
}

export interface FinancialSnapshotSectionData {
  periodRevenue: number
  previousPeriodRevenue: number
  periodExpenses: number
  previousPeriodExpenses: number
  netPosition: number
  previousNetPosition: number
  activeOrderCount: number
  activeOrdersByStatus: { status: string; count: number }[]
  budgetHealth: BudgetHealthRow[]
  overBudgetCount: number
  sectionNarrative?: string
  chartImageUrl?: string
  trendData?: { date: string; revenue: number; expenses: number }[]
}

// ========================
// Sales Pipeline
// ========================

export interface SalesPipelineSectionData {
  outreach: {
    activeCampaigns: number
    contactsReached: number
    emailsSent: number
    repliesReceived: number
    replyRate: number
    topCampaignName: string | null
  }
  rfqs: {
    openCount: number
    sentThisPeriod: number
    responsesReceived: number
    awarded: number
    pipelineValue: number
  }
  discoveryCalls: {
    scheduled: number
    completed: number
    conversions: number
    noShows: number
  }
  sectionNarrative?: string
  chartImageUrl?: string
  funnelStages?: { name: string; value: number }[]
}

// ========================
// Engineering Activity
// ========================

export interface RecentProject {
  id: string
  name: string
  stage: string
  status: string
  createdAt: string
}

export interface ReviewSummary {
  totalReviewed: number
  totalProjects: number
  verdicts: { approved: number; conditional: number; rejected: number; pending: number }
  topIssues: string[]
}

export interface CostSummary {
  totalEstimatedCost: number
  averageCostPerUnit: number
  averageConfidence: number
  projectsWithEstimates: number
  buyVsMake: { buy: number; make: number }
}

export interface ManufacturingFunnel {
  designed: number
  reviewed: number
  costed: number
  ordered: number
}

export interface DesignHealth {
  averageRevisions: number
  projectsWithStaleImages: number
  totalModulesAcrossProjects: number
}

export interface EngineeringActivitySectionData {
  totalActive: number
  createdThisPeriod: number
  completedThisPeriod: number
  byStage: { stage: string; count: number }[]
  byStatus: { status: string; count: number }[]
  totalModulesGenerated: number
  recentProjects: RecentProject[]
  sectionNarrative?: string
  chartImageUrl?: string
  reviewSummary?: ReviewSummary
  costSummary?: CostSummary
  manufacturingFunnel?: ManufacturingFunnel
  designHealth?: DesignHealth
  processBreakdown?: { process: string; count: number }[]
  materialBreakdown?: { material: string; count: number }[]
}

// ========================
// Knowledge & Learning
// ========================

export interface KnowledgeLearningSectionData {
  knowledge: {
    totalNotes: number
    addedThisPeriod: number
    topDomains: { name: string; count: number }[]
    byType: { type: string; count: number }[]
    verifiedCount: number
  }
  apprenticeships: {
    activeEnrollments: number
    modulesCompleted: number
    otjtHoursLogged: number
    reviewsDue: number
    averageProgress: number
  }
  sectionNarrative?: string
}

// ========================
// Workshop: Design
// ========================

export interface WorkshopDesignProject {
  id: string
  name: string
  stage: string
  status: string
  moduleCount: number
  createdAt: string
}

export interface GenerationMetricsSummary {
  totalGenerations: number
  successRate: number
  averageTimeMs: number
  topModels: { model: string; count: number }[]
}

export interface WorkshopDesignSectionData {
  totalProjects: number
  activeProjects: number
  projects: WorkshopDesignProject[]
  generationMetrics?: GenerationMetricsSummary
  sectionNarrative?: string
}

// ========================
// Workshop: Specify
// ========================

export interface SpecifyReviewHealth {
  pass: number
  warn: number
  fail: number
  pending: number
  skipped: number
}

export interface SpecifyCostOverview {
  totalEstimatedCost: number
  projectsCosted: number
  averageConfidence: number
}

export interface SpecifyDiagnosticRow {
  question: string
  topAnswers: { answer: string; count: number }[]
}

export interface WorkshopSpecifySectionData {
  reviewHealth: SpecifyReviewHealth
  costOverview?: SpecifyCostOverview
  processBreakdown: { process: string; count: number }[]
  materialBreakdown: { material: string; count: number }[]
  diagnosticTable: SpecifyDiagnosticRow[]
  sectionNarrative?: string
}

// ========================
// Workshop: Source
// ========================

export interface RFQPipelineSummary {
  total: number
  open: number
  bidding: number
  awarded: number
  closed: number
}

export interface RFQResponseStats {
  totalResponses: number
  averagePerRFQ: number
}

export interface SourceOrderSummary {
  total: number
  byStatus: { status: string; count: number }[]
  totalEstimatedValue: number
}

export interface WorkshopSourceSectionData {
  rfqPipeline: RFQPipelineSummary
  rfqResponseStats: RFQResponseStats
  orderSummary: SourceOrderSummary
  sectionNarrative?: string
}

// ========================
// Workshop: Assemble
// ========================

export interface AssemblyOrder {
  id: string
  orderNumber: string
  title: string
  status: string
  projectName: string | null
  requiredBy: string | null
  estimatedCost: number | null
}

export interface AssemblyStatusCounts {
  inProduction: number
  assembling: number
  shipping: number
  delivered: number
  atRisk: number
}

export interface WorkshopAssembleSectionData {
  orders: AssemblyOrder[]
  statusCounts: AssemblyStatusCounts
  totalOrders: number
  sectionNarrative?: string
}

export type SectionData =
  | { type: 'cover'; data: CoverSectionData }
  | { type: 'executive-summary'; data: ExecutiveSummarySectionData }
  | { type: 'key-metrics'; data: KeyMetricsSectionData }
  | { type: 'objectives-progress'; data: ObjectivesProgressSectionData }
  | { type: 'team-activity'; data: TeamActivitySectionData }
  | { type: 'blockers-risks'; data: BlockersRisksSectionData }
  | { type: 'completion-trend'; data: CompletionTrendSectionData }
  | { type: 'week-ahead'; data: WeekAheadSectionData }
  | { type: 'financial-snapshot'; data: FinancialSnapshotSectionData }
  | { type: 'sales-pipeline'; data: SalesPipelineSectionData }
  | { type: 'engineering-activity'; data: EngineeringActivitySectionData }
  | { type: 'knowledge-learning'; data: KnowledgeLearningSectionData }
  | { type: 'workshop-design'; data: WorkshopDesignSectionData }
  | { type: 'workshop-specify'; data: WorkshopSpecifySectionData }
  | { type: 'workshop-source'; data: WorkshopSourceSectionData }
  | { type: 'workshop-assemble'; data: WorkshopAssembleSectionData }

// ========================
// Report Document
// ========================

export interface ReportBranding {
  logoUrl?: string | null
  primaryColor?: string | null
  accentColor?: string | null
}

export interface ReportDocument {
  id: string
  templateId: string
  title: string
  dateRange: { start: string; end: string }
  generatedAt: string
  foundryId: string
  foundryName: string
  sections: SectionData[]
  branding?: ReportBranding
}

// ========================
// Template Types
// ========================

export type ReportTemplateId = 'weekly-update' | 'board-pack' | 'custom' | 'strategic-briefing' | 'skill-document' | 'workshop-report'

export interface ReportTemplate {
  id: ReportTemplateId
  name: string
  description: string
  icon: string
  defaultSections: ReportSectionConfig[]
  defaultDateRange: 'this-week' | 'last-week' | 'this-month' | 'last-month'
}

// ========================
// Generation Request/Response
// ========================

export type ReportTone = 'internal' | 'board' | 'investor'
export type ReportDetailLevel = 'brief' | 'standard' | 'detailed'

export interface GenerateReportRequest {
  templateId: ReportTemplateId
  sections: ReportSectionType[]
  dateRange: { start: string; end: string }
  tone?: ReportTone
  detailLevel?: ReportDetailLevel
}

export interface GenerateReportResponse {
  success: boolean
  document?: ReportDocument
  error?: string
}
