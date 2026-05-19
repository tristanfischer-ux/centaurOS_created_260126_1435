"use server"

/**
 * @file brief-lock.ts — Server actions for locking / unlocking a CAD Lab
 *        project brief and loading its current lock state.
 *
 * @description Wave 1c of the V2 pipeline cutover. Replaces the in-memory
 * stub that lived in `lock-button.tsx` with a persisted lock event that:
 *
 *   1. Verifies foundry ownership of the project.
 *   2. Verifies a brief exists (research.report ≥ 200 chars) — otherwise
 *      the lock is refused with `NO_BRIEF_TO_LOCK` so the UI routes the
 *      founder back to the brief editor instead of locking an empty shell.
 *   3. Writes a new row to `brief_revisions` with `locked_at` set and the
 *      next revision_number. Writing the row atomically bumps the design
 *      history forward — founders can read the trail via the Revisions page.
 *   4. Sets `cad_lab_projects.brief_locked_at` + `brief_locked_by` +
 *      `design_revision` so every other page on the project sees the
 *      lock without having to join through `brief_revisions`.
 *   5. Writes an `audit_log` row keyed `cad_lab_project.brief_locked` so
 *      security / compliance has a timestamped, author-attributed record
 *      of the handoff.
 *   6. Fires `runMaxDecomposition(projectId, "auto.brief-lock")` as a
 *      fire-and-forget side-effect. The founder sees the lock succeed
 *      immediately; Max's decomposition run races ahead in the background
 *      and writes its own `pipeline_runs` row the Modules / Workspace
 *      pages already render a chip for.
 *
 * Concurrency model: the `brief_revisions` insert is the serialisation
 * point. `revision_number` has a unique constraint per `(project_id,
 * revision_number)`, so two parallel lock clicks race on the insert —
 * the loser gets a duplicate-key error and we bubble it back as
 * `ALREADY_LOCKED` instead of double-firing Max.
 *
 * @related
 *   - Pre-read: /tmp/forge-v2-pipeline-arch/PIPELINE-ARCHITECTURE.md §7
 *   - Orchestrator kicked off on success: src/actions/specialists/run-max-decomposition.ts
 *   - UI consumers:
 *       - src/app/(platform)/the-forge-v2/projects/[id]/brief-lock/_components/lock-button.tsx
 *       - src/app/(platform)/the-forge-v2/projects/[id]/brief-lock/page.tsx
 *       - src/app/(platform)/the-forge-v2/projects/[id]/workspace-view.tsx
 */

import { after } from "next/server"

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"
import { runPreflightOracle } from "@/lib/forge-v2/preflight-oracle"
import type { BriefInput } from "@/lib/forge-v2/preflight-oracle"
import { gate1Check, buildGate1Input } from "@/lib/forge-v2/stage-gates/gate-1"
import type { CadLabDesignBrief } from "@/lib/cad-lab-types"
import type { DimensionSheet } from "@/lib/sizing/types"

// ─── Types ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Minimum character count on `research.report` before a brief is considered
 *  substantive enough to lock. Matches the precondition enforced by
 *  `runMaxDecomposition` so we don't lock a brief Max will immediately
 *  refuse to decompose. */
const MIN_BRIEF_REPORT_CHARS = 200

/** Union of possible error codes the caller can switch on for copy. */
export type BriefLockErrorCode =
    | "PROJECT_NOT_FOUND"
    | "PROJECT_FORBIDDEN"
    | "NO_BRIEF_TO_LOCK"
    | "ALREADY_LOCKED"
    | "NOT_LOCKED"
    | "INVALID_PROJECT_ID"
    | "PREFLIGHT_BLOCKED"
    | "GATE_1_BLOCKED"
    | "INTERNAL"

export type BriefLockResult =
    | { ok: true; lockedAt: string; revisionNumber: number }
    | { ok: false; error: string; errorCode?: BriefLockErrorCode }

export interface BriefLockStatus {
    isLocked: boolean
    lockedAt: string | null
    /** Profile UUID of the locking user — null while draft. */
    lockedBy: string | null
    revisionNumber: number | null
    /** Human-friendly label e.g. "Rev A". Null when no revision exists yet. */
    revisionLabel: string | null
}

// ─── lockCadLabBrief ───────────────────────────────────────────────────

/**
 * Locks the current brief on a CAD Lab project.
 *
 * See file header for the full flow. Returns `{ ok: true, lockedAt,
 * revisionNumber }` on success; returns `{ ok: false, error, errorCode }`
 * with an explicit error code on every failure path so the UI can route
 * the founder to the right remediation without needing to parse the
 * message string.
 */
export async function lockCadLabBrief(projectId: string): Promise<BriefLockResult> {
    return withAuth<BriefLockResult>(async ({ user, foundryId }) => {
        if (!projectId || !UUID_RE.test(projectId)) {
            return {
                ok: false,
                error: "Invalid project ID",
                errorCode: "INVALID_PROJECT_ID",
            }
        }

        // INTENT: We reach for the admin client here (and in unlock / load)
        // because the pipeline row inserts on `brief_revisions` are RLS-
        // guarded and the `withAuth` wrapper has already vouched for the
        // caller's foundryId. Every query re-verifies `foundry_id ===
        // foundryId` so we never leak or mutate outside the caller's
        // tenant even if RLS were to regress.
        const admin = createAdminClient()

        // ── 1. Load + verify project ownership ────────────────────────
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, subject, research, brief_locked_at, design_revision, dimension_sheet")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            console.error("[brief-lock] project lookup failed:", projectErr.message)
            return {
                ok: false,
                error: "Couldn't load the project.",
                errorCode: "INTERNAL",
            }
        }

        if (!project) {
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }

        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak the existence of other-foundry projects.
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        // ── 2. Idempotency — refuse re-lock on an already-locked brief.
        //      The unlock path is the deliberate way to move forward; a
        //      silent re-lock here would clobber `lockedAt` and double-
        //      trigger Max.
        if (project.brief_locked_at) {
            return {
                ok: false,
                error: "This brief is already locked. Create a new revision to revise it.",
                errorCode: "ALREADY_LOCKED",
            }
        }

        // ── 3. Precondition: research.report must exist + be substantive.
        //      A brief that doesn't have a research report won't decompose
        //      (see run-max-decomposition.ts) — locking in that state would
        //      trap the founder on a page that looks locked but produces
        //      nothing. Refuse up front and route them to research.
        const research = (project.research ?? null) as
            | { report?: unknown }
            | null
        const report =
            research && typeof research.report === "string" ? research.report : ""
        if (!report || report.trim().length < MIN_BRIEF_REPORT_CHARS) {
            return {
                ok: false,
                error:
                    "Add research to the brief before locking — Max needs something to decompose.",
                errorCode: "NO_BRIEF_TO_LOCK",
            }
        }

        // ── 3b. Pre-flight physics oracle — run BEFORE the pipeline starts.
        //       A 100ms deterministic check that catches obvious physics
        //       violations (e.g. HAPS solar cost 14×–32× the brief ceiling)
        //       without invoking any LLM. If the oracle blocks, we persist the
        //       verdict to feasibility_verdict, stamp the autopilot_state to
        //       'preflight_blocked', and return PREFLIGHT_BLOCKED to the UI.
        //
        //       The oracle is ADVISORY on unknown domains (it will pass with a
        //       warning). It only blocks when it finds a clear physics violation
        //       in a recognised domain. Unknown domains are not blocked — we
        //       never want to accidentally prevent a valid brief from locking.
        {
            const subject = typeof project.subject === "string" ? project.subject : ""
            const designBrief = (research as { designBrief?: BriefInput["designBrief"] } | null)?.designBrief

            const briefForOracle: BriefInput = {
                subject,
                reportText: typeof report === "string" ? report : undefined,
                designBrief: designBrief ?? undefined,
            }
            const preflightVerdict = runPreflightOracle(briefForOracle)

            if (!preflightVerdict.passed) {
                console.warn(
                    `[brief-lock] preflight BLOCKED project=${projectId} domain=${preflightVerdict.domain}`,
                    preflightVerdict.blockers.map(b => `${b.axis}: ${b.explanation}`).join("; "),
                )

                // Persist the verdict to feasibility_verdict so the UI can
                // surface the blockers without a separate fetch.
                await admin
                    .from("cad_lab_projects")
                    .update({ feasibility_verdict: preflightVerdict as never })
                    .eq("id", projectId)
                    .eq("foundry_id", foundryId)

                // Build a human-readable summary for the error message.
                const blockerSummary = preflightVerdict.blockers
                    .map(b => b.explanation)
                    .join(" | ")

                return {
                    ok: false,
                    error: `This brief cannot run: ${blockerSummary}`,
                    errorCode: "PREFLIGHT_BLOCKED",
                }
            }
            // Oracle passed — proceed to lock. Persist the verdict (with warnings)
            // for observability even on a pass.
            await admin
                .from("cad_lab_projects")
                .update({ feasibility_verdict: preflightVerdict as never })
                .eq("id", projectId)
                .eq("foundry_id", foundryId)
        }

        // ── 3c. Gate 1 — deterministic numeric/unit extraction check.
        //        Catches the failure mode: founder types "1.5 MW", Chase
        //        interprets "100 kW" — a 15× mismatch that silently corrupts
        //        the entire downstream pipeline.
        //
        //        This runs AFTER the preflight oracle (which checks physics
        //        feasibility) and BEFORE the revision is inserted (so no
        //        pipeline work ever starts on a mismatched brief).
        //
        //        Gate 1 is DETERMINISTIC — zero LLM calls, ~1ms.
        //        It only blocks on ≥3× factor mismatches. Within-10% drifts
        //        produce warnings that are persisted but do NOT block locking.
        {
            const gate1Research = (research ?? null) as
                | { report?: unknown; designBrief?: CadLabDesignBrief }
                | null
            const gate1Sheet = (project.dimension_sheet ?? null) as DimensionSheet | null
            const gate1Input = buildGate1Input(gate1Research, gate1Sheet)
            const gate1Verdict = gate1Check(gate1Input)

            // Persist verdict (pass or fail) for UI / audit visibility.
            // Nest under feasibility_verdict.gate_1_check to avoid clobbering
            // the preflight_oracle verdict that may already be there.
            try {
                const { data: existingVerdictRow } = await admin
                    .from("cad_lab_projects")
                    .select("feasibility_verdict")
                    .eq("id", projectId)
                    .maybeSingle()
                const existingVerdict =
                    (existingVerdictRow?.feasibility_verdict as Record<string, unknown> | null) ?? {}
                await admin
                    .from("cad_lab_projects")
                    .update({
                        feasibility_verdict: {
                            ...existingVerdict,
                            gate_1_check: gate1Verdict,
                        } as never,
                    })
                    .eq("id", projectId)
                    .eq("foundry_id", foundryId)
            } catch (persistErr) {
                // Non-fatal — the verdict write failing must not block locking.
                console.error(
                    "[brief-lock] gate-1 verdict persist failed (non-fatal):",
                    persistErr instanceof Error ? persistErr.message : persistErr,
                )
            }

            if (!gate1Verdict.passed) {
                const blockerSummary = gate1Verdict.blockers
                    .map((b) => b.explanation)
                    .join(" | ")
                console.warn(
                    `[brief-lock] gate-1 BLOCKED project=${projectId}`,
                    gate1Verdict.blockers.map((b) => `${b.axis}: factor=${b.factor_off.toFixed(1)}`).join("; "),
                )
                return {
                    ok: false,
                    error: `Brief interpretation mismatch: ${blockerSummary}`,
                    errorCode: "GATE_1_BLOCKED",
                }
            }

            if (gate1Verdict.warnings.length > 0) {
                console.info(
                    `[brief-lock] gate-1 PASS (with ${gate1Verdict.warnings.length} warnings) project=${projectId}`,
                    gate1Verdict.warnings.map((w) => `${w.axis}: ${w.explanation}`).join("; "),
                )
            }
        }

        // ── 4. Determine the revision we're locking. Two cases:
        //        (a) No revisions row exists yet — the brief has never been
        //            versioned. Insert Rev 1 with locked_at set.
        //        (b) A newest revisions row exists already (e.g. created on
        //            unlock as a draft for the next iteration). Update that
        //            row in place so locked_at flips from null → now. We do
        //            NOT mint a new revision number on lock; the number
        //            only advances on unlock. This keeps "Lock Rev B" and
        //            "Rev B is locked" aligned across the UI.
        const { data: latestRev, error: latestErr } = await admin
            .from("brief_revisions")
            .select("id, revision_number, locked_at")
            .eq("project_id", projectId)
            .order("revision_number", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (latestErr) {
            console.error(
                "[brief-lock] latest revision lookup failed:",
                latestErr.message,
            )
            return {
                ok: false,
                error: "Couldn't read the revision history.",
                errorCode: "INTERNAL",
            }
        }

        const lockedAtIso = new Date().toISOString()
        let revisionNumber: number
        let revisionLabel: string

        if (latestRev && latestRev.locked_at === null) {
            // Case (b) — there's a draft revision waiting to be locked.
            revisionNumber = latestRev.revision_number
            revisionLabel = revisionNumberToLabel(revisionNumber)
            const { error: updateRevErr } = await admin
                .from("brief_revisions")
                .update({
                    locked_at: lockedAtIso,
                    locked_by: user.id,
                    revision_label: revisionLabel,
                })
                .eq("id", latestRev.id)
                // Guard against lost-update race: only flip if still unlocked.
                .is("locked_at", null)
            if (updateRevErr) {
                console.error(
                    "[brief-lock] lock existing revision failed:",
                    updateRevErr.message,
                )
                return {
                    ok: false,
                    error: `Couldn't lock the brief: ${sanitizeErrorMessage(updateRevErr)}`,
                    errorCode: "INTERNAL",
                }
            }
        } else {
            // Case (a) — either no revisions yet, OR the newest is already
            // locked (paranoia path; ALREADY_LOCKED above should have caught
            // this, but we re-check here to stay consistent if project row
            // drifted from the history). Start / continue the sequence.
            const baselineRevision = Math.max(
                typeof latestRev?.revision_number === "number" ? latestRev.revision_number : 0,
                typeof project.design_revision === "number" ? project.design_revision : 0,
            )
            revisionNumber = baselineRevision < 1 ? 1 : baselineRevision
            revisionLabel = revisionNumberToLabel(revisionNumber)
            const { error: insertErr } = await admin
                .from("brief_revisions")
                .insert({
                    foundry_id: foundryId,
                    project_id: projectId,
                    revision_number: revisionNumber,
                    revision_label: revisionLabel,
                    locked_at: lockedAtIso,
                    locked_by: user.id,
                    // `summary` defaults to empty string server-side; the
                    // Revisions page renders "Locked without note" until we
                    // add a textarea to the lock CTA.
                })

            if (insertErr) {
                // SECURITY: distinguish "already locked" (unique violation,
                // SQLSTATE 23505) from other failures so the UI doesn't
                // suggest retrying a request that is, in fact, idempotent.
                const isDuplicateKey =
                    typeof insertErr.code === "string" && insertErr.code === "23505"
                console.error(
                    "[brief-lock] insert revision failed:",
                    insertErr.message,
                )
                return {
                    ok: false,
                    error: isDuplicateKey
                        ? "This brief has just been locked — reload to see the latest state."
                        : `Couldn't lock the brief: ${sanitizeErrorMessage(insertErr)}`,
                    errorCode: isDuplicateKey ? "ALREADY_LOCKED" : "INTERNAL",
                }
            }
        }

        const nextRevisionNumber = revisionNumber
        const nextRevisionLabel = revisionLabel

        // ── 6. Stamp the project row so every page reads lock state
        //      without joining `brief_revisions`. We also bump
        //      `design_revision` — this is the "current revision" the rest
        //      of the app keys off.
        const { error: updateErr } = await admin
            .from("cad_lab_projects")
            .update({
                brief_locked_at: lockedAtIso,
                brief_locked_by: user.id,
                design_revision: nextRevisionNumber,
            })
            .eq("id", projectId)
            .eq("foundry_id", foundryId)

        if (updateErr) {
            // The revision row already landed — we'd rather not roll it
            // back and risk leaving the DB in a worse state. Surface the
            // inconsistency instead so Tristan can spot it in logs.
            console.error(
                "[brief-lock] project stamp failed (revision row already persisted):",
                updateErr.message,
            )
            return {
                ok: false,
                error: "Brief locked but project metadata didn't update. Reload.",
                errorCode: "INTERNAL",
            }
        }

        // ── 7. Audit log. Fire-and-forget — a logging failure must not
        //      prevent the lock from succeeding for the founder. The
        //      `AuditAction` union in `audit.ts` doesn't include this
        //      action yet, so we write the row directly rather than
        //      widen a shared type in a sub-agent lane.
        try {
            await admin.from("audit_log").insert({
                foundry_id: foundryId,
                user_id: user.id,
                action: "cad_lab_project.brief_locked",
                entity_type: "cad_lab_project",
                entity_id: projectId,
                section: "forge",
                metadata: {
                    revisionNumber: nextRevisionNumber,
                    revisionLabel: nextRevisionLabel,
                    lockedAt: lockedAtIso,
                },
            })
        } catch (auditErr) {
            console.error(
                "[brief-lock] audit log write failed (non-fatal):",
                auditErr instanceof Error ? auditErr.message : auditErr,
            )
        }

        // ── 8. Fire Max's decomposition as post-response work via after().
        //      The founder sees the lock succeed immediately; Max's run
        //      lands asynchronously and surfaces via pipeline_runs on the
        //      Modules / Workspace pages.
        //
        //      TRIED: plain `void runMaxDecomposition(...)` fire-and-forget.
        //      Problem: Vercel terminates the serverless container as soon
        //      as the outer server action's Promise resolves — Max's run
        //      gets its pipeline_runs row written but the container is torn
        //      down before skeletonDecompose returns, leaving the row
        //      stuck in 'running' until the watchdog sweeps it (6+ min).
        //      Evidence: project bb371c71 sat stuck for 36 min after lock
        //      on 2026-04-21; same failure mode as project 8c3e08f0 before
        //      createCadLabProject was switched to after() for Chase.
        //
        //      Dynamic import avoids a circular "use server" init cycle
        //      between brief-lock and run-max-decomposition.
        //
        //      GOTCHA (P0.2): use the Background variant — this runs in an
        //      after() post-response context where cookies are unavailable,
        //      so the withAuth-wrapped runMaxDecomposition would return
        //      "Unauthorized". foundryId + user.id come from the outer
        //      withAuth closure so we plumb them explicitly.
        const capturedFoundryId = foundryId
        const capturedUserId = user.id
        after(async () => {
            try {
                const { runMaxDecompositionBackground } = await import(
                    "@/actions/specialists/run-max-decomposition"
                )
                await runMaxDecompositionBackground(
                    projectId,
                    capturedFoundryId,
                    capturedUserId,
                    "auto.brief-lock",
                )
            } catch (err) {
                console.error(
                    "[brief-lock] auto-trigger Max failed (non-fatal for lock):",
                    err instanceof Error ? err.message : err,
                )
                // pipeline_runs will show the failure with errorCode=INTERNAL
                // for observability — the founder's lock still succeeded.
            }
        })

        return {
            ok: true,
            lockedAt: lockedAtIso,
            revisionNumber: nextRevisionNumber,
        }
    })
}

// ─── unlockCadLabBrief ─────────────────────────────────────────────────

/**
 * Reverses a lock by clearing `brief_locked_at` / `brief_locked_by` on the
 * project and inserting a new (unlocked) revision row — Rev D → Rev E.
 * The historical locked revision is kept as an audit artefact; this is
 * the only correct "unlock" shape because downstream artefacts (BOM,
 * suppliers) anchor to revision numbers, not timestamps.
 *
 * Distinct from a full project fork — a fork is a new project; an unlock
 * is the same project moving to the next draft revision.
 */
export async function unlockCadLabBrief(projectId: string): Promise<BriefLockResult> {
    return withAuth<BriefLockResult>(async ({ user, foundryId }) => {
        if (!projectId || !UUID_RE.test(projectId)) {
            return {
                ok: false,
                error: "Invalid project ID",
                errorCode: "INVALID_PROJECT_ID",
            }
        }

        const admin = createAdminClient()

        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, brief_locked_at, design_revision")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            console.error("[brief-lock:unlock] project lookup failed:", projectErr.message)
            return {
                ok: false,
                error: "Couldn't load the project.",
                errorCode: "INTERNAL",
            }
        }
        if (!project) {
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }
        if (project.foundry_id !== foundryId) {
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }
        if (!project.brief_locked_at) {
            return {
                ok: false,
                error: "This brief isn't locked — nothing to unlock.",
                errorCode: "NOT_LOCKED",
            }
        }

        // Determine next revision number from history.
        const { data: latestRev, error: latestErr } = await admin
            .from("brief_revisions")
            .select("revision_number")
            .eq("project_id", projectId)
            .order("revision_number", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (latestErr) {
            console.error(
                "[brief-lock:unlock] latest revision lookup failed:",
                latestErr.message,
            )
            return {
                ok: false,
                error: "Couldn't read the revision history.",
                errorCode: "INTERNAL",
            }
        }

        const currentRevision = Math.max(
            typeof latestRev?.revision_number === "number" ? latestRev.revision_number : 0,
            typeof project.design_revision === "number" ? project.design_revision : 0,
        )
        const nextRevisionNumber = currentRevision + 1
        const nextRevisionLabel = revisionNumberToLabel(nextRevisionNumber)
        const unlockedAtIso = new Date().toISOString()

        // Insert a new, UNlocked revision (locked_at = null) so the
        // revision history shows Rev D (locked) → Rev E (draft).
        const { error: insertErr } = await admin
            .from("brief_revisions")
            .insert({
                foundry_id: foundryId,
                project_id: projectId,
                revision_number: nextRevisionNumber,
                revision_label: nextRevisionLabel,
                locked_at: null,
                locked_by: null,
            })

        if (insertErr) {
            console.error(
                "[brief-lock:unlock] insert draft revision failed:",
                insertErr.message,
            )
            return {
                ok: false,
                error: `Couldn't open the new revision: ${sanitizeErrorMessage(insertErr)}`,
                errorCode: "INTERNAL",
            }
        }

        // Clear the lock stamp on the project.
        const { error: updateErr } = await admin
            .from("cad_lab_projects")
            .update({
                brief_locked_at: null,
                brief_locked_by: null,
                design_revision: nextRevisionNumber,
            })
            .eq("id", projectId)
            .eq("foundry_id", foundryId)

        if (updateErr) {
            console.error(
                "[brief-lock:unlock] project unstamp failed (revision row already persisted):",
                updateErr.message,
            )
            return {
                ok: false,
                error: "New revision opened but project state didn't update. Reload.",
                errorCode: "INTERNAL",
            }
        }

        try {
            await admin.from("audit_log").insert({
                foundry_id: foundryId,
                user_id: user.id,
                action: "cad_lab_project.brief_unlocked",
                entity_type: "cad_lab_project",
                entity_id: projectId,
                section: "forge",
                metadata: {
                    revisionNumber: nextRevisionNumber,
                    revisionLabel: nextRevisionLabel,
                    unlockedAt: unlockedAtIso,
                },
            })
        } catch (auditErr) {
            console.error(
                "[brief-lock:unlock] audit log write failed (non-fatal):",
                auditErr instanceof Error ? auditErr.message : auditErr,
            )
        }

        return {
            ok: true,
            lockedAt: unlockedAtIso,
            revisionNumber: nextRevisionNumber,
        }
    })
}

// ─── loadBriefLockStatus ───────────────────────────────────────────────

/**
 * Reads the current lock state for a project. Used by the brief-lock page
 * (to choose between the "draft → confirm" view and the "already locked"
 * banner) and by the workspace header badge. Foundry-scoped; returns
 * unlocked defaults (all null) if the caller can't see the project.
 */
export async function loadBriefLockStatus(
    projectId: string,
): Promise<BriefLockStatus> {
    return withAuth<BriefLockStatus>(async ({ foundryId }) => {
        const empty: BriefLockStatus = {
            isLocked: false,
            lockedAt: null,
            lockedBy: null,
            revisionNumber: null,
            revisionLabel: null,
        }
        if (!projectId || !UUID_RE.test(projectId)) {
            return empty
        }

        const admin = createAdminClient()

        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, brief_locked_at, brief_locked_by, design_revision")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr || !project) {
            if (projectErr) {
                console.error(
                    "[brief-lock:status] project lookup failed:",
                    projectErr.message,
                )
            }
            return empty
        }

        if (project.foundry_id !== foundryId) {
            // SECURITY: silent empty state rather than leaking existence.
            return empty
        }

        const { data: latestRev } = await admin
            .from("brief_revisions")
            .select("revision_number")
            .eq("project_id", projectId)
            .order("revision_number", { ascending: false })
            .limit(1)
            .maybeSingle()

        const revisionNumber =
            typeof latestRev?.revision_number === "number"
                ? latestRev.revision_number
                : typeof project.design_revision === "number"
                    ? project.design_revision
                    : null

        const revisionLabel =
            typeof revisionNumber === "number" ? revisionNumberToLabel(revisionNumber) : null

        return {
            isLocked: project.brief_locked_at !== null,
            lockedAt: (project.brief_locked_at as string | null) ?? null,
            lockedBy: (project.brief_locked_by as string | null) ?? null,
            revisionNumber,
            revisionLabel,
        }
    })
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** 1 → "Rev A", 2 → "Rev B", ... 26 → "Rev Z", 27+ → "Rev 27" etc. */
function revisionNumberToLabel(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "Rev 1"
    if (n > 26) return `Rev ${n}`
    return `Rev ${String.fromCharCode(64 + n)}`
}
