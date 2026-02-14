"use client"

/**
 * @file analysis/page.tsx — The Forge: Analysis stage (Stage 3).
 *
 * @description Engineering analysis dashboard with risk register, timeline,
 * and design quality metrics. Requires at least one generated module.
 *
 * Gate: redirects to /the-forge/cad-lab/build if no generated modules.
 */

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  ArrowLeft,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CadLabAnalysisDashboard } from "@/components/cad/cad-lab-analysis-dashboard"
import { CadLabTimeline } from "@/components/cad/cad-lab-timeline"
import { CadLabRiskRegister } from "@/components/cad/cad-lab-risk-register"

import { useCadLab } from "../cad-lab-context"

export default function CadLabAnalysisPage(): React.ReactNode {
  const router = useRouter()
  const { modules, generatedModuleCount, subject, riskCount } = useCadLab()

  // Gate: need at least one generated module
  useEffect(() => {
    if (generatedModuleCount === 0) {
      router.replace("/the-forge/cad-lab/build")
    }
  }, [generatedModuleCount, router])

  if (generatedModuleCount === 0) return null

  return (
    <div className="space-y-6">
      {/* Stage header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-international-orange" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Engineering Analysis</h2>
            <p className="text-xs text-muted-foreground">
              {modules.length} modules, {riskCount} risk items
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/the-forge/cad-lab/build")} className="gap-1.5 text-xs">
          <ArrowLeft className="h-3 w-3" /> Back to Build
        </Button>
      </div>

      <CadLabAnalysisDashboard modules={modules} projectName={subject} />
      <CadLabTimeline modules={modules} />
      <CadLabRiskRegister modules={modules} />
    </div>
  )
}
