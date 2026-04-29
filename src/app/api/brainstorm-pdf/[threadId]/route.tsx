/**
 * @file api/brainstorm-pdf/[threadId]/route.tsx
 *
 * @description Node.js route handler that renders a brainstorming session
 * transcript to PDF using @react-pdf/renderer, uploads it to Supabase
 * Storage, and returns a JSON response with the signed URL.
 *
 * WHY a route handler (not a server action):
 *   @react-pdf/renderer requires Node.js (it uses canvas, Buffer, pdfkit
 *   internals). Next.js server actions on pages with 'force-dynamic' run
 *   in the Edge runtime by default. The edge runtime doesn't have Node.js
 *   APIs. Moving to a dedicated route.tsx with `export const runtime = 'nodejs'`
 *   ensures we always get the Node.js sandbox regardless of the calling page's
 *   runtime. Same reason next/og lives in its own route.
 *
 * Called by: src/actions/meeting-thread-pdf.tsx — which handles auth, data
 * fetching, cover PNG download, and calls this route with a Cookie header
 * forwarded from the requesting user so the auth check inside passes.
 *
 * @security
 *   - Auth-gated: caller's RLS-scoped client must be able to SELECT the
 *     thread row. Anonymous or wrong-foundry requests → 403.
 *   - All DB writes use the admin client (service role).
 *   - No user-supplied data is trusted for SQL; only the threadId UUID.
 *
 * @related
 *   src/actions/meeting-thread-pdf.tsx — orchestrator (auth + data fetch +
 *     cover fetch + calls this route server-to-server)
 *   src/components/pdf/MeetingThreadPdf.tsx — react-pdf Document component
 *   src/app/api/brainstorm-cover/[threadId]/route.tsx — same pattern for PNG
 */

import React from "react"
import { NextRequest, NextResponse } from "next/server"
import { pdf } from "@react-pdf/renderer"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isValidUUID } from "@/lib/security/sanitize"
import { MeetingThreadPdf } from "@/components/pdf/MeetingThreadPdf"
import type { MeetingEntryRow } from "@/actions/meeting-threads"

// CRITICAL: forces Node.js runtime. @react-pdf/renderer cannot run in the
// Edge runtime — it depends on Node.js APIs (Buffer, canvas, etc.).
export const runtime = "nodejs"

// 5-minute ceiling: react-pdf can be slow for large transcripts
export const maxDuration = 300

const COVER_BUCKET = "brainstorm-assets"
const SIGNED_URL_EXPIRY_SECONDS = 3_600

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toEntryRow(row: Record<string, unknown>): MeetingEntryRow {
    return {
        id: row.id as string,
        threadId: row.thread_id as string,
        specialistId: (row.specialist_id as string) ?? null,
        specialistName: (row.specialist_name as string) ?? null,
        councilPosition: (row.council_position as string) ?? null,
        arrivalMs: (row.arrival_ms as number) ?? null,
        roundNumber: (row.round_number as number) ?? 1,
        content: (row.content as string) ?? "",
        role: (row.role as "specialist" | "founder") ?? "specialist",
        createdAt: row.created_at as string,
    }
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ threadId: string }> },
): Promise<NextResponse> {
    const { threadId } = await params

    // ── 1. Validate ────────────────────────────────────────────────────────────
    if (!isValidUUID(threadId)) {
        return NextResponse.json({ error: "Invalid thread ID" }, { status: 400 })
    }

    // ── 2. Auth gate ───────────────────────────────────────────────────────────
    // The calling server action forwards the user's Cookie header so this check
    // passes as the authenticated user (same pattern as brainstorm-cover route).
    const userClient = await createClient()
    const {
        data: { user },
    } = await userClient.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { data: gateRow, error: gateErr } = await userClient
        .from("meeting_threads")
        .select("id, created_at, cover_status, council_tier, specialist_ids, topic, foundry_id, author_user_id")
        .eq("id", threadId)
        .single()

    if (gateErr || !gateRow) {
        return NextResponse.json({ error: "Not authorised" }, { status: 403 })
    }

    const admin = createAdminClient()

    // ── 3. Fetch entries ───────────────────────────────────────────────────────
    const { data: entryRows, error: entryErr } = await admin
        .from("meeting_entries")
        .select("*")
        .eq("thread_id", threadId)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })

    if (entryErr) {
        console.error("[brainstorm-pdf] Entry fetch failed:", entryErr.message)
        return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 })
    }

    const entries: MeetingEntryRow[] = (entryRows ?? []).map((r) =>
        toEntryRow(r as unknown as Record<string, unknown>),
    )

    // ── 4. Fetch cover image (base64 data URL) ─────────────────────────────────
    let coverImageDataUrl: string | null = null

    if (gateRow.cover_status === "ready") {
        try {
            const { data: coverBlob, error: coverErr } = await admin.storage
                .from(COVER_BUCKET)
                .download(`${threadId}/cover.png`)

            if (!coverErr && coverBlob) {
                const coverBuffer = Buffer.from(await coverBlob.arrayBuffer())
                coverImageDataUrl = `data:image/png;base64,${coverBuffer.toString("base64")}`
            }
        } catch (err) {
            // Non-fatal — PDF renders without the cover image
            console.warn("[brainstorm-pdf] Cover fetch failed (non-fatal):", {
                threadId,
                err: err instanceof Error ? err.message : String(err),
            })
        }
    }

    // ── 5. Render PDF ──────────────────────────────────────────────────────────
    const specialistIds = (gateRow.specialist_ids as string[]) ?? []

    let pdfBuffer: Buffer
    try {
        const blob = await pdf(
            <MeetingThreadPdf
                topic={gateRow.topic as string}
                councilTier={(gateRow.council_tier as string) ?? "quick"}
                specialistCount={specialistIds.length}
                createdAt={gateRow.created_at as string}
                entries={entries}
                coverImageDataUrl={coverImageDataUrl}
            />,
        ).toBlob()
        pdfBuffer = Buffer.from(await blob.arrayBuffer())
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[brainstorm-pdf] Render failed:", { threadId, message })
        return NextResponse.json({ error: `PDF render failed: ${message}` }, { status: 500 })
    }

    // ── 6. Upload to Storage ───────────────────────────────────────────────────
    const storagePath = `${threadId}/transcript.pdf`
    const { error: uploadErr } = await admin.storage
        .from(COVER_BUCKET)
        .upload(storagePath, pdfBuffer, {
            contentType: "application/pdf",
            upsert: true,
        })

    if (uploadErr) {
        console.error("[brainstorm-pdf] Upload failed:", { threadId, err: uploadErr.message })
        return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
    }

    // ── 7. Create signed URL ───────────────────────────────────────────────────
    const { data: signData, error: signErr } = await admin.storage
        .from(COVER_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)

    if (signErr || !signData?.signedUrl) {
        console.error("[brainstorm-pdf] Sign failed:", { threadId, err: signErr?.message })
        return NextResponse.json({ error: "Failed to create download link" }, { status: 500 })
    }

    // ── 8. Persist transcript_pdf_url ──────────────────────────────────────────
    try {
        await admin
            .from("meeting_threads")
            .update({ transcript_pdf_url: signData.signedUrl })
            .eq("id", threadId)
    } catch (err) {
        console.warn("[brainstorm-pdf] transcript_pdf_url update failed (non-fatal):", err)
    }

    // ── 9. Log $0 usage ────────────────────────────────────────────────────────
    try {
        await admin.from("ai_usage_log").insert({
            user_id: user.id,
            foundry_id: gateRow.foundry_id as string,
            feature: "brainstorm_pdf",
            model: "@react-pdf/renderer",
            input_tokens: 0,
            output_tokens: 0,
            cost_usd: 0,
            metadata: {
                thread_id: threadId,
                entry_count: entries.length,
                pdf_size_bytes: pdfBuffer.length,
                has_cover: coverImageDataUrl !== null,
            },
        })
    } catch (err) {
        console.error("[brainstorm-pdf] Usage log failed:", err)
    }

    console.info("[brainstorm-pdf] Generated PDF:", {
        threadId,
        sizeBytes: pdfBuffer.length,
        entryCount: entries.length,
        hasCover: coverImageDataUrl !== null,
    })

    return NextResponse.json({ ok: true, signedUrl: signData.signedUrl })
}
