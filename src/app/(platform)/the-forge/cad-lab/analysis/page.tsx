"use client"

/**
 * @file analysis/page.tsx — Redirect stub.
 *
 * The Analysis stage was consolidated into the 3-stage pipeline (Concept → Build → Review).
 * Redirects to the Build stage for backward compatibility.
 */

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { FORGE_ROUTES } from "@/lib/forge-routes"

export default function CadLabAnalysisRedirect(): React.ReactNode {
  const router = useRouter()
  useEffect(() => { router.replace(FORGE_ROUTES.cadLabBuild) }, [router])
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      Redirecting to Build stage...
    </div>
  )
}
