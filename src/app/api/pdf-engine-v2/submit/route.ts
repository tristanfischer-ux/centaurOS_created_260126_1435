/**
 * @file api/pdf-engine-v2/submit/route.ts — A1-minimal job submission endpoint.
 *
 * POST body: {
 *   brief_text: string,
 *   project_id?: string,
 *   project_name?: string,
 *   variations?: Array<{ label: string, brief_override?: string }>
 * }
 *
 * Behaviour:
 *   1. Verify authenticated user via withUser.
 *   2. If project_id is omitted, create a new cad_lab_projects row for this
 *      founder's foundry. If project_id is given, verify it belongs to a
 *      foundry the caller is a member of.
 *   3. Insert ONE parent pdf_engine_runs row with status='pending'. When
 *      variations are given, ALSO insert N child rows with variation_of =
 *      parent.id, one per variation, all status='pending'. The worker
 *      picks each up independently.
 *   4. Return { job_id, project_id, variation_job_ids }.
 *
 * The Mac Studio worker polls pdf_engine_runs and picks up pending rows.
 *
 * Variation semantics — kept deliberately simple:
 *   • The parent row IS itself a runnable job. Its brief_text is the base brief.
 *   • Each variation child row reads its parent's brief_text + appends a
 *     "Variant focus: <label>" line plus the brief_override (if given).
 *   • Up to 5 variations per submission. Each variation costs ~£2-5 of LLM.
 *     If the founder wants more they can submit a fresh brief.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { withUser } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VARIATION_SCHEMA = z.object({
    label: z.string().trim().min(1).max(80),
    brief_override: z.string().trim().max(8_000).optional(),
})

const BODY = z.object({
    brief_text: z.string().trim().min(20).max(20_000),
    project_id: z.string().uuid().optional(),
    project_name: z.string().trim().min(1).max(120).optional(),
    variations: z.array(VARIATION_SCHEMA).max(5).optional(),
})

/**
 * P3-1 (2026-05-23): pre-parser brief sanitisation. The brief is forwarded
 * verbatim into LLM prompts (Stage 1 parser, Stage 3 research, etc.). A
 * malicious user could inject prompt-overriding markers like </SYSTEM>,
 * [INST], <|im_start|> to break out of the wrapper prompt. Today the risk
 * is theoretical (LLM-only consumption, no data exfiltration possible) but
 * adding a defensive sanitiser is cheap insurance.
 *
 * Strategy: strip control characters (except \n \r \t), escape known
 * prompt-control tokens by zero-width inserting a non-printing char, drop
 * the trailing instruction-cancel patterns. We deliberately do NOT
 * regex-strip because that would mangle legitimate engineering text that
 * happens to use words like "system" or "instruction".
 */
function sanitiseBrief(s: string): string {
    let out = s
    // Strip control chars except \n \r \t
    out = out.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // Defang prompt-control tokens by inserting a zero-width-joiner so they
    // don't tokenise as control markers in the LLM context, but the visible
    // text remains intact for the reader.
    const ZWJ = '‍'
    const CONTROL_TOKENS = [
        /<\/?\s*SYSTEM\s*>/gi,
        /<\/?\s*ASSISTANT\s*>/gi,
        /<\/?\s*USER\s*>/gi,
        /\[\s*INST\s*\]/gi,
        /\[\s*\/\s*INST\s*\]/gi,
        /<\|im_start\|>/gi,
        /<\|im_end\|>/gi,
        /Ignore\s+(all\s+)?previous\s+instructions/gi,
        /Disregard\s+(all\s+)?(prior|previous)\s+(instructions|context)/gi,
    ]
    for (const re of CONTROL_TOKENS) {
        out = out.replace(re, (match) => match.split('').join(ZWJ))
    }
    return out
}

interface SubmitOk {
    job_id: string
    project_id: string
    /** Empty when no variations were requested; otherwise N child job ids. */
    variation_job_ids: string[]
}

interface SubmitErr {
    error: string
}

export async function POST(
    request: Request,
): Promise<NextResponse<SubmitOk | SubmitErr>> {
    let raw: unknown
    try {
        raw = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = BODY.safeParse(raw)
    if (!parsed.success) {
        return NextResponse.json(
            {
                error:
                    "Invalid body: " +
                    parsed.error.issues
                        .map((i) => `${i.path.join(".")} ${i.message}`)
                        .join(", "),
            },
            { status: 400 },
        )
    }
    const rawData = parsed.data
    // P3-1: sanitise before insert (defang prompt-injection markers)
    const brief_text = sanitiseBrief(rawData.brief_text)
    const { project_id, project_name, variations } = rawData

    // Sanity-check label uniqueness when variations supplied. Duplicates make
    // the download UI ambiguous, and the worker uses label in its child brief.
    if (variations && variations.length > 0) {
        const labels = new Set<string>()
        for (const v of variations) {
            const k = v.label.toLowerCase()
            if (labels.has(k)) {
                return NextResponse.json(
                    { error: `Duplicate variation label: "${v.label}"` },
                    { status: 400 },
                )
            }
            labels.add(k)
        }
    }

    return withUser(async ({ user }) => {
        const admin = createAdminClient()

        // Foundry context for the writer. Required to create a new
        // cad_lab_projects row (foundry_id NOT NULL).
        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return NextResponse.json(
                { error: "User is not a member of any foundry" },
                { status: 403 },
            )
        }

        // P3-2 (2026-05-23): rate-limit briefs per founder per hour. Each
        // chain takes 5-15 min and burns ~£0.30-£0.80 of LLM cost; flooding
        // the queue from one founder would starve others + spike the bill.
        // Cap at 12 briefs/hour/foundry (one every 5 min, generous for
        // genuine iteration). Reads pdf_engine_runs.created_at directly to
        // avoid maintaining a separate quota table.
        const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        const { count: recentRunCount, error: countErr } = await admin
            .from('pdf_engine_runs')
            .select('id', { count: 'exact', head: true })
            .eq('foundry_id', foundryId)
            .gte('created_at', oneHourAgoIso)
        if (countErr) {
            console.error('[submit] rate-limit count query failed:', countErr.message)
            // Fail open — better to allow the brief through than block on a
            // count query glitch. The rare flood case is bounded by the
            // founder paying for it.
        } else if ((recentRunCount ?? 0) >= 12) {
            return NextResponse.json(
                {
                    error:
                        `Brief rate limit reached for this foundry (12/hour). ` +
                        `You have ${recentRunCount} runs in the last hour. Try again later.`,
                },
                { status: 429 },
            )
        }

        let resolvedProjectId: string | null = null

        if (project_id) {
            // Verify the project belongs to the caller's foundry. Admin client
            // bypasses RLS so we must filter explicitly.
            const { data: proj, error: projErr } = await admin
                .from("cad_lab_projects")
                .select("id, foundry_id")
                .eq("id", project_id)
                .maybeSingle()
            if (projErr || !proj || proj.foundry_id !== foundryId) {
                return NextResponse.json(
                    { error: "Project not found" },
                    { status: 404 },
                )
            }
            resolvedProjectId = proj.id as string
        } else {
            // Create a new cad_lab_projects row. The "subject" column is NOT
            // NULL — use the first 120 chars of the brief as a placeholder.
            const subject =
                brief_text.replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled brief"
            const name =
                (project_name && project_name.trim()) ||
                subject.slice(0, 80) ||
                "Untitled project"

            const { data: created, error: createErr } = await admin
                .from("cad_lab_projects")
                .insert({
                    foundry_id: foundryId,
                    created_by: user.id,
                    name,
                    subject,
                    model_id: "pdf-engine-v2",
                    stage: "design",
                    status: "draft",
                    batch_status: "idle",
                    founder_raw_brief: brief_text,
                })
                .select("id")
                .single()

            if (createErr || !created) {
                return NextResponse.json(
                    {
                        error:
                            "Failed to create project: " +
                            (createErr?.message ?? "unknown"),
                    },
                    { status: 500 },
                )
            }
            resolvedProjectId = created.id as string
        }

        // Insert the parent pdf_engine_runs row. Worker will pick this up.
        // When variations are supplied, the parent row stores them as jsonb so
        // the download UI can show "this is variant 0 of N" siblings without
        // recomputing.
        const parentInsert: Record<string, unknown> = {
            project_id: resolvedProjectId,
            user_id: user.id,
            brief_text,
            status: "pending",
        }
        if (variations && variations.length > 0) {
            parentInsert.variations = variations
        }
        const { data: run, error: runErr } = await admin
            .from("pdf_engine_runs")
            .insert(parentInsert)
            .select("id")
            .single()

        if (runErr || !run) {
            return NextResponse.json(
                { error: "Failed to queue run: " + (runErr?.message ?? "unknown") },
                { status: 500 },
            )
        }
        const parentJobId = run.id as string

        // Spawn variation child rows (status='pending'). They share the parent's
        // project_id and user_id; the worker reads variation_of+variation_label
        // to compose the effective brief. brief_text on the child holds the
        // pre-composed effective brief so the worker doesn't have to re-fetch.
        const variationJobIds: string[] = []
        if (variations && variations.length > 0) {
            const childRows = variations.map((v) => ({
                project_id: resolvedProjectId,
                user_id: user.id,
                brief_text: composeVariationBrief(brief_text, v),
                status: "pending" as const,
                variation_of: parentJobId,
                variation_label: v.label,
            }))
            const { data: children, error: childErr } = await admin
                .from("pdf_engine_runs")
                .insert(childRows)
                .select("id")

            if (childErr || !children) {
                // Parent row already inserted — leave it. Surface the error so
                // the founder retries the variations rather than the parent.
                return NextResponse.json(
                    {
                        error:
                            "Parent run queued but variations failed: " +
                            (childErr?.message ?? "unknown"),
                    },
                    { status: 500 },
                )
            }
            for (const c of children) variationJobIds.push(c.id as string)
        }

        return NextResponse.json({
            job_id: parentJobId,
            project_id: resolvedProjectId,
            variation_job_ids: variationJobIds,
        })
    })
}

/**
 * Build the effective brief for a variation child. Format chosen to be
 * deterministic and obvious to the LLM at Stage 0 parse:
 *
 *     <base brief>
 *
 *     Variant focus: <label>
 *
 *     <brief_override>
 *
 * The label always shows up so the LLM can route. The override (when present)
 * is meant to be additive content like "size for 5 MWh nameplate" — NOT a full
 * replacement brief. We do not splice tokens; we append.
 */
function composeVariationBrief(
    baseBrief: string,
    variation: { label: string; brief_override?: string },
): string {
    const trimmed = baseBrief.trimEnd()
    const labelLine = `Variant focus: ${variation.label}`
    const override = variation.brief_override?.trim()
    if (override && override.length > 0) {
        return `${trimmed}\n\n${labelLine}\n\n${override}`
    }
    return `${trimmed}\n\n${labelLine}`
}
