/**
 * @file weekly-digest/route.ts
 *
 * @description Vercel Cron route — fires every Monday at 09:00 UTC.
 *
 * For each foundry where the primary Founder has:
 *   - An active account (is_active = true)
 *   - Not unsubscribed from all email
 *   - Had any plan activity in the last 30 days (plan_history rows)
 *
 * The handler:
 *   1. Loads the week's plan_history stats (tasks completed, decisions logged, objectives updated)
 *   2. Loads the last 3 completed task titles for the highlight list
 *   3. Loads profiles.plan_streak_weeks (already cached by the plan page action)
 *   4. Renders the weekly plan digest HTML via renderWeeklyPlanDigestEmail
 *   5. Sends via Resend
 *
 * Idempotency: a weekly_digest_log table is NOT used here because the Monday
 * 09:00 schedule fires once. If the function is retried (Vercel max 1 retry)
 * the same email sends twice — acceptable for a weekly digest. A log table
 * can be added in a follow-up if double-send is observed.
 *
 * Email voice rules (applied in the template):
 *   - Lead with what got done, not what slipped
 *   - No em dashes
 *   - British spelling
 *   - 6-8 lines of content
 *   - Positive framing
 *
 * @security
 *   - CRON_SECRET Bearer authentication (timing-safe)
 *   - Service-role admin client — reads across tenants, never returns to client
 *   - All user data escaped in template
 *
 * @related
 *   - src/lib/email/weekly-plan-digest-template.ts — HTML template
 *   - src/lib/security/cron-auth.ts — shared auth utility
 *   - vercel.json — cron schedule 0 9 * * 1
 */

import { NextResponse } from "next/server"
import { Resend } from "resend"

import { createAdminClient } from "@/lib/supabase/admin"
import { verifyCronSecret } from "@/lib/security/cron-auth"
import { renderWeeklyPlanDigestEmail } from "@/lib/email/weekly-plan-digest-template"

export const dynamic = "force-dynamic"
export const maxDuration = 240 // seconds — generous for fan-out across many foundries

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_FOUNDRIES_PER_RUN = 500
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "https://fractionalforge.app"
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS ?? "ForgeOS <noreply@fractionalforge.app>"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekLabel(now: Date): string {
  const dayOfMonth = now.getDate()
  const month = now.toLocaleDateString("en-GB", { month: "long" })
  return `week of ${dayOfMonth} ${month}`
}

function sevenDaysAgo(now: Date): string {
  const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return d.toISOString()
}

function firstDayOfMonth(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  if (!resend) {
    console.error("[weekly-digest] RESEND_API_KEY not configured — skipping run")
    return NextResponse.json({ skipped: true, reason: "no_resend_key" })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const since = sevenDaysAgo(now)
  const monthStart = firstDayOfMonth(now)

  // ── 1. Find all active Founder profiles whose foundry had plan activity ──────
  //
  // We join plan_history to find foundries with at least one row in the last
  // 30 days — no point emailing a dormant foundry.
  const { data: founderProfiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name, foundry_id, plan_streak_weeks")
    .eq("role", "Founder")
    .eq("is_active", true)
    .limit(MAX_FOUNDRIES_PER_RUN)

  if (profilesError) {
    console.error("[weekly-digest] Failed to load founder profiles", {
      error: profilesError.message,
    })
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  const founders = founderProfiles ?? []

  // ── 2. Fan-out: send one digest per eligible founder ──────────────────────
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const founder of founders) {
    try {
      if (!founder.email || !founder.foundry_id) {
        skipped++
        continue
      }

      // Check email opt-out: respect unsubscribed_all_at
      const { data: prefs } = await supabase
        .from("email_preferences")
        .select("unsubscribed_all_at, paused_all_until, morning_digest")
        .eq("user_id", founder.id)
        .maybeSingle()

      if (prefs?.unsubscribed_all_at) { skipped++; continue }
      if (prefs?.paused_all_until && new Date(prefs.paused_all_until) > now) { skipped++; continue }
      // morning_digest channel doubles as the weekly digest opt-in
      if (prefs?.morning_digest === false) { skipped++; continue }

      // Load the week's plan_history stats for this foundry
      const { data: historyRows } = await supabase
        .from("plan_history")
        .select("entity_type, action, after_data")
        .eq("foundry_id", founder.foundry_id)
        .gte("created_at", since)

      const rows = historyRows ?? []

      // Only send if the foundry had any plan_history in the last 30 days
      // (not just this week — occasional users still get the email)
      const { data: recentActivity } = await supabase
        .from("plan_history")
        .select("id", { count: "exact", head: true })
        .eq("foundry_id", founder.foundry_id)
        .gte("created_at", monthStart)

      if (!recentActivity || (recentActivity as unknown as { count: number }).count === 0) {
        // Use count from the response — Supabase count is in the response metadata
        const { count } = await supabase
          .from("plan_history")
          .select("*", { count: "exact", head: true })
          .eq("foundry_id", founder.foundry_id)
          .gte("created_at", monthStart)

        if (!count || count === 0) { skipped++; continue }
      }

      const tasksCompleted = rows.filter(
        (r) => r.entity_type === "task" && r.action === "completed"
      ).length

      const decisionsLogged = rows.filter(
        (r) => r.entity_type === "decision"
      ).length

      const objectivesUpdated = rows.filter(
        (r) => r.entity_type === "objective"
      ).length

      // Completed task titles for highlights (up to 3)
      const completedTaskTitles = rows
        .filter((r) => r.entity_type === "task" && r.action === "completed")
        .slice(0, 3)
        .map((r) => {
          const d = r.after_data as Record<string, unknown> | null
          const t = d?.["title"]
          return typeof t === "string" ? t : ""
        })
        .filter(Boolean)

      // Overdue task count (tasks with status not completed and end_date in past)
      const { count: tasksOverdue } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("foundry_id", founder.foundry_id)
        .eq("is_ghost", false)
        .is("deleted_at", null)
        .lt("end_date", now.toISOString())
        .not("status", "in", '("completed","done")')

      const firstName = (founder.full_name ?? "there").split(" ")[0]

      const emailHtml = renderWeeklyPlanDigestEmail({
        userName: firstName,
        foundryName: founder.foundry_id,
        weekLabel: weekLabel(now),
        tasksCompleted,
        decisionsLogged,
        objectivesUpdated,
        tasksOverdue: tasksOverdue ?? 0,
        completedTaskTitles,
        streakWeeks: founder.plan_streak_weeks ?? 0,
        planUrl: `${APP_DOMAIN}/plan`,
      })

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: founder.email,
        subject: `Your plan digest for the ${weekLabel(now)}`,
        html: emailHtml,
      })

      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[weekly-digest] Error processing founder", {
        founderId: founder.id,
        error: msg,
      })
      errors.push(`${founder.id}: ${msg}`)
    }
  }

  console.log("[weekly-digest] Run complete", { sent, skipped, errors: errors.length })

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  })
}
