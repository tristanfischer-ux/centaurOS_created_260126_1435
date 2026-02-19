"use client"

/**
 * @file procurement/page.tsx — The Forge: Procurement stage (Stage 4).
 *
 * @description Supply chain diagnostics, cost estimation, and contracting
 * tools. Requires at least one generated module.
 *
 * Gate: redirects to /the-forge/cad-lab/build if no generated modules.
 */

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  ShoppingCart,
  ArrowLeft,
  Box,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { CadLabDiagnostics } from "@/components/cad/cad-lab-diagnostics"
import { CadLabSupplyChain } from "@/components/cad/cad-lab-supply-chain"
import { CadLabCostEstimate } from "@/components/cad/cad-lab-cost-estimate"
import { CadLabContracting } from "@/components/cad/cad-lab-contracting"
import { ProcurementEnrichment } from "@/components/cad/procurement-enrichment"
import { useRegisterScreenContext } from "@/contexts/screen-context"

import { useCadLab } from "../cad-lab-context"

export default function CadLabProcurementPage(): React.ReactNode {
  const router = useRouter()
  const {
    modules, generatedModuleCount, subject,
    diagnosticAnswers, setDiagnosticAnswers, aiPrefilled,
    diagCompletedCount, activeProjectId, linkedRfqId, linkRfqToProject,
    designBrief, assumptionNotes,
  } = useCadLab()

  useRegisterScreenContext(
    useMemo(() => {
      const parts: string[] = [`Viewing the Procurement stage for "${subject}".`]
      parts.push(`${modules.length} modules, ${diagCompletedCount}/${modules.length} diagnostics completed.`)
      return {
        pageTitle: `The Forge — Procurement: ${subject}`,
        summary: parts.join(" "),
        entities: modules.slice(0, 15).map((m) => ({
          type: "module",
          title: m.name,
          status: m.status === "generated" ? "CAD generated" : "pending",
        })),
      }
    }, [subject, modules, generatedModuleCount, diagCompletedCount]),
  )

  if (generatedModuleCount === 0) {
    return (
      <div className="py-12">
        <EmptyState
          title="No modules generated yet"
          description="Generate at least one module in the Build stage to see procurement diagnostics, cost estimates, and supply chain analysis."
          action={
            <Button onClick={() => router.push("/the-forge/cad-lab/build")} className="gap-1.5">
              <Box className="h-4 w-4" />
              Go to Build
            </Button>
          }
        />
      </div>
    )
  }

  // Extract component names from modules for enrichment data lookup
  const componentNames = modules.map((m) => m.name).filter(Boolean)

  return (
    <div className="space-y-6">
      {/* Stage header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5 text-international-orange" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Procurement & Supply Chain</h2>
            <p className="text-xs text-muted-foreground">
              {modules.length} modules, {diagCompletedCount}/{modules.length} diagnostics completed
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/the-forge/cad-lab/build")} className="gap-1.5 text-xs">
          <ArrowLeft className="h-3 w-3" /> Back to Build
        </Button>
      </div>

      <CadLabDiagnostics
        modules={modules}
        answers={diagnosticAnswers}
        onAnswersChange={setDiagnosticAnswers}
        aiPrefilled={aiPrefilled}
      />
      <CadLabSupplyChain modules={modules} diagnosticAnswers={diagnosticAnswers} />
      <CadLabCostEstimate modules={modules} diagnosticAnswers={diagnosticAnswers} />
      <ProcurementEnrichment componentNames={componentNames} />
      <CadLabContracting
        modules={modules}
        projectName={subject}
        diagnosticAnswers={diagnosticAnswers}
        projectId={activeProjectId}
        linkedRfqId={linkedRfqId}
        onRfqLinked={linkRfqToProject}
        designBrief={designBrief}
        assumptionNotes={assumptionNotes}
      />
    </div>
  )
}
