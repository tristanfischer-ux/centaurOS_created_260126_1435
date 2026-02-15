"use client"

/**
 * @file procurement/page.tsx — The Forge: Procurement stage (Stage 4).
 *
 * @description Supply chain diagnostics, cost estimation, and contracting
 * tools. Requires at least one generated module.
 *
 * Gate: redirects to /the-forge/cad-lab/build if no generated modules.
 */

import { useRouter } from "next/navigation"
import {
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Box,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { CadLabDiagnostics } from "@/components/cad/cad-lab-diagnostics"
import { CadLabSupplyChain } from "@/components/cad/cad-lab-supply-chain"
import { CadLabCostEstimate } from "@/components/cad/cad-lab-cost-estimate"
import { CadLabContracting } from "@/components/cad/cad-lab-contracting"

import { useCadLab } from "../cad-lab-context"

export default function CadLabProcurementPage(): React.ReactNode {
  const router = useRouter()
  const {
    modules, generatedModuleCount, subject,
    diagnosticAnswers, setDiagnosticAnswers, aiPrefilled,
    diagCompletedCount,
  } = useCadLab()

  // Show empty state instead of redirect
  if (generatedModuleCount === 0) {
    return (
      <div className="py-12">
        <EmptyState
          title="No modules generated yet"
          description="Generate at least one module in the Build stage to access procurement diagnostics, cost estimates, and supply chain mapping."
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
      <CadLabContracting modules={modules} projectName={subject} diagnosticAnswers={diagnosticAnswers} />

      {/* What's Next CTA */}
      <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Next: Review Package
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate a supplier-ready engineering review package with expert discipline recommendations.
              </p>
            </div>
            <Button onClick={() => router.push("/the-forge/cad-lab/review")} className="gap-1.5">
              <ClipboardCheck className="h-4 w-4" />
              Continue to Review
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
