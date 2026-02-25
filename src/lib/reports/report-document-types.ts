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

export interface EngineeringActivitySectionData {
  totalActive: number
  createdThisPeriod: number
  completedThisPeriod: number
  byStage: { stage: string; count: number }[]
  byStatus: { status: string; count: number }[]
  totalModulesGenerated: number
  recentProjects: RecentProject[]
  sectionNarrative?: string
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

export type ReportTemplateId = 'weekly-update' | 'board-pack' | 'custom' | 'strategic-briefing'

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
