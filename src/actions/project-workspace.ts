"use server"

/**
 * @file project-workspace.ts — Server actions for the V2 project workspace page.
 *
 * @description Provides the derived/composed data the cockpit page needs that
 * isn't a single record read from `cad_lab_projects`:
 *   - `getProjectResumeState(projectId)`     → the amber / green "where you left off" card
 *   - `getProjectActivityFeed(projectId, n)` → the recent activity timeline
 *
 * All actions respect foundry-level RLS via `withAuth`. If the caller does not
 * own the project, the RLS policy returns zero rows and we respond with an
 * empty shape so the UI can render its empty state.
 *
 * @audit Reads only. No writes.
 */

import { withAuth } from "@/lib/server-action-utils"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"

// SECURITY: shared UUID regex — matches the 8-4-4-4-12 group structure
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Resume-state types ──────────────────────────────────────────────

export interface ProjectResumeSurface {
  label: string
  href: string
}

export interface ProjectResumeBlocker {
  title: string
  summary: string
  grounding: string
  resumeCta: ProjectResumeSurface
}

export interface ProjectResumeState {
  /** ISO timestamp of the last audit entry on this project for this user (or null). */
  lastTouched: string | null
  /** Derived surface (e.g. "BOM", "/the-forge-v2/projects/:id/bom"). Null if unknown. */
  lastSurface: ProjectResumeSurface | null
  /** Top-priority blocking issue, if any. Empty-state pattern: null if none exist. */
  blocker: ProjectResumeBlocker | null
}

// ─── Resume-state action ─────────────────────────────────────────────

/**
 * Composes the "where you left off" card data from the most recent audit_log
 * event on this project (for the current user) + the top blocking risk — if
 * either data source exists. Today the `risks` table does NOT exist in
 * ForgeOS, so `blocker` will always be null and the page renders the green /
 * neutral empty-state variants described in the workspace mockup. The action
 * is wired so that when a real `risks` table lands, a single query swap here
 * turns the green card amber without touching the view layer.
 *
 * @param projectId - UUID of the cad_lab_projects row
 * @returns Resume state (all fields nullable) or an error
 *
 * @security RLS on audit_log + cad_lab_projects enforces foundry isolation.
 */
export async function getProjectResumeState(
  projectId: string,
): Promise<{ state: ProjectResumeState } | { error: string }> {
  return withAuth(async ({ supabase, user }) => {
    if (!projectId || !UUID_RE.test(projectId)) {
      return { error: "Invalid project ID" }
    }

    // 1. Last audit entry where the actor is the current user AND the
    //    entity matches this project. Scope to this user so the card says
    //    "where YOU left off" not "where someone on the team left off".
    const { data: lastRows, error: lastErr } = await supabase
      .from("audit_log")
      .select("id, action, entity_type, entity_id, metadata, created_at")
      .eq("user_id", user.id)
      .eq("entity_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)

    if (lastErr) {
      console.error("[PROJECT-WORKSPACE] audit_log read failed:", lastErr.message)
      return { error: `Failed to load resume state: ${sanitizeErrorMessage(lastErr)}` }
    }

    const last = lastRows?.[0] ?? null

    // 2. Map the action string to a workspace surface. Unknown action → null
    //    (the UI falls back to "Welcome back — start with Brief" in that case).
    const lastSurface: ProjectResumeSurface | null = last
      ? mapActionToSurface(last.action, projectId)
      : null

    // 3. Blocker: the risks table does not yet exist. Return null so the UI
    //    renders the green "on-track" variant. When risks ships, replace this
    //    block with: SELECT * FROM risks WHERE project_id = $1 AND severity =
    //    'blocking' AND status = 'open' ORDER BY created_at DESC LIMIT 1.
    const blocker: ProjectResumeBlocker | null = null

    return {
      state: {
        lastTouched: last?.created_at ?? null,
        lastSurface,
        blocker,
      },
    }
  })
}

/**
 * Turns an audit-log `action` string into a friendly label + deep-link into
 * the V2 workspace. Unknown actions → null so callers can fall back cleanly.
 */
function mapActionToSurface(action: string, projectId: string): ProjectResumeSurface | null {
  const base = `/the-forge-v2/projects/${projectId}`
  // INTENT: tolerant matching — audit-log `action` strings are free-form today
  // and vary across server actions. Match on substrings rather than exact
  // equality so new action names land in the right bucket automatically.
  const a = action.toLowerCase()
  if (a.includes("research") || a.includes("brief")) return { label: "Brief", href: `${base}/brief` }
  if (a.includes("interface") || a.includes("module") || a.includes("decompos")) return { label: "Modules", href: `${base}/modules` }
  if (a.includes("bom") || a.includes("part")) return { label: "BOM", href: `${base}/bom` }
  if (a.includes("supplier") || a.includes("rfq") || a.includes("quote")) return { label: "Suppliers", href: `${base}/suppliers` }
  if (a.includes("cost")) return { label: "Cost", href: `${base}/cost` }
  if (a.includes("risk")) return { label: "Risks", href: `${base}/risks` }
  if (a.includes("geometry") || a.includes("cad") || a.includes("render")) return { label: "Geometry", href: `${base}/geometry` }
  return null
}

// ─── Activity-feed types ─────────────────────────────────────────────

export interface ActivityActor {
  name: string
  initials: string
  /** avatar_kind is a compact hint the UI uses to pick a default avatar colour.
   *  Falls back to "user" if we don't know anything more specific. */
  avatarKind: "user" | "specialist"
}

export interface ProjectActivityEvent {
  at: string
  who: ActivityActor
  /** Pre-rendered body (plain text). Linking is handled by the view where
   *  template-specific deep-links make sense. */
  body: string
}

// ─── Activity-feed action ────────────────────────────────────────────

/**
 * Returns up to `limit` most-recent audit_log rows scoped to the given
 * project, joined with profiles for actor name + avatar. Rows are rendered
 * into human-readable bodies using `renderActivityBody`.
 *
 * @param projectId - UUID of the cad_lab_projects row
 * @param limit     - Max number of rows (default 7, capped at 25)
 * @returns Ordered-newest-first activity list or an error
 *
 * @security RLS on audit_log limits rows to the user's foundry.
 */
export async function getProjectActivityFeed(
  projectId: string,
  limit = 7,
): Promise<{ events: ProjectActivityEvent[] } | { error: string }> {
  return withAuth(async ({ supabase }) => {
    if (!projectId || !UUID_RE.test(projectId)) {
      return { error: "Invalid project ID" }
    }

    const safeLimit = Math.min(Math.max(1, limit), 25)

    const { data, error } = await supabase
      .from("audit_log")
      .select(
        `id, action, entity_type, entity_id, metadata, created_at, user_id,
         profiles!audit_log_user_id_fkey(full_name, avatar_url)`,
      )
      .eq("entity_id", projectId)
      .order("created_at", { ascending: false })
      .limit(safeLimit)

    if (error) {
      console.error("[PROJECT-WORKSPACE] activity feed failed:", error.message)
      return { error: `Failed to load activity: ${sanitizeErrorMessage(error)}` }
    }

    const events: ProjectActivityEvent[] = (data ?? []).map((row) => {
      // profiles may come back as an object or an array depending on the join
      // shape. Normalise to a single record.
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
      const name = (profile?.full_name as string | null) ?? "Someone on your team"
      return {
        at: row.created_at as string,
        who: {
          name,
          initials: toInitials(name),
          avatarKind: "user",
        },
        body: renderActivityBody(row.action as string, row.metadata as Record<string, unknown> | null),
      }
    })

    return { events }
  })
}

/** Two-letter initials for an avatar fallback. */
function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Turns an audit-log action + metadata payload into a human-readable sentence.
 * Deliberately conservative — unknown action strings fall through to a
 * neutral rendering so new event names never produce `undefined` on screen.
 */
function renderActivityBody(action: string, metadata: Record<string, unknown> | null): string {
  const a = action.toLowerCase()
  const note = typeof metadata?.note === "string" ? metadata.note : null
  if (a.includes("research") || a.includes("brief")) return note ? `updated the Brief — ${note}` : "updated the Brief"
  if (a.includes("decompos") || a.includes("module")) return note ? `worked on modules — ${note}` : "updated the module decomposition"
  if (a.includes("interface")) return "updated the interface plan"
  if (a.includes("bom") || a.includes("part")) return note ? `updated the BOM — ${note}` : "updated the BOM"
  if (a.includes("supplier") || a.includes("rfq") || a.includes("quote")) return note ? `supplier update — ${note}` : "updated a supplier record"
  if (a.includes("cost")) return "updated the cost estimate"
  if (a.includes("risk")) return note ? `flagged a risk — ${note}` : "logged a risk"
  if (a.includes("render") || a.includes("geometry") || a.includes("cad")) return "updated geometry / renders"
  // Fallthrough: show the raw action verbatim, lowercased, so at least something
  // truthful lands on screen. This is an edge case — most production actions
  // will match one of the buckets above.
  return action.replace(/_/g, " ")
}
