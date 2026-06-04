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

/** Coerce the detected_tech_domains jsonb column into a clean string[]. */
function normaliseTechDomains(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((v): v is string => typeof v === "string")
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
    // detected_* are additive/nullable (migration 20260604000000). Select them
    // defensively: if the migration hasn't been applied yet the columns are
    // absent and the select errors, so fall back to the base column set.
    const BASE_RUN_COLS =
        "id, status, brief_text, pdf_storage_path, error_log, created_at, started_at, ready_at"
    const DETECTED_RUN_COLS = `${BASE_RUN_COLS}, detected_class, detected_confidence, detected_tech_domains`
    // A runtime (non-literal) select string defeats the typed client's column
    // inference (it narrows .data to `never`), so cast through unknown to an
    // explicit row shape. detected_* are optional — absent pre-migration.
    type RunRow = {
        id: string
        status: string
        brief_text: string | null
        pdf_storage_path: string | null
        error_log: string | null
        created_at: string | null
        started_at: string | null
        ready_at: string | null
        detected_class?: string | null
        detected_confidence?: string | null
        detected_tech_domains?: unknown
    }
    let runRow: RunRow | null = null
    {
        const withDetected = await admin
            .from("pdf_engine_runs")
            .select(DETECTED_RUN_COLS)
            .eq("project_id", id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        if (!withDetected.error) {
            runRow = (withDetected.data as unknown as RunRow | null) ?? null
        } else {
            const base = await admin
                .from("pdf_engine_runs")
                .select(BASE_RUN_COLS)
                .eq("project_id", id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            runRow = (base.data as unknown as RunRow | null) ?? null
        }
    }

    // 3. If the chain produced a PDF, mint a 30 min signed URL so the download
    //    button works on first paint.
    let initialPdfUrl: string | null = null
    const storagePath =
        typeof runRow?.pdf_storage_path === "string"
            ? runRow.pdf_storage_path
            : null
    if (runRow?.status === "ready" && storagePath) {
        const { data: signed } = await admin.storage
            .from("pdf-engine-pdfs")
            .createSignedUrl(storagePath, 60 * 30)
        initialPdfUrl = signed?.signedUrl ?? null
    }

    const chainRun: ChainRun | null = runRow
        ? {
              id: runRow.id,
              status: runRow.status,
              briefText: (runRow.brief_text as string | null) ?? null,
              pdfStoragePath: storagePath,
              errorLog: (runRow.error_log as string | null) ?? null,
              createdAt: (runRow.created_at as string | null) ?? null,
              startedAt: (runRow.started_at as string | null) ?? null,
              readyAt: (runRow.ready_at as string | null) ?? null,
              detectedClass:
                  (runRow.detected_class as string | null | undefined) ?? null,
              detectedConfidence:
                  (runRow.detected_confidence as string | null | undefined) ??
                  null,
              detectedTechDomains: normaliseTechDomains(
                  runRow.detected_tech_domains,
              ),
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
