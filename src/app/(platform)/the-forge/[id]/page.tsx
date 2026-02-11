/**
 * @file page.tsx — Redirect from /the-forge/[id] to the project's current stage
 *
 * @description When users navigate to a project without a stage segment,
 * redirect them to their current pipeline stage.
 */

import { redirect } from "next/navigation"

import { loadScanAction } from "@/actions/xray"

const STAGE_TO_SEGMENT: Record<string, string> = {
  concept: "concept",
  dossier: "dossier",
  people: "people",
  supply_chain: "supply-chain",
  contracting: "contracting",
}

interface Props {
  params: Promise<unknown>
}

export default async function ForgeProjectRedirect({ params }: Props): Promise<never> {
  const { id } = (await params) as { id: string }

  const result = await loadScanAction(id)
  const stage = "error" in result ? "concept" : result.stage
  const segment = STAGE_TO_SEGMENT[stage] || "concept"

  redirect(`/the-forge/${id}/${segment}`)
}
