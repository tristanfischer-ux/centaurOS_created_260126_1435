/**
 * @file layout.tsx — Passthrough layout for legacy forge project routes
 *
 * @description All legacy /the-forge/[id]/* routes now redirect to
 * /the-forge/cad-lab. This layout is a minimal passthrough that lets
 * the redirect pages render without loading the old ForgeProjectProvider.
 */

import React from "react"

export default function ForgeProjectLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  return <>{children}</>
}
