/**
 * @file projects/[id]/page.tsx — chain-engine project workspace.
 *
 * @description Tristan unification directive (2026-05-19): ONE engine.
 * Founder writes a brief at /the-forge-v2/start, server inserts into
 * pdf_engine_runs, Mac Studio worker spawns scripts/serial-design-chain-v2.tsx,
 * and 65 min later there's a 6 MB PDF in Supabase Storage. This page is
 * what the founder sees while that's happening.
 *
 * Old workspace lived in `./workspace-view.tsx` (1455 lines, autopilot
 * specialists, module gallery, BOM table, suppliers, etc.) and is preserved
 * at `_archive/2026-05-19-pre-chain-unification/app/the-forge-v2/projects/[id]/`.
 * The chain engine produces a single PDF, not a structured module tree, so
 * the workspace UI is simpler now: brief, status, download.
 *
 * Server component flow:
 *   1. Load cad_lab_projects row by id (auth + foundry-scoped via RLS).
 *   2. Load latest pdf_engine_runs row for that project_id.
 *   3. If status=ready: pre-fetch a signed URL so the download button works
 *      without a client roundtrip.
 *   4. Render ChainWorkspaceView (client component) which polls every 30s
 *      while status ∈ {pending, running} and refreshes when terminal.
 *
 * @related
 *   - src/actions/start-project-with-autopilot.ts — INSERT pdf_engine_runs
 *   - scripts/pdf-engine-worker.mjs — poll + spawn + upload
 *   - scripts/serial-design-chain-v2.tsx — the chain
 *   - ./_components/chain-workspace-view.tsx — client view
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createAdminClient } from "@/lib/supabase/admin"

import { WorkspaceShell } from "../../_components/workspace-shell"
import { ChainWorkspaceView, type ChainRun } from "./_components/chain-workspace-view"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export const metadata: Metadata = {
    title: "Project · The Forge",
    description: "Engineering report build progress and download.",
}

export default async function ForgeV2ProjectPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    // 1. Project record (auth + foundry-scoped via withAuth/RLS in loadCadLabProject)
    const loadResult = await loadCadLabProject(id)
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // 2. Latest pdf_engine_runs row for this project. Admin client is fine here
    //    because we already authorised the project read above; this is just
    //    grabbing the chain status for the row the user owns.
    const admin = createAdminClient()
    const { data: runRow } = await admin
        .from("pdf_engine_runs")
        .select(
            "id, status, brief_text, pdf_storage_path, error_log, created_at, started_at, ready_at",
        )
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    // 3. If the chain produced a PDF, mint a 30 min signed URL so the download
    //    button works on first paint.
    let initialPdfUrl: string | null = null
    if (runRow?.status === "ready" && runRow.pdf_storage_path) {
        const { data: signed } = await admin.storage
            .from("pdf-engine-pdfs")
            .createSignedUrl(runRow.pdf_storage_path, 60 * 30)
        initialPdfUrl = signed?.signedUrl ?? null
    }

    const chainRun: ChainRun | null = runRow
        ? {
              id: runRow.id,
              status: runRow.status,
              briefText: runRow.brief_text,
              pdfStoragePath: runRow.pdf_storage_path,
              errorLog: runRow.error_log,
              createdAt: runRow.created_at,
              startedAt: runRow.started_at,
              readyAt: runRow.ready_at,
          }
        : null

    return (
        <WorkspaceShell>
            <ChainWorkspaceView
                projectId={id}
                projectName={project.name ?? "Untitled project"}
                projectSubject={project.subject ?? ""}
                run={chainRun}
                initialPdfUrl={initialPdfUrl}
            />
        </WorkspaceShell>
    )
}
