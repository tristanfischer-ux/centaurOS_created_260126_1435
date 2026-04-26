/**
 * @file techniques/page.tsx — /the-forge-v2/projects/:id/techniques
 *
 * @description Saved manufacturing techniques for a project.
 *
 * Shows techniques the founder has saved to this project (Lever 1), with
 * per-technique annotation notes (Lever 2). Links back to the Inspiration
 * page where new techniques can be browsed and saved.
 *
 * Empty-state policy: when no techniques have been saved yet, render an
 * honest empty state with a link to the techniques explorer. Never show
 * example technique cards with fabricated data.
 *
 * @related
 *   - View:    ./techniques-view.tsx
 *   - Actions: src/actions/project-techniques.ts
 *   - Static:  src/lib/manufacturing/learning-tracks.ts
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { loadCadLabProject } from '@/actions/cad-lab-projects'
import { getProjectTechniques } from '@/actions/project-techniques'

import { TechniquesView, type TechniquesViewProps } from './techniques-view'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const r = await loadCadLabProject(id)
  if ('error' in r) return { title: 'Techniques · The Forge' }
  return { title: `Techniques · ${r.project.name}` }
}

export default async function ForgeV2TechniquesPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
  const { id } = await params

  const [projectResult, techniquesResult] = await Promise.all([
    loadCadLabProject(id),
    getProjectTechniques(id),
  ])

  if ('error' in projectResult || !projectResult.project) notFound()

  const project = projectResult.project

  const viewProps: TechniquesViewProps = {
    project: {
      id: project.id,
      name: project.name,
    },
    savedTechniques: techniquesResult.data ?? [],
  }

  return <TechniquesView {...viewProps} />
}
