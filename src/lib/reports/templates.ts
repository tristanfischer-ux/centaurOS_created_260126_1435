/**
 * @file templates.ts
 *
 * @description Pre-built report templates that define which sections are
 * included and in what order. Templates are the starting point for report
 * generation — users can customize by toggling sections on/off.
 *
 * @related
 * - src/lib/reports/report-document-types.ts — Type definitions
 * - src/app/(platform)/reports/page.tsx — Template selector UI
 */

import type { ReportTemplate, ReportSectionType } from './report-document-types'

// INTENT: Section metadata for the UI — labels, descriptions, and icons
// used in the section toggle checklist on the reports page.
export const SECTION_META: Record<ReportSectionType, { label: string; description: string; icon: string }> = {
  'cover': {
    label: 'Cover Page',
    description: 'Report title, company name, and date range',
    icon: 'FileText',
  },
  'executive-summary': {
    label: 'Executive Summary',
    description: 'High-level narrative of what happened this period',
    icon: 'AlignLeft',
  },
  'key-metrics': {
    label: 'Key Metrics',
    description: 'KPI cards with trends and comparisons',
    icon: 'TrendingUp',
  },
  'objectives-progress': {
    label: 'Objectives Progress',
    description: 'Active objectives with progress bars and health status',
    icon: 'Target',
  },
  'team-activity': {
    label: 'Team Activity',
    description: 'Who did what — top contributors and participation',
    icon: 'Users',
  },
  'blockers-risks': {
    label: 'Blockers & Risks',
    description: 'Reported blockers and at-risk objectives',
    icon: 'AlertTriangle',
  },
  'completion-trend': {
    label: 'Completion Trend',
    description: 'Daily task completion chart over the period',
    icon: 'BarChart3',
  },
  'week-ahead': {
    label: 'Week Ahead',
    description: 'Upcoming tasks and deadlines for next week',
    icon: 'CalendarDays',
  },
  'financial-snapshot': {
    label: 'Financial Snapshot',
    description: 'Revenue, expenses, net position, and budget health',
    icon: 'PoundSterling',
  },
  'sales-pipeline': {
    label: 'Sales Pipeline',
    description: 'Outreach campaigns, RFQs, and discovery call activity',
    icon: 'Megaphone',
  },
  'engineering-activity': {
    label: 'Engineering Activity',
    description: 'CAD Lab projects, module generation, and engineering throughput',
    icon: 'Cog',
  },
  'knowledge-learning': {
    label: 'Knowledge & Learning',
    description: 'Knowledge vault contributions and apprenticeship progress',
    icon: 'BookOpen',
  },
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'strategic-briefing',
    name: 'Strategic Briefing',
    description: 'A polished presentation deck generated from your source material — strategy, progress, vision. Presentation-ready slides.',
    icon: 'Presentation',
    defaultDateRange: 'this-month',
    defaultSections: [
      { type: 'cover', enabled: true, order: 0 },
    ],
  },
  {
    id: 'weekly-update',
    name: 'Weekly Update',
    description: 'A concise summary of the week — what was accomplished, what\'s at risk, and what\'s ahead. Perfect for team-wide sharing.',
    icon: 'CalendarDays',
    defaultDateRange: 'last-week',
    defaultSections: [
      { type: 'cover', enabled: true, order: 0 },
      { type: 'executive-summary', enabled: true, order: 1 },
      { type: 'key-metrics', enabled: true, order: 2 },
      { type: 'financial-snapshot', enabled: true, order: 3 },
      { type: 'completion-trend', enabled: true, order: 4 },
      { type: 'objectives-progress', enabled: true, order: 5 },
      { type: 'team-activity', enabled: true, order: 6 },
      { type: 'sales-pipeline', enabled: true, order: 7 },
      { type: 'blockers-risks', enabled: true, order: 8 },
      { type: 'week-ahead', enabled: true, order: 9 },
    ],
  },
  {
    id: 'board-pack',
    name: 'Board Pack',
    description: 'A comprehensive report for investors and advisors — strategy progress, team performance, and risks. Formal tone, data-forward.',
    icon: 'Briefcase',
    defaultDateRange: 'last-month',
    defaultSections: [
      { type: 'cover', enabled: true, order: 0 },
      { type: 'executive-summary', enabled: true, order: 1 },
      { type: 'key-metrics', enabled: true, order: 2 },
      { type: 'financial-snapshot', enabled: true, order: 3 },
      { type: 'sales-pipeline', enabled: true, order: 4 },
      { type: 'objectives-progress', enabled: true, order: 5 },
      { type: 'engineering-activity', enabled: true, order: 6 },
      { type: 'completion-trend', enabled: true, order: 7 },
      { type: 'team-activity', enabled: true, order: 8 },
      { type: 'knowledge-learning', enabled: true, order: 9 },
      { type: 'blockers-risks', enabled: true, order: 10 },
      { type: 'week-ahead', enabled: false, order: 11 },
    ],
  },
  {
    id: 'custom',
    name: 'Custom Report',
    description: 'Pick exactly the sections you need. Start from scratch and build your own report.',
    icon: 'Sliders',
    defaultDateRange: 'last-week',
    defaultSections: [
      { type: 'cover', enabled: true, order: 0 },
      { type: 'executive-summary', enabled: false, order: 1 },
      { type: 'key-metrics', enabled: false, order: 2 },
      { type: 'financial-snapshot', enabled: false, order: 3 },
      { type: 'sales-pipeline', enabled: false, order: 4 },
      { type: 'completion-trend', enabled: false, order: 5 },
      { type: 'objectives-progress', enabled: false, order: 6 },
      { type: 'engineering-activity', enabled: false, order: 7 },
      { type: 'team-activity', enabled: false, order: 8 },
      { type: 'knowledge-learning', enabled: false, order: 9 },
      { type: 'blockers-risks', enabled: false, order: 10 },
      { type: 'week-ahead', enabled: false, order: 11 },
    ],
  },
]

/**
 * Get a template by ID.
 *
 * @param id - Template identifier
 * @returns The template definition, or the weekly-update template as fallback
 */
export function getTemplate(id: string): ReportTemplate {
  return REPORT_TEMPLATES.find(t => t.id === id) ?? REPORT_TEMPLATES[0]
}

/**
 * Calculate date range from a preset label.
 *
 * @param preset - One of the standard date range presets
 * @returns Start and end date as ISO strings (YYYY-MM-DD)
 */
export function getDateRangeFromPreset(preset: ReportTemplate['defaultDateRange']): { start: string; end: string } {
  const now = new Date()

  switch (preset) {
    case 'this-week': {
      const dayOfWeek = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
      monday.setHours(0, 0, 0, 0)
      return {
        start: monday.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
      }
    }
    case 'last-week': {
      const dayOfWeek = now.getDay()
      const lastMonday = new Date(now)
      lastMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) - 7)
      lastMonday.setHours(0, 0, 0, 0)
      const lastSunday = new Date(lastMonday)
      lastSunday.setDate(lastMonday.getDate() + 6)
      return {
        start: lastMonday.toISOString().split('T')[0],
        end: lastSunday.toISOString().split('T')[0],
      }
    }
    case 'this-month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      return {
        start: firstDay.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
      }
    }
    case 'last-month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
      return {
        start: firstDay.toISOString().split('T')[0],
        end: lastDay.toISOString().split('T')[0],
      }
    }
  }
}
