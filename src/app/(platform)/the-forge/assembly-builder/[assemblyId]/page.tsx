"use client"

/**
 * @file page.tsx — Assembly Workbench page for a specific assembly.
 *
 * @description Renders the full 3-panel RPG-style workbench for building
 * an assembly. Loads the assembly data and delegates to AssemblyWorkbench.
 *
 * @param params.assemblyId - The assembly ID from the URL
 *
 * @related
 * - Workbench component: src/components/assembly/assembly-workbench.tsx
 * - Template picker: src/app/(platform)/the-forge/assembly-builder/page.tsx
 * - Actions: src/actions/assembly-builder.ts
 */

import { use } from "react"

import { AssemblyWorkbench } from "@/components/assembly/assembly-workbench"

interface PageProps {
  params: Promise<{ assemblyId: string }>
}

export default function AssemblyWorkbenchPage({
  params,
}: PageProps): React.ReactNode {
  const { assemblyId } = use(params)

  return <AssemblyWorkbench assemblyId={assemblyId} />
}
