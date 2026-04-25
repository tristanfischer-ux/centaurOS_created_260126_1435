/**
 * @file weekly-plan-digest-template.ts
 *
 * @description Branded HTML email template for the weekly plan digest.
 * Sent every Monday morning to summarise the past week's plan activity.
 *
 * Voice rules:
 *   - British spelling (behaviour, optimise, etc.)
 *   - Lead with what got done, not what slipped
 *   - No em dashes
 *   - No acronyms
 *   - 6-8 lines of content maximum
 *   - Positive framing throughout
 *
 * @security All user-provided strings must be escaped by the caller
 *           before passing to this template.
 *
 * @related
 *   - src/app/api/cron/weekly-digest/route.ts — sends this template
 */

import { escapeHtml } from "@/lib/security/sanitize"

export interface WeeklyPlanDigestData {
  /** User's first name or full name */
  userName: string
  /** Foundry / company name */
  foundryName: string
  /** ISO week label e.g. "week of 21 April" */
  weekLabel: string
  /** Tasks completed in the past 7 days */
  tasksCompleted: number
  /** Decisions logged in the past 7 days */
  decisionsLogged: number
  /** Objectives that had any update in the past 7 days */
  objectivesUpdated: number
  /** Tasks that are overdue right now */
  tasksOverdue: number
  /** Titles of the top 3 completed tasks (already escaped at call site) */
  completedTaskTitles: string[]
  /** Current streak in weeks */
  streakWeeks: number
  /** Absolute URL to the plan page */
  planUrl: string
}

export function renderWeeklyPlanDigestEmail(data: WeeklyPlanDigestData): string {
  const {
    userName,
    foundryName,
    weekLabel,
    tasksCompleted,
    decisionsLogged,
    objectivesUpdated,
    tasksOverdue,
    completedTaskTitles,
    streakWeeks,
    planUrl,
  } = data

  const safeName    = escapeHtml(userName)
  const safeFoundry = escapeHtml(foundryName)
  const safeWeek    = escapeHtml(weekLabel)
  const safePlanUrl = escapeHtml(planUrl)

  const hasActivity = tasksCompleted > 0 || decisionsLogged > 0 || objectivesUpdated > 0

  // ── Opening line ──────────────────────────────────────────────────────
  const openingLine = hasActivity
    ? `Here is what moved in ${safeFoundry}'s plan during the ${safeWeek}.`
    : `It was a quiet ${safeWeek} for the plan. A new week is the right moment to pick it back up.`

  // ── Activity stats row ────────────────────────────────────────────────
  function statCell(value: number, label: string, colour: string): string {
    return `
      <td style="text-align: center; padding: 16px 12px; width: 25%;">
        <div style="font-size: 28px; font-weight: 700; color: ${colour}; line-height: 1;">${value}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.3;">${label}</div>
      </td>`
  }

  const statsRow = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border-collapse: collapse; background: #f8fafc; border-radius: 8px; margin-bottom: 24px;">
      <tr>
        ${statCell(tasksCompleted,     "tasks completed",     "#22c55e")}
        ${statCell(decisionsLogged,    "decisions logged",    "#3b82f6")}
        ${statCell(objectivesUpdated,  "objectives updated",  "#ff4500")}
        ${statCell(tasksOverdue,       "tasks overdue",       tasksOverdue > 0 ? "#ef4444" : "#94a3b8")}
      </tr>
    </table>`

  // ── Completed task highlights ─────────────────────────────────────────
  const taskHighlights = completedTaskTitles.length > 0
    ? `
      <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #334155; text-transform: uppercase; letter-spacing: 0.04em;">Completed this week</p>
      <ul style="margin: 0 0 24px 0; padding-left: 20px;">
        ${completedTaskTitles
          .slice(0, 3)
          .map((t) => `<li style="font-size: 14px; color: #1e293b; margin-bottom: 6px; line-height: 1.4;">${escapeHtml(t)}</li>`)
          .join("")}
      </ul>`
    : ""

  // ── Overdue nudge (framed as opportunity, not failure) ────────────────
  const overdueNudge = tasksOverdue > 0
    ? `
      <div style="background: #fff7ed; border-left: 3px solid #ff4500; padding: 14px 16px; border-radius: 0 6px 6px 0; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 14px; color: #431407; line-height: 1.5;">
          ${tasksOverdue} ${tasksOverdue === 1 ? "task is" : "tasks are"} waiting for attention this week.
          Opening the plan takes two minutes.
        </p>
      </div>`
    : ""

  // ── Streak line ───────────────────────────────────────────────────────
  const streakLine = streakWeeks > 0
    ? `<p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">
        You are on a <strong style="color: #ff4500;">${streakWeeks}-week streak</strong> of plan activity.
        Keep the habit going.
       </p>`
    : `<p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">
        Log a decision or close a task this week to start a streak.
       </p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly plan digest — ${safeWeek}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600"
               style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Orange accent bar -->
          <tr>
            <td style="height:4px;background-color:#ff4500;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${safeFoundry}</p>
              <h1 style="margin:0 0 4px 0;font-size:22px;font-weight:700;color:#1e293b;line-height:1.3;">
                Weekly plan digest
              </h1>
              <p style="margin:0;font-size:14px;color:#64748b;">${safeWeek}</p>
            </td>
          </tr>

          <!-- Opening -->
          <tr>
            <td style="padding:16px 32px 24px 32px;">
              <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">Hi ${safeName}, ${openingLine}</p>
            </td>
          </tr>

          <!-- Stats grid -->
          <tr>
            <td style="padding:0 32px 8px 32px;">
              ${statsRow}
            </td>
          </tr>

          <!-- Task highlights + overdue nudge -->
          <tr>
            <td style="padding:0 32px 8px 32px;">
              ${taskHighlights}
              ${overdueNudge}
              ${streakLine}
            </td>
          </tr>

          <!-- Primary call to action -->
          <tr>
            <td style="padding:0 32px 32px 32px;" align="center">
              <a href="${safePlanUrl}"
                 style="display:inline-block;background-color:#ff4500;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.02em;">
                Open the plan
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 32px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px 0;font-size:12px;color:#94a3b8;">
                Sent by <strong style="color:#64748b;">ForgeOS</strong> every Monday morning.
              </p>
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                You receive this because you have an active plan. To stop, visit your notification settings.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
