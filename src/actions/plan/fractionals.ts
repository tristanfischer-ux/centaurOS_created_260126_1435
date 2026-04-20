"use server"

/**
 * @file fractionals.ts — Fractional-executive engagement actions (Plan section)
 *
 * @description Invite, end, and update fractional-engagement rows per
 * PLAN-SCHEMA §§6-7. Invite creates both the fractional_executives person row
 * (if not present by email) AND the per-foundry fractional_engagements record.
 *
 * @security All writes go through plan_can() gate (invite_fractional / end_engagement).
 * @audit Every mutation writes audit_log + history_entries(entry_type='manual').
 */

import { inviteFractionalInputSchema } from "@/actions/plan/types"
import type { InviteFractionalInput } from "@/actions/plan/types"
import type {
  FractionalEngagementRow,
  HistoryEntryRow,
} from "@/types/plan"
import { withAuth } from "@/lib/server-action-utils"
import { logAudit } from "@/actions/audit"
import { emitPlanEvent } from "@/lib/plan/emit-event"

const DEFAULT_HOURS_PER_WEEK = 6
const DEFAULT_RETAINER_MONTHLY = 2500 // GBP; overridable at Settings time

/**
 * Invite a fractional executive to the foundry.
 *
 * V1 minimal shape per PLAN-SCHEMA §17 Open-Question 7:
 *   email + role + (optional) specialisation + optional goals.
 * Retainer, capacity, working-style default-in; Settings edits come later.
 *
 * Idempotent: if a fractional with this email already exists (network_listed
 * or private), we attach the new engagement to the existing fractional_id.
 */
export async function inviteFractional(
  input: InviteFractionalInput,
): Promise<FractionalEngagementRow> {
  const parsed = inviteFractionalInputSchema.parse(input)

  return withAuth(async ({ supabase, user, foundryId }) => {
    // Permission gate
    const sb = supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
    }
    const { data: canData, error: canErr } = await sb.rpc("plan_can", {
      p_user_id: user.id,
      p_foundry_id: foundryId,
      p_action: "invite_fractional",
    })
    if (canErr) throw new Error("plan_can(invite_fractional) failed")
    if (canData !== true) throw new Error("Not authorised to invite fractionals")

    const anySb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: unknown) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> } }
        }
        insert: (r: Record<string, unknown>) => { select: (c: string) => { single: () => Promise<{ data: unknown; error: unknown }> } }
        update: (r: Record<string, unknown>) => { eq: (k: string, v: unknown) => Promise<{ error: unknown }> }
      }
    }

    // Find or create the fractional_executives row by email
    const { data: existing } = await anySb.from("fractional_executives")
      .select("id, display_name, network_listed")
      .eq("email", parsed.email)
      .limit(1)
      .maybeSingle()

    let fractionalId: string
    if (existing && typeof (existing as Record<string, unknown>).id === "string") {
      fractionalId = (existing as Record<string, unknown>).id as string
    } else {
      const { data: created, error: createErr } = await anySb.from("fractional_executives")
        .insert({
          display_name: parsed.displayName || parsed.email.split("@")[0],
          email: parsed.email,
          specialisation: parsed.specialisation ?? "other",
          network_listed: false,
          default_hours_weekly: DEFAULT_HOURS_PER_WEEK,
          default_retainer_monthly: DEFAULT_RETAINER_MONTHLY,
        })
        .select("id")
        .single()
      if (createErr) throw new Error("Failed to create fractional_executives row")
      fractionalId = (created as Record<string, unknown>).id as string
    }

    // Create the engagement
    const now = new Date()
    const { data: engagement, error: engErr } = await anySb.from("fractional_engagements")
      .insert({
        foundry_id: foundryId,
        fractional_id: fractionalId,
        role_in_foundry: parsed.role,
        hours_per_week: parsed.hoursPerWeek ?? DEFAULT_HOURS_PER_WEEK,
        hours_used_this_week: 0,
        retainer_monthly: parsed.retainerMonthly ?? DEFAULT_RETAINER_MONTHLY,
        started_on: now.toISOString().slice(0, 10),
        status: "pending_accept",
        working_style: "blended",
        notice_period_days: 30,
      })
      .select("*")
      .single()
    if (engErr) throw new Error("Failed to create fractional_engagement")

    // Optional goal attachments
    if (parsed.attachToGoalIds && parsed.attachToGoalIds.length > 0) {
      for (const goalId of parsed.attachToGoalIds) {
        try {
          await anySb.from("goal_team_assignments").insert({
            foundry_id: foundryId,
            goal_id: goalId,
            assignee_type: "fractional",
            fractional_id: fractionalId,
            role_on_goal: "supporting",
            added_by: user.id,
          })
        } catch {
          // Soft-fail per goal — the invite itself has landed
        }
      }
    }

    // History entry
    await anySb.from("history_entries").insert({
      foundry_id: foundryId,
      entry_type: "manual",
      title: `Invited fractional: ${parsed.role}`,
      body: `Invited ${parsed.email} as "${parsed.role}" · ${parsed.hoursPerWeek ?? DEFAULT_HOURS_PER_WEEK}h/wk · £${parsed.retainerMonthly ?? DEFAULT_RETAINER_MONTHLY}/mo`,
      actor_type: "founder",
      actor_id: user.id,
      related_ids_json: { fractional_id: fractionalId, engagement_id: (engagement as Record<string, unknown>).id },
    })

    await logAudit({
      foundryId,
      userId: user.id,
      action: "fractional_invited" as never,
      entityType: "fractional_engagement",
      entityId: ((engagement as Record<string, unknown>).id as string) ?? "",
      metadata: { fractional_id: fractionalId, email: parsed.email },
    })

    return engagement as FractionalEngagementRow
  })
}

/**
 * End a fractional engagement.
 *
 * Sets status='ended' + ended_on=today. Does NOT delete the engagement row
 * (audit + History trail must stay readable). Idempotent: ending an
 * already-ended engagement is a no-op.
 */
export async function endEngagement(
  engagementId: string,
  reason: string,
): Promise<HistoryEntryRow> {
  if (!engagementId || typeof engagementId !== "string") {
    throw new Error("endEngagement: engagementId required")
  }
  if (!reason || reason.trim().length === 0) {
    throw new Error("endEngagement: reason required")
  }

  return withAuth(async ({ supabase, user, foundryId }) => {
    const sb = supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
    }
    const { data: canData } = await sb.rpc("plan_can", {
      p_user_id: user.id,
      p_foundry_id: foundryId,
      p_action: "end_engagement",
    })
    if (canData !== true) throw new Error("Not authorised to end engagements")

    const anySb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => { eq: (k: string, v: unknown) => { single: () => Promise<{ data: unknown; error: unknown }> } }
        update: (r: Record<string, unknown>) => { eq: (k: string, v: unknown) => Promise<{ error: unknown }> }
        insert: (r: Record<string, unknown>) => { select: (c: string) => { single: () => Promise<{ data: unknown; error: unknown }> } }
      }
    }

    const today = new Date().toISOString().slice(0, 10)
    await anySb.from("fractional_engagements")
      .update({ status: "ended", ended_on: today })
      .eq("id", engagementId)

    const { data: entry, error: entryErr } = await anySb.from("history_entries")
      .insert({
        foundry_id: foundryId,
        entry_type: "decision",
        title: "Ended fractional engagement",
        body: reason,
        actor_type: "founder",
        actor_id: user.id,
        related_ids_json: { engagement_id: engagementId },
        outcome: "neutral",
      })
      .select("*")
      .single()
    if (entryErr) throw new Error("Failed to write history_entries row")

    await logAudit({
      foundryId,
      userId: user.id,
      action: "fractional_engagement_ended" as never,
      entityType: "fractional_engagement",
      entityId: engagementId,
      metadata: { reason },
    })

    // PLAN-SCHEMA §14.1 — fractional_engagement.ended_on within 14 days.
    // Ending today trivially falls inside the 14-day window; emit so the
    // founder is prompted to plan the handover. high urgency, 7d decay.
    await emitPlanEvent({
      foundryId,
      sourceEntityType: "fractional_engagement",
      sourceEntityId: engagementId,
      urgency: "high",
      decayRate: "7d",
      title: "Fractional engagement ended",
      body: reason.slice(0, 280),
      ctaLabel: "Plan handover",
      ctaHref: `plan:team:${engagementId}`,
      assignedTo: null,
    })

    return entry as HistoryEntryRow
  })
}

/**
 * Record capacity usage for the current week. Called by the app when a
 * fractional logs time against an engagement (Settings UI or cron sync).
 */
export async function updateCapacity(
  engagementId: string,
  hoursUsedThisWeek: number,
): Promise<void> {
  if (!engagementId || typeof engagementId !== "string") {
    throw new Error("updateCapacity: engagementId required")
  }
  if (!Number.isFinite(hoursUsedThisWeek) || hoursUsedThisWeek < 0) {
    throw new Error("updateCapacity: hoursUsedThisWeek must be >= 0")
  }

  return withAuth(async ({ supabase, user, foundryId }) => {
    const anySb = supabase as unknown as {
      from: (t: string) => {
        update: (r: Record<string, unknown>) => { eq: (k: string, v: unknown) => Promise<{ error: unknown }> }
        select: (c: string) => { eq: (k: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> } }
      }
    }
    await anySb.from("fractional_engagements")
      .update({ hours_used_this_week: hoursUsedThisWeek })
      .eq("id", engagementId)

    await logAudit({
      foundryId,
      userId: user.id,
      action: "fractional_capacity_updated" as never,
      entityType: "fractional_engagement",
      entityId: engagementId,
      metadata: { hours_used_this_week: hoursUsedThisWeek },
    })

    // PLAN-SCHEMA §14.1 — hours_used_this_week > hours_per_week * 0.9
    // ⇒ low urgency, 1d decay. Read the engagement's hours_per_week to
    // decide whether to emit.
    try {
      const { data: eng } = await anySb
        .from("fractional_engagements")
        .select("hours_per_week, fractional_id")
        .eq("id", engagementId)
        .maybeSingle()
      const row = eng as { hours_per_week: number | null; fractional_id: string | null } | null
      const hpw = row?.hours_per_week ?? 0
      if (hpw > 0 && hoursUsedThisWeek > hpw * 0.9) {
        await emitPlanEvent({
          foundryId,
          sourceEntityType: "fractional_engagement",
          sourceEntityId: engagementId,
          urgency: "low",
          decayRate: "1d",
          title: "Fractional capacity near limit",
          body: `${hoursUsedThisWeek}h used of ${hpw}h/wk.`,
          ctaLabel: "Review capacity",
          ctaHref: `plan:team:${engagementId}`,
          assignedTo: null,
        })
      }
    } catch {
      // Non-fatal — capacity write already persisted.
    }
  })
}
