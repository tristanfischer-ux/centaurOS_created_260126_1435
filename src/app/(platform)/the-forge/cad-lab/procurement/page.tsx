"use client"

/**
 * @file procurement/page.tsx — Redirect stub.
 *
 * The Procurement stage was consolidated into the 3-stage pipeline (Concept → Build → Review).
 * Redirects to the Review stage for backward compatibility.
 */

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { FORGE_ROUTES } from "@/lib/forge-routes"

export default function CadLabProcurementRedirect(): React.ReactNode {
  const router = useRouter()
  useEffect(() => { router.replace(FORGE_ROUTES.cadLabSource) }, [router])
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      Redirecting to Source stage...
    </div>
  )
}
