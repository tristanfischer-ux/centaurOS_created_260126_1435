/**
 * @file api/pdf-engine-v2/status/[id]/route.ts — A1-minimal status poller.
 *
 * GET /api/pdf-engine-v2/status/<run_id>
 *
 * Behaviour:
 *   1. Verify authenticated user.
 *   2. Load the pdf_engine_runs row. RLS guards owner access through the
 *      authenticated client; service-role admin client is used to fetch
 *      auxiliary fields with the explicit user_id filter.
 *   3. If status='ready' and pdf_storage_path is set, mint a fresh signed
 *      URL (1-hour expiry) against the pdf-engine-pdfs bucket.
 *   4. Return a compact JSON payload that the wait page polls every 5s.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { withUser } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SIGNED_URL_TTL_SECONDS = 60 * 60

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PARAMS_SCHEMA = z.object({
    id: z.string().regex(UUID_RE, "invalid run id"),
})

interface StatusOk {
    status: "pending" | "running" | "ready" | "failed"
    started_at: string | null
    ready_at: string | null
    pdf_signed_url: string | null
    error_log: string | null
    brief_text: string
    project_id: string | null
}

interface StatusErr {
    error: string
}

export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
): Promise<NextResponse<StatusOk | StatusErr>> {
    const params = await context.params
    const parsed = PARAMS_SCHEMA.safeParse(params)
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid run id" }, { status: 400 })
    }
    const runId = parsed.data.id

    return withUser(async ({ user }) => {
        const admin = createAdminClient()

        const { data: run, error: runErr } = await admin
            .from("pdf_engine_runs")
            .select(
                "id, user_id, project_id, brief_text, status, started_at, ready_at, pdf_storage_path, error_log",
            )
            .eq("id", runId)
            .maybeSingle()

        if (runErr || !run || run.user_id !== user.id) {
            // Same response whether the row is missing or belongs to another
            // user — don't leak existence.
            return NextResponse.json({ error: "Not found" }, { status: 404 })
        }

        let pdfSignedUrl: string | null = null
        if (run.status === "ready" && typeof run.pdf_storage_path === "string") {
            try {
                const { data: signed } = await admin.storage
                    .from("pdf-engine-pdfs")
                    .createSignedUrl(run.pdf_storage_path, SIGNED_URL_TTL_SECONDS)
                if (signed?.signedUrl) {
                    pdfSignedUrl = signed.signedUrl
                }
            } catch (err) {
                console.warn(
                    "[pdf-engine-v2/status] signed URL failed (non-fatal):",
                    err instanceof Error ? err.message : err,
                )
            }
        }

        const response: StatusOk = {
            status: run.status as StatusOk["status"],
            started_at: (run.started_at as string | null) ?? null,
            ready_at: (run.ready_at as string | null) ?? null,
            pdf_signed_url: pdfSignedUrl,
            error_log: (run.error_log as string | null) ?? null,
            brief_text: (run.brief_text as string) ?? "",
            project_id: (run.project_id as string | null) ?? null,
        }

        return NextResponse.json(response)
    })
}
