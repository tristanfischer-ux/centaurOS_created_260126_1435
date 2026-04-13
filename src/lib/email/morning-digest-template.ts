/**
 * @file morning-digest-template.ts
 *
 * @description Branded HTML email template for the daily morning digest.
 * Follows the same design language as report emails: orange accent bar,
 * clean sans-serif typography, max-width 600px for inbox readability.
 *
 * INTENT: Give users a glanceable summary of today's tasks and a motivational
 * nudge from Cal (Chief of Staff) to start the day with clarity and momentum.
 *
 * @security All user-provided strings are escaped via the caller before
 * being passed to this template. Template itself uses no dynamic evaluation.
 *
 * @related
 * - src/actions/report-email.ts — Same branded email style reference
 * - src/app/api/cron/morning-digest/route.ts — Cron handler that calls this
 */

import { escapeHtml } from '@/lib/security/sanitize'

// ─── Types ──────────────────────────────────────────────────────────────

export interface DigestTask {
  title: string
  status: string
  objectiveTitle?: string
  riskLevel?: string
}

export interface MorningDigestData {
  /** User's first name or full name */
  userName: string
  /** Today's date formatted for display (e.g. "Saturday 12 April 2026") */
  dateDisplay: string
  /** Tasks due today */
  tasks: DigestTask[]
  /** Motivational message from Cal */
  calMessage: string
  /** Absolute URL to the platform dashboard */
  dashboardUrl: string
  /** Foundry/company name */
  foundryName: string
}

// ─── Helpers ────────────────────────────────────────────────────────────

function statusBadge(status: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    'Pending': { bg: '#fef3c7', text: '#92400e' },
    'Accepted': { bg: '#dbeafe', text: '#1e40af' },
    'Amended': { bg: '#e0e7ff', text: '#3730a3' },
    'Pending_Peer_Review': { bg: '#f3e8ff', text: '#6b21a8' },
    'Pending_Executive_Approval': { bg: '#fce7f3', text: '#9d174d' },
  }
  const style = colors[status] || { bg: '#f1f5f9', text: '#475569' }
  const label = status.replace(/_/g, ' ')
  return `<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background-color: ${style.bg}; color: ${style.text};">${escapeHtml(label)}</span>`
}

function riskDot(risk?: string): string {
  if (!risk || risk === 'low') return ''
  const color = risk === 'critical' ? '#dc2626' : risk === 'high' ? '#f97316' : '#eab308'
  return `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; margin-right: 6px; vertical-align: middle;"></span>`
}

// ─── Template ───────────────────────────────────────────────────────────

/**
 * Generates the full HTML email for the morning digest.
 *
 * @param data - Pre-sanitized digest data
 * @returns Complete HTML string ready for email delivery
 */
export function renderMorningDigestEmail(data: MorningDigestData): string {
  const {
    userName,
    dateDisplay,
    tasks,
    calMessage,
    dashboardUrl,
    foundryName,
  } = data

  const safeName = escapeHtml(userName)
  const safeDate = escapeHtml(dateDisplay)
  const safeFoundry = escapeHtml(foundryName)
  const safeCalMessage = escapeHtml(calMessage)
  const safeDashboardUrl = escapeHtml(dashboardUrl)

  const taskCount = tasks.length
  const greeting = `Good morning, ${safeName}`

  const taskRows = tasks.length > 0
    ? tasks.map((t) => `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
            <div style="margin-bottom: 4px;">
              ${riskDot(t.riskLevel)}<span style="font-size: 14px; font-weight: 500; color: #1e293b;">${escapeHtml(t.title)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${statusBadge(t.status)}
              ${t.objectiveTitle ? `<span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">${escapeHtml(t.objectiveTitle)}</span>` : ''}
            </div>
          </td>
        </tr>`).join('')
    : `<tr>
        <td style="padding: 24px 0; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: #94a3b8;">No tasks due today. A rare clear day — make the most of it.</p>
        </td>
      </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Morning Digest — ${safeDate}</title>
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
            <td style="padding: 32px 32px 16px 32px;">
              <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">${safeFoundry}</p>
              <h1 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 700; color: #1e293b; line-height: 1.3;">${greeting}</h1>
              <p style="margin: 0; font-size: 14px; color: #64748b;">${safeDate}</p>
            </td>
          </tr>

          <!-- Cal's message -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <div style="background-color: #fff7ed; border-left: 3px solid #ff4500; padding: 16px; border-radius: 0 6px 6px 0;">
                <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 700; color: #9a3412; text-transform: uppercase; letter-spacing: 0.05em;">Cal, Chief of Staff</p>
                <p style="margin: 0; font-size: 14px; color: #431407; line-height: 1.5;">${safeCalMessage}</p>
              </div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;" />
            </td>
          </tr>

          <!-- Tasks section -->
          <tr>
            <td style="padding: 24px 32px 8px 32px;">
              <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: #1e293b;">
                Today's Tasks${taskCount > 0 ? ` <span style="font-weight: 400; color: #94a3b8;">(${taskCount})</span>` : ''}
              </h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                ${taskRows}
              </table>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td style="padding: 0 32px 32px 32px;" align="center">
              <a href="${safeDashboardUrl}" style="display: inline-block; background-color: #ff4500; color: #ffffff; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 0.02em;">Open ForgeOS</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px 32px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8;">Sent by <strong style="color: #64748b;">ForgeOS</strong> — your morning digest</p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">You receive this because you have active tasks. To stop, adjust notification preferences in Settings.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
