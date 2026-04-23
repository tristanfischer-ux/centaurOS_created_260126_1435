/**
 * @file src/app/(platform)/the-forge-v2/projects/[id]/export/pdf/route.ts
 *
 * @description GET endpoint that returns the project PDF as a downloadable
 * binary. Wraps `exportProjectPdfBackground` (the foundryId-scoped variant
 * used by the autopilot generating_pdf stage) so curl / agent-browser can
 * fetch the PDF directly without needing the React Server Action RPC
 * protocol.
 *
 * @auth Requires a signed-in user. The authenticated caller's foundry
 * membership is resolved via `withAuth`, then the PDF generator runs under
 * that foundry context. Not a public URL.
 *
 * @usage
 *   curl -L -o project.pdf \
 *     -H "Cookie: sb-<project-ref>-auth-token=..." \
 *     "https://<host>/the-forge-v2/projects/<uuid>/export/pdf"
 */

import { NextResponse } from "next/server"

import { exportProjectPdfBackground } from "@/actions/export-project-pdf"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 300

interface RouteContext {
    params: Promise<{ id: string }>
}

export async function GET(
    request: Request,
    context: RouteContext,
): Promise<Response> {
    void request

    const { id: projectId } = await context.params

    // Verify the caller is signed in.
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json(
            { error: "Not authenticated" },
            { status: 401 },
        )
    }

    // Resolve foundry via profile, then confirm the project is in that foundry
    // before generating. Mirrors the ownership check in the internal action.
    const admin = createAdminClient()
    const { data: profile } = await admin
        .from("profiles")
        .select("foundry_id")
        .eq("id", user.id)
        .maybeSingle()

    const foundryId = profile?.foundry_id
    if (!foundryId) {
        return NextResponse.json(
            { error: "No foundry for this user" },
            { status: 403 },
        )
    }

    const { data: project } = await admin
        .from("cad_lab_projects")
        .select("foundry_id")
        .eq("id", projectId)
        .maybeSingle()

    if (!project) {
        return NextResponse.json(
            { error: "Project not found" },
            { status: 404 },
        )
    }

    if (project.foundry_id !== foundryId) {
        // SECURITY: don't leak other-foundry project existence.
        return NextResponse.json(
            { error: "Project not found" },
            { status: 404 },
        )
    }

    const result = await exportProjectPdfBackground(projectId, foundryId)

    if (!result.ok) {
        return NextResponse.json(
            { error: result.error ?? "PDF generation failed" },
            { status: 500 },
        )
    }

    const pdfBytes = Buffer.from(result.base64, "base64")

    return new Response(new Uint8Array(pdfBytes), {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${result.filename}"`,
            "Cache-Control": "no-store",
        },
    })
}
