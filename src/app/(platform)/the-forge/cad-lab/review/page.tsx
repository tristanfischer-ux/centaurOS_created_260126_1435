"use client"

/**
 * @file review/page.tsx — The Forge: Review stage (Stage 5).
 *
 * @description Final review package with supplier-ready documentation and
 * expert discipline matching. Requires at least one generated module.
 *
 * Gate: redirects to /the-forge/cad-lab/build if no generated modules.
 */

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ClipboardCheck,
  ArrowLeft,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { CadLabReviewPackage } from "@/components/cad/cad-lab-review-package"
import { CadLabPeople } from "@/components/cad/cad-lab-people"
import { CadLabDrawingPackage } from "@/components/cad/cad-lab-drawing-package"

import { useCadLab } from "../cad-lab-context"

export default function CadLabReviewPage(): React.ReactNode {
  const router = useRouter()
  const {
    modules, generatedModuleCount, subject,
    editableReport, diagnosticAnswers,
  } = useCadLab()

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
          <ClipboardCheck className="h-5 w-5 text-international-orange" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Review Package</h2>
            <p className="text-xs text-muted-foreground">
              Supplier-ready documentation for {modules.length} modules
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/the-forge/cad-lab/build")} className="gap-1.5 text-xs">
          <ArrowLeft className="h-3 w-3" /> Back to Build
        </Button>
      </div>

      <CadLabReviewPackage modules={modules} projectName={subject} researchReport={editableReport} diagnosticAnswers={diagnosticAnswers} />
      <CadLabDrawingPackage modules={modules} projectName={subject} />
      <CadLabPeople modules={modules} diagnosticAnswers={diagnosticAnswers} />
    </div>
  )
}
