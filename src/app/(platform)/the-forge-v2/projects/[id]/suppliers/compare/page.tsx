/**
 * @file suppliers/compare/page.tsx
 *
 * @description Side-by-side comparison of 2-4 shortlisted suppliers.
 * Reads ?ids=uuid1,uuid2,... from the URL. Falls back to the first two
 * shortlisted suppliers when no ids param is present.
 *
 * @security loadCadLabProject enforces auth + foundry scoping.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"
import { CompareView } from "./compare-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const r = await loadCadLabProject(id)
  if ("error" in r) return { title: "Compare suppliers · The Forge" }
  return { title: `Compare suppliers · ${r.project.name}` }
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.ReactNode> {
  const { id } = await params
  const sp = await searchParams

  const result = await loadCadLabProject(id)
  if ("error" in result || !result.project) notFound()
  const project = result.project

  const supabase = await createClient()

  // Load all shortlisted suppliers for this project
  const { data: allShortlisted } = await supabase
    .from("project_supplier_shortlists")
    .select()
    .eq("project_id", id)
    .order("created_at", { ascending: true })

  // Load global supplier directory rows for capability data
  const shortlistedIds = (allShortlisted ?? []).map((r) => r.supplier_id)
  const { data: supplierDirRows } = shortlistedIds.length > 0
    ? await supabase
        .from("marketplace_listings")
        .select("id, title, category, certifications, process_capabilities, specialties, minimum_order, lead_time, country, country_iso")
        .in("id", shortlistedIds)
    : { data: [] }

  // Load quotes
  const { data: allQuotes } = await supabase
    .from("supplier_quotes")
    .select()
    .eq("project_id", id)
    .order("created_at", { ascending: false })

  // Resolve which supplier ids to compare
  const idsParam = Array.isArray(sp.ids) ? sp.ids[0] : sp.ids
  const requestedIds = idsParam
    ? idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4)
    : []

  const compareIds =
    requestedIds.length >= 2
      ? requestedIds
      : shortlistedIds.slice(0, 4)

  return (
    <CompareView
      project={{ id: project.id, name: project.name }}
      allShortlisted={allShortlisted ?? []}
      supplierDirRows={supplierDirRows ?? []}
      allQuotes={allQuotes ?? []}
      compareIds={compareIds}
    />
  )
}
