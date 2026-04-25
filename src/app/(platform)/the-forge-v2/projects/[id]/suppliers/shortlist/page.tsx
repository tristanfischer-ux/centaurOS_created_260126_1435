/**
 * @file suppliers/shortlist/page.tsx
 *
 * @description Per-project supplier shortlist: status workflow, quote ledger,
 * and lead-time alert pills. RED-TEAM-PIVOT-PLAN Tier 4 step 19.
 *
 * @security loadCadLabProject enforces auth + foundry scoping. RLS on
 * project_supplier_shortlists + supplier_quotes is defence-in-depth.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"
import { ShortlistView } from "./shortlist-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const r = await loadCadLabProject(id)
  if ("error" in r) return { title: "Shortlist · The Forge" }
  return { title: `Shortlist · ${r.project.name}` }
}

export default async function ShortlistPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
  const { id } = await params

  const result = await loadCadLabProject(id)
  if ("error" in result || !result.project) notFound()
  const project = result.project

  const supabase = await createClient()

  // Load target_launch_date directly — loadCadLabProject does not expose it
  const { data: projectMeta } = await supabase
    .from("cad_lab_projects")
    .select("target_launch_date")
    .eq("id", id)
    .single()

  // Load shortlisted suppliers
  const { data: shortlistRows } = await supabase
    .from("project_supplier_shortlists")
    .select()
    .eq("project_id", id)
    .order("created_at", { ascending: true })

  // Load all quotes for this project
  const { data: quoteRows } = await supabase
    .from("supplier_quotes")
    .select()
    .eq("project_id", id)
    .order("created_at", { ascending: false })

  return (
    <ShortlistView
      project={{
        id: project.id,
        name: project.name,
        targetLaunchDate: (projectMeta?.target_launch_date as string | null) ?? null,
      }}
      shortlistRows={shortlistRows ?? []}
      allQuotes={quoteRows ?? []}
    />
  )
}
