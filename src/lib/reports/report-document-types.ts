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
  format: 'number' | 'percentage' | 'decimal'
  trend: 'up' | 'down' | 'stable'
  changePercent: number
  sparklineData?: number[]
}

export interface KeyMetricsSectionData {
  metrics: KPIMetric[]
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
}

export interface ObjectivesProgressSectionData {
  objectives: ObjectiveRow[]
  totalActive: number
  totalCompleted: number
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
}

export interface BlockerRow {
  id: string
  reporterName: string
  reporterRole: string | null
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical' | null
  needsHelp: boolean
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
}

export interface DailyDataPoint {
  date: string
  completed: number
  created: number
}

export interface CompletionTrendSectionData {
  dataPoints: DailyDataPoint[]
  periodLabel: string
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

export type ReportTemplateId = 'weekly-update' | 'board-pack' | 'custom'

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
