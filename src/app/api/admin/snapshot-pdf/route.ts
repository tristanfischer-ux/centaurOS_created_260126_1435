/**
 * @file admin/snapshot-pdf/route.ts — agent-callable PDF snapshot endpoint.
 *
 * @description Returns the latest PDF for a given project as a
 * temporary signed URL OR streams the bytes directly. Authenticated
 * with the same CRON_SECRET Bearer token the cron endpoint uses, so
 * the agent can call it without involving the user in service-role-key
 * handling.
 *
 * Design constraints (Tristan-flagged 2026-04-26 NIGHT):
 * - Agent must be able to snapshot per-loop PDFs autonomously
 * - No exfiltration of arbitrary env vars to local files
 * - Same auth as cron (already trusted, already used by agent)
 * - Returns a signed URL with short TTL or proxies the bytes
 *
 * Usage:
 *   GET /api/admin/snapshot-pdf?project_id=<uuid>
 *   Authorization: Bearer <CRON_SECRET>
 *   → 200 { ok: true, signedUrl: string, expiresAt: ISO, reportName: string }
 *   OR 404 if no PDF exists for the project yet.
 *
 *   GET /api/admin/snapshot-pdf?project_id=<uuid>&format=bytes
 *   → streams the PDF bytes directly with content-type: application/pdf
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyCronSecret } from "@/lib/security/cron-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<NextResponse | Response> {
    const authFailure = verifyCronSecret(request)
    if (authFailure) return authFailure

    const url = new URL(request.url)
    const projectId = url.searchParams.get("project_id")
    const format = url.searchParams.get("format") ?? "url"

    if (!projectId) {
        return NextResponse.json(
            { ok: false, error: "project_id required" },
            { status: 400 },
        )
    }

    const admin = createAdminClient()

    // Pull the latest report-download row for the project.
    const { data: row, error } = await admin
        .from("report_downloads")
        .select("storage_path, report_name, file_size_bytes, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 },
        )
    }
    if (!row || !row.storage_path) {
        return NextResponse.json(
            { ok: false, error: "no PDF in storage for this project yet" },
            { status: 404 },
        )
    }

    if (format === "bytes") {
        // Stream the PDF directly. Agent uses this when it wants the bytes
        // saved to disk without an intermediate signed-URL hop.
        const { data: file, error: dlErr } = await admin.storage
            .from("report-downloads")
            .download(row.storage_path)
        if (dlErr || !file) {
            return NextResponse.json(
                { ok: false, error: dlErr?.message ?? "download failed" },
                { status: 500 },
            )
        }
        const buf = await file.arrayBuffer()
        return new Response(buf, {
            status: 200,
            headers: {
                "content-type": "application/pdf",
                "content-disposition": `attachment; filename="${row.report_name}.pdf"`,
                "x-snapshot-storage-path": row.storage_path,
                "x-snapshot-created-at": row.created_at,
            },
        })
    }

    // Default: 1-hour signed URL.
    const { data: signed, error: signErr } = await admin.storage
        .from("report-downloads")
        .createSignedUrl(row.storage_path, 60 * 60)
    if (signErr || !signed?.signedUrl) {
        return NextResponse.json(
            { ok: false, error: signErr?.message ?? "sign failed" },
            { status: 500 },
        )
    }
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    return NextResponse.json({
        ok: true,
        signedUrl: signed.signedUrl,
        expiresAt,
        reportName: row.report_name,
        storagePath: row.storage_path,
        fileSizeBytes: row.file_size_bytes,
        createdAt: row.created_at,
    })
}
