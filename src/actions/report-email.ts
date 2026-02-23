'use server'

/**
 * @file report-email.ts
 *
 * @description Server action that sends a beautifully formatted report email
 * via Resend. Composes custom HTML from a ReportDocument's sections — cover,
 * executive summary, and KPI metrics — into a professional email layout.
 *
 * INTENT: Let users share generated reports with stakeholders via email
 * without leaving the platform. The email is self-contained (inline styles,
 * no external CSS) so it renders in every major email client.
 *
 * @security Requires authenticated user. Email addresses validated server-side.
 *
 * @related
 * - src/lib/reports/report-document-types.ts — ReportDocument shape
 * - src/actions/report-generator.ts — Generates the document we email
 * - src/lib/notifications/channels/email.ts — Underlying Resend infrastructure
 */

import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { escapeHtml } from '@/lib/security/sanitize'

import type {
  ReportDocument,
  CoverSectionData,
  ExecutiveSummarySectionData,
  KeyMetricsSectionData,
  KPIMetric,
  ObjectivesProgressSectionData,
  BlockersRisksSectionData,
  TeamActivitySectionData,
} from '@/lib/reports/report-document-types'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS || 'ForgeOS <noreply@fractionalforge.app>'

interface SendReportEmailResult {
  success: boolean
  sentCount?: number
  error?: string
}

/**
 * Send a beautifully formatted report email to one or more recipients.
 *
 * @param recipients - Email addresses to deliver to
 * @param document - The generated ReportDocument with section data
 * @param shareUrl - Optional link to the web-hosted version of the report
 * @returns Delivery result with count of successful sends
 */
export async function sendReportEmail(
  recipients: string[],
  document: ReportDocument,
  shareUrl?: string
): Promise<SendReportEmailResult> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // VALIDATION: Recipients
  if (!recipients.length) {
    return { success: false, error: 'At least one recipient is required' }
  }

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const invalidEmails = recipients.filter((e) => !EMAIL_REGEX.test(e))
  if (invalidEmails.length > 0) {
    return {
      success: false,
      error: `Invalid email addresses: ${invalidEmails.join(', ')}`,
    }
  }

  const subject = composeSubject(document)
  const html = composeEmailHtml(document, shareUrl)

  if (!resend) {
    console.info('[ReportEmail] No RESEND_API_KEY configured. Would send:', {
      to: recipients,
      subject,
    })
    return { success: true, sentCount: recipients.length }
  }

  let sentCount = 0
  const errors: string[] = []

  for (const recipient of recipients) {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [recipient],
      subject,
      html,
    })

    if (error) {
      errors.push(`${recipient}: ${error.message}`)
    } else {
      sentCount++
    }
  }

  if (errors.length > 0) {
    console.error('[ReportEmail] Partial send failure:', {
      sentCount,
      failedCount: errors.length,
      totalRecipients: recipients.length,
      errors,
    })
  }

  if (sentCount > 0) {
    console.info('[ReportEmail] Report emailed:', {
      sentCount,
      subject,
    })
  }

  if (sentCount === 0) {
    return {
      success: false,
      error: `Failed to send to all ${recipients.length} recipient(s)`,
    }
  }

  return { success: true, sentCount }
}

// ========================
// HTML Composition
// ========================

function composeSubject(document: ReportDocument): string {
  const coverSection = document.sections.find((s) => s.type === 'cover')
  const cover = coverSection?.data as CoverSectionData | undefined

  const companyName = cover?.companyName ?? document.foundryName
  const reportTitle = cover?.reportTitle ?? document.title
  const dateRange = cover?.subtitle ?? formatDateRange(document.dateRange)

  return `${escapeHtml(companyName)} — ${escapeHtml(reportTitle)} (${escapeHtml(dateRange)})`
}

function formatDateRange(range: { start: string; end: string }): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${fmt.format(new Date(range.start))} – ${fmt.format(new Date(range.end))}`
}

// INTENT: Build a self-contained HTML email that renders in Gmail, Outlook,
// and Apple Mail. All styles are inlined per email-client best practice.
// Max-width 600px is the industry standard for email readability.
function composeEmailHtml(
  document: ReportDocument,
  shareUrl?: string
): string {
  const coverSection = document.sections.find((s) => s.type === 'cover')
  const cover = coverSection?.data as CoverSectionData | undefined

  const summarySection = document.sections.find(
    (s) => s.type === 'executive-summary'
  )
  const summary = summarySection?.data as
    | ExecutiveSummarySectionData
    | undefined

  const metricsSection = document.sections.find(
    (s) => s.type === 'key-metrics'
  )
  const metrics = metricsSection?.data as KeyMetricsSectionData | undefined

  const objectivesSection = document.sections.find(
    (s) => s.type === 'objectives-progress'
  )
  const objectives = objectivesSection?.data as ObjectivesProgressSectionData | undefined

  const blockersSection = document.sections.find(
    (s) => s.type === 'blockers-risks'
  )
  const blockers = blockersSection?.data as BlockersRisksSectionData | undefined

  const teamSection = document.sections.find(
    (s) => s.type === 'team-activity'
  )
  const team = teamSection?.data as TeamActivitySectionData | undefined

  const companyName = escapeHtml(
    cover?.companyName ?? document.foundryName
  )
  const reportTitle = escapeHtml(cover?.reportTitle ?? document.title)
  const dateSubtitle = escapeHtml(
    cover?.subtitle ?? formatDateRange(document.dateRange)
  )

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${reportTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Orange accent bar -->
          <tr>
            <td style="height: 4px; background-color: #ff4500; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">${companyName}</p>
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #1e293b; line-height: 1.3;">${reportTitle}</h1>
              <p style="margin: 0; font-size: 14px; color: #64748b;">${dateSubtitle}</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;" />
            </td>
          </tr>

          ${summary ? renderSummarySection(summary) : ''}
          ${metrics && metrics.metrics.length > 0 ? renderMetricsSection(metrics) : ''}
          ${objectives && objectives.objectives.length > 0 ? renderObjectivesSection(objectives) : ''}
          ${team && team.members.length > 0 ? renderTeamSection(team) : ''}
          ${blockers && blockers.blockers.length > 0 ? renderBlockersSection(blockers) : ''}
          ${shareUrl ? renderCtaButton(shareUrl) : ''}

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px 32px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8;">Generated by <strong style="color: #64748b;">ForgeOS</strong></p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">${escapeHtml(new Date(document.generatedAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }))}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderSummarySection(summary: ExecutiveSummarySectionData): string {
  const narrative = escapeHtml(summary.narrative)
  const highlightItems = summary.highlights
    .map(
      (h) =>
        `<li style="margin: 0 0 6px 0; font-size: 14px; color: #334155; line-height: 1.5;">${escapeHtml(h)}</li>`
    )
    .join('')

  return `
          <!-- Executive Summary -->
          <tr>
            <td style="padding: 24px 32px 8px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.03em;">Executive Summary</h2>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.6;">${narrative}</p>
              ${highlightItems ? `<ul style="margin: 0 0 8px 0; padding-left: 20px;">${highlightItems}</ul>` : ''}
            </td>
          </tr>`
}

function renderMetricsSection(metrics: KeyMetricsSectionData): string {
  // DECISION: Use a 2-column table layout for KPIs because email clients
  // don't support CSS grid or flexbox reliably. Two columns fits well
  // in the 600px width constraint.
  const rows: string[] = []

  for (let i = 0; i < metrics.metrics.length; i += 2) {
    const left = metrics.metrics[i]
    const right = metrics.metrics[i + 1]
    rows.push(`
            <tr>
              ${renderMetricCell(left)}
              ${right ? renderMetricCell(right) : '<td style="width: 50%; padding: 8px;"></td>'}
            </tr>`)
  }

  return `
          <!-- Key Metrics -->
          <tr>
            <td style="padding: 24px 32px 8px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.03em;">Key Metrics</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                ${rows.join('')}
              </table>
            </td>
          </tr>`
}

function renderMetricCell(metric: KPIMetric): string {
  const formattedValue = formatMetricValue(metric)
  const trendColor =
    metric.trend === 'up'
      ? '#16a34a'
      : metric.trend === 'down'
        ? '#dc2626'
        : '#64748b'
  const trendArrow =
    metric.trend === 'up' ? '&#9650;' : metric.trend === 'down' ? '&#9660;' : '&#8212;'
  const changeText =
    metric.changePercent !== 0
      ? `${metric.changePercent > 0 ? '+' : ''}${metric.changePercent}%`
      : ''

  return `
              <td style="width: 50%; padding: 8px;">
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500;">${escapeHtml(metric.label)}</p>
                  <p style="margin: 0; font-size: 28px; font-weight: 700; color: #1e293b; line-height: 1.2;">${formattedValue}</p>
                  <p style="margin: 4px 0 0 0; font-size: 12px; color: ${trendColor}; font-weight: 500;">
                    <span>${trendArrow}</span> ${changeText}
                  </p>
                </div>
              </td>`
}

function formatMetricValue(metric: KPIMetric): string {
  switch (metric.format) {
    case 'percentage':
      return `${metric.value}%`
    case 'decimal':
      return metric.value.toFixed(1)
    default:
      return metric.value.toLocaleString()
  }
}

function renderObjectivesSection(objectives: ObjectivesProgressSectionData): string {
  const rows = objectives.objectives.slice(0, 5).map(obj => {
    const healthColor = obj.health === 'on-track' ? '#16a34a' :
      obj.health === 'at-risk' ? '#f59e0b' :
      obj.health === 'off-track' ? '#dc2626' : '#64748b'
    const healthLabel = obj.health === 'on-track' ? 'On Track' :
      obj.health === 'at-risk' ? 'At Risk' :
      obj.health === 'off-track' ? 'Off Track' : obj.health

    return `
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
                <p style="margin: 0 0 4px 0; font-size: 14px; color: #1e293b; font-weight: 500;">${escapeHtml(obj.title)}</p>
                <p style="margin: 0;">
                  <span style="display: inline-block; font-size: 12px; color: ${healthColor}; font-weight: 600; margin-right: 8px;">${healthLabel}</span>
                  <span style="display: inline-block; font-size: 12px; color: #64748b; margin-right: 8px;">${obj.progress}% complete</span>
                  ${obj.progressDelta ? `<span style="display: inline-block; font-size: 12px; color: ${obj.progressDelta > 0 ? '#16a34a' : '#dc2626'}; font-weight: 500;">${obj.progressDelta > 0 ? '+' : ''}${obj.progressDelta}pp</span>` : ''}
                </p>
              </td>
            </tr>`
  }).join('')

  return `
          <!-- Objectives -->
          <tr>
            <td style="padding: 24px 32px 8px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.03em;">Objectives Progress</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                ${rows}
              </table>
            </td>
          </tr>`
}

function renderTeamSection(team: TeamActivitySectionData): string {
  const topMembers = [...team.members]
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
    .slice(0, 5)

  const rows = topMembers.map(member => `
            <tr>
              <td style="padding: 6px 0; font-size: 14px; color: #1e293b;">${escapeHtml(member.name)}</td>
              <td style="padding: 6px 0; font-size: 14px; color: #64748b; text-align: right; font-weight: 600;">${member.tasksCompleted} tasks</td>
            </tr>`
  ).join('')

  return `
          <!-- Team Activity -->
          <tr>
            <td style="padding: 24px 32px 8px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.03em;">Top Contributors</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                ${rows}
              </table>
              ${team.standupParticipationRate != null ? `<p style="margin: 12px 0 0 0; font-size: 13px; color: #64748b;">Standup participation: <strong>${Math.round(team.standupParticipationRate)}%</strong></p>` : ''}
            </td>
          </tr>`
}

function renderBlockersSection(blockers: BlockersRisksSectionData): string {
  const items = blockers.blockers.slice(0, 5).map(b => {
    const severityColor = b.severity === 'critical' ? '#dc2626' :
      b.severity === 'high' ? '#f59e0b' : '#64748b'
    const severityLabel = b.severity ? b.severity.charAt(0).toUpperCase() + b.severity.slice(1) : ''

    return `
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
                <p style="margin: 0 0 4px 0; font-size: 14px; color: #1e293b; line-height: 1.5;">${escapeHtml(b.description)}</p>
                <div>
                  <span style="font-size: 12px; color: #64748b;">Reported by ${escapeHtml(b.reporterName)}</span>
                  ${severityLabel ? ` <span style="font-size: 11px; color: ${severityColor}; font-weight: 600; text-transform: uppercase;">${severityLabel}</span>` : ''}
                  ${b.ageInDays != null && b.ageInDays > 0 ? ` <span style="font-size: 11px; color: ${b.ageInDays >= 7 ? '#dc2626' : '#64748b'};">${b.ageInDays}d old</span>` : ''}
                </div>
              </td>
            </tr>`
  }).join('')

  return `
          <!-- Blockers -->
          <tr>
            <td style="padding: 24px 32px 8px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.03em;">Blockers &amp; Risks</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                ${items}
              </table>
            </td>
          </tr>`
}

function renderCtaButton(shareUrl: string): string {
  return `
          <!-- CTA Button -->
          <tr>
            <td style="padding: 16px 32px 24px 32px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #ff4500; border-radius: 8px;">
                    <a href="${escapeHtml(shareUrl)}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.02em;">View Full Report</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
}
