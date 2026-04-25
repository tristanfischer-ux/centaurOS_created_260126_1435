/**
 * @file suppliers/diary/page.tsx — Procurement diary sub-route.
 *
 * @security loadCadLabProject enforces auth + foundry scoping.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"
import { DiaryView } from "./diary-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const r = await loadCadLabProject(id)
  if ("error" in r) return { title: "Procurement diary · The Forge" }
  return { title: `Procurement diary · ${r.project.name}` }
}

export default async function DiaryPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
  const { id } = await params

  const result = await loadCadLabProject(id)
  if ("error" in result || !result.project) notFound()
  const project = result.project

  const supabase = await createClient()
  const { data: entries } = await supabase
    .from("procurement_diary_entries")
    .select()
    .eq("project_id", id)
    .order("occurred_at", { ascending: false })

  return (
    <DiaryView
      project={{ id: project.id, name: project.name }}
      initialEntries={entries ?? []}
    />
  )
}
