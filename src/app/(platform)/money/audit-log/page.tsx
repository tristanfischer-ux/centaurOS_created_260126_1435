/**
 * @file money/audit-log/page.tsx — /money/audit-log
 *
 * @description Money Audit log — mockup-faithful port of
 * MONEY-MOCKUP-AUDIT-LOG.html. Server component loads audit_log rows
 * filtered to Money mutations (entity_type LIKE 'money_%'), joins actor
 * profiles, pre-formats each row for display, then hands a typed props
 * bundle to AuditLogView.
 *
 * Data contract:
 *   - Source: shared `audit_log` table (foundry-scoped via RLS).
 *   - Filter: `entity_type LIKE 'money_%'` per the brief's data contract.
 *     When Money V2 server actions start writing rows, they will use
 *     entity_type values like `money_plan_line_item`, `money_burn_scenario`,
 *     `money_investor_pipeline_event`, etc.
 *   - Empty state: Money V2 mutations have not shipped yet, so the
 *     expected live-state on main today is zero matching rows. When the
 *     query returns empty, the view renders the honest empty state —
 *     never the Tristan/Jian/Helen mockup events.
 *
 * Empty-state policy (per feedback_only_real_supabase_data.md):
 *   If the DB has no rows, show the agreed copy — don't fabricate stats,
 *   don't backfill with seed data, don't chip "reference data".
 *
 * @related
 *   - View:   ./audit-log-view.tsx
 *   - Styles: ./audit-log-v2.css (scoped .aud2)
 *   - Mockup: MONEY-MOCKUP-AUDIT-LOG.html
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import {
    AuditLogView,
    type AuditActionPill,
    type AuditEventRow,
    type AuditLogViewProps,
} from "./audit-log-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Audit log · Money",
    description:
        "Chronological record of material changes in Money — invaluable for investor due diligence and accountant handoffs.",
}

// ─── Query row shape ────────────────────────────────────────────────────

/**
 * Shape of a single audit_log row joined to profiles via
 * `audit_log_user_id_fkey`. Narrow local type — kept out of the view
 * so the view only knows about the pre-formatted AuditEventRow.
 */
interface AuditLogDbRow {
    id: string
    action: string
    entity_type: string | null
    entity_id: string | null
    section: string | null
    metadata: unknown
    payload: unknown
    created_at: string
    user_id: string | null
    actor_user_id: string | null
    actor_specialist: string | null
    profiles: {
        full_name: string | null
        avatar_url: string | null
        role: string | null
    } | null
}

// ─── Pre-formatting helpers ─────────────────────────────────────────────

/**
 * Maps the SQL action keyword ("created" / "updated" / "archived" / …)
 * to the pill bucket used on the UI. Unknown actions fall back to
 * `neutral` so the row still renders rather than disappearing.
 */
function actionToPill(action: string): { pill: AuditActionPill; label: string } {
    const a = action.toLowerCase()
    if (a.startsWith("create") || a === "created" || a === "connected" || a === "invited" || a === "sent") {
        return {
            pill: "create",
            label: a === "connected" ? "Connect" : a === "invited" ? "Invite" : a === "sent" ? "Send" : "Create",
        }
    }
    if (a.startsWith("update") || a === "updated" || a === "edited" || a === "moved" || a === "reclassified") {
        return {
            pill: "edit",
            label: a === "moved" ? "Move" : a === "reclassified" ? "Edit" : "Edit",
        }
    }
    if (a.startsWith("delete") || a === "deleted" || a === "archived") {
        return { pill: "delete", label: a === "archived" ? "Archive" : "Delete" }
    }
    if (a === "login" || a === "logged_in") {
        return { pill: "login", label: "Login" }
    }
    if (a === "synced" || a === "sync_ran" || a === "auto_generated" || a.startsWith("auto")) {
        return { pill: "auto", label: a === "synced" || a === "sync_ran" ? "Sync" : "Auto" }
    }
    return { pill: "neutral", label: action.charAt(0).toUpperCase() + action.slice(1) }
}

/**
 * Derive initials for the actor avatar circle. "System" events (no
 * actor profile) render a neutral asterisk glyph.
 */
function deriveInitials(fullName: string | null, isSystem: boolean): string {
    if (isSystem) return "✱"
    if (!fullName || fullName.trim().length === 0) return "—"
    const parts = fullName.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Pick an avatar tone. Founders get the brand gradient so Tristan's own
 * actions stand out. System events get the slate tone. Everyone else
 * gets the default neutral.
 */
function deriveActorTone(role: string | null, isSystem: boolean): "brand" | "system" | "default" {
    if (isSystem) return "system"
    if (role === "Founder") return "brand"
    return "default"
}

/**
 * Format "Today · 09:24" / "18 Apr · 17:22" in British English.
 * Timezone-naive (UTC) — we follow the repo convention of displaying
 * UTC on the server and letting the client render as-is; the audit log
 * does not need per-user TZ conversion to be useful.
 */
function formatWhen(iso: string, nowIso: string): string {
    const d = new Date(iso)
    const now = new Date(nowIso)
    if (Number.isNaN(d.getTime())) return iso

    const isSameDay =
        d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth() &&
        d.getUTCDate() === now.getUTCDate()

    const hh = String(d.getUTCHours()).padStart(2, "0")
    const mm = String(d.getUTCMinutes()).padStart(2, "0")

    if (isSameDay) return `Today · ${hh}:${mm}`

    const dayNum = d.getUTCDate()
    const monthLabel = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
    return `${dayNum} ${monthLabel} · ${hh}:${mm}`
}

/**
 * Map an entity_type (e.g. `money_plan_line_item`) to the scope label
 * shown in the row ("Plan · line item"). Falls back to the entity_type
 * itself when we don't have a mapping yet — better a raw label than a
 * fabricated one.
 */
function entityTypeToScope(entityType: string | null): string {
    if (!entityType) return "Money"
    const map: Record<string, string> = {
        money_plan_line_item: "Plan · line item",
        money_burn_scenario: "Plan · scenarios",
        money_scenario_override: "Plan · scenarios",
        money_xero_transaction: "Plan · variance",
        money_investor_round: "Raise · round",
        money_investor_pipeline_state: "Raise · pipeline",
        money_investor_pipeline_event: "Raise · pipeline",
        money_investor_thesis: "Raise · thesis",
        money_investor_update: "Raise · updates",
        money_pitch_prep_section: "Raise · pitch prep",
        money_pitch_prep_slide: "Raise · pitch prep",
        money_xero_connection: "Integrations · Xero",
        money_xero_account_mapping: "Integrations · Xero",
        money_money_setting: "Settings",
        money_permission_override: "Team · permissions",
    }
    return map[entityType] ?? entityType.replace(/^money_/, "Money · ").replace(/_/g, " ")
}

/**
 * Compose the "what happened" sentence from action + entity_type. Kept
 * intentionally plain — "edited cost line", "moved pipeline stage",
 * "connected Xero" — so the actor's name can prefix it cleanly.
 */
function composeWhatHappened(action: string, entityType: string | null): string {
    const a = action.toLowerCase()
    const verb = a.startsWith("create") ? "created"
        : a.startsWith("update") || a === "moved" ? "updated"
        : a.startsWith("delete") || a === "archived" ? "archived"
        : a === "connected" ? "connected"
        : a === "sent" ? "sent"
        : a === "synced" || a === "sync_ran" ? "ran sync for"
        : a
    const subject = entityTypeToScope(entityType).toLowerCase()
    return `${verb} ${subject}`
}

/**
 * Extract a one-line diff summary from the audit_log row's metadata or
 * payload. Returns null when there's nothing structured to show — we
 * never fabricate a diff, and we don't dump raw JSON.
 */
function extractDiffLine(metadata: unknown, payload: unknown): string | null {
    const bag =
        (metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null) ??
        (payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null)
    if (!bag) return null
    // Common shapes written by existing audit callers.
    const summary = typeof bag.summary === "string" ? bag.summary : null
    if (summary) return summary
    const note = typeof bag.note === "string" ? bag.note : null
    if (note) return note
    return null
}

// ─── Page ───────────────────────────────────────────────────────────────

export default async function MoneyAuditLogPage(): Promise<React.ReactNode> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // No user → render empty view. Layout handles the auth redirect; the
    // page component stays defensive to avoid throwing during static
    // generation attempts.
    if (!user) {
        return (
            <AuditLogView
                stats={{ eventsToday: null, lastSevenDays: null, membersLogged: null, retentionLabel: null }}
                rows={[]}
                matchCount={null}
            />
        )
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        return (
            <AuditLogView
                stats={{ eventsToday: null, lastSevenDays: null, membersLogged: null, retentionLabel: null }}
                rows={[]}
                matchCount={null}
            />
        )
    }

    // ── Load Money-scoped audit rows for this foundry ────────────
    // RLS should already scope to the user's foundry but we add the
    // explicit `.eq('foundry_id', foundryId)` so the query plan is
    // clear and resilient to any policy changes.
    const { data: rawRows, count } = await supabase
        .from("audit_log")
        .select(
            `id, action, entity_type, entity_id, section, metadata, payload, created_at,
             user_id, actor_user_id, actor_specialist,
             profiles!audit_log_user_id_fkey(full_name, avatar_url, role)`,
            { count: "exact" },
        )
        .eq("foundry_id", foundryId)
        .like("entity_type", "money_%")
        .order("created_at", { ascending: false })
        .limit(200)

    const dbRows = (rawRows as unknown as AuditLogDbRow[] | null) ?? []

    // ── Header stats ─────────────────────────────────────────────
    // Counts are computed from the loaded rows rather than separate
    // count queries — keeps this page as a single round-trip and
    // avoids misleading "142 events" figures when the DB is empty.
    const nowIso = new Date().toISOString()
    const now = new Date(nowIso)
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const eventsToday = dbRows.filter((r) => new Date(r.created_at) >= startOfToday).length
    const lastSevenDays = dbRows.filter((r) => new Date(r.created_at) >= sevenDaysAgo).length
    const membersSet = new Set<string>()
    for (const r of dbRows) {
        const actor = r.actor_user_id ?? r.user_id
        if (actor) membersSet.add(actor)
    }

    // ── Pre-format each row for the view ─────────────────────────
    const rows: AuditEventRow[] = dbRows.map((r) => {
        const isSystem = !r.user_id && !r.actor_user_id && !r.profiles
        const name = r.profiles?.full_name ?? (r.actor_specialist ? r.actor_specialist : isSystem ? "System" : "Unknown user")
        const { pill, label } = actionToPill(r.action)

        return {
            id: r.id,
            createdAtIso: r.created_at,
            whenLabel: formatWhen(r.created_at, nowIso),
            actorName: name,
            actorInitials: deriveInitials(r.profiles?.full_name ?? null, isSystem),
            actorTone: deriveActorTone(r.profiles?.role ?? null, isSystem),
            whatHappened: composeWhatHappened(r.action, r.entity_type),
            diffLine: extractDiffLine(r.metadata, r.payload),
            scopeLabel: entityTypeToScope(r.entity_type),
            actionPill: pill,
            actionPillLabel: label,
        }
    })

    const viewProps: AuditLogViewProps = {
        stats: {
            eventsToday: dbRows.length === 0 ? null : eventsToday,
            lastSevenDays: dbRows.length === 0 ? null : lastSevenDays,
            membersLogged: dbRows.length === 0 ? null : membersSet.size,
            // `money_settings.retention_years` doesn't ship until the Money V2
            // migrations land — keep honest until then rather than hardcoding "7 yr".
            retentionLabel: null,
        },
        rows,
        matchCount: count ?? (dbRows.length === 0 ? null : dbRows.length),
    }

    return <AuditLogView {...viewProps} />
}
