"use client"

/**
 * @file assembler-fitness-review.tsx — Combined instant checks + AI review for Assemble.
 *
 * @description Two sections: (A) Instant fitness checks (rule-based),
 * (B) AI assembler assessment (Haiku, cached). Shows Jian's avatar.
 *
 * @related
 * - Fitness logic: src/lib/cad-lab/assembler-fitness.ts
 * - AI review: src/actions/company-review.ts
 * - Hook: src/hooks/use-company-review.ts
 */

import { useMemo } from "react"
import Image from "next/image"
import { AlertTriangle, XCircle, CheckCircle2, Info, Loader2, ShieldAlert } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import { computeAssemblerFitness } from "@/lib/cad-lab/assembler-fitness"
import { useCompanyReview } from "@/hooks/use-company-review"
import type { AssemblyCompanyMatch } from "@/lib/assembly-utils"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { CompanyReview } from "@/actions/company-review"

interface AssemblerFitnessReviewProps {
  assemblerMatches: AssemblyCompanyMatch[]
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  assemblyNotes: Array<{ moduleName: string; note: string }>
  activeProjectId: string | null
  subject: string
}

const VERDICT_CONFIG: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "destructive" }> = {
  recommended: { label: "Recommended", variant: "success" },
  acceptable: { label: "Acceptable", variant: "secondary" },
  caution: { label: "Caution", variant: "warning" },
  not_recommended: { label: "Not Recommended", variant: "destructive" },
}

export function AssemblerFitnessReview({
  assemblerMatches,
  modules,
  diagnosticAnswers,
  assemblyNotes,
  activeProjectId,
  subject,
}: AssemblerFitnessReviewProps) {
  const jian = getSpecialistById("vp-engineering")

  // Instant fitness checks
  const fitness = useMemo(
    () => computeAssemblerFitness(assemblerMatches, modules, diagnosticAnswers, assemblyNotes),
    [assemblerMatches, modules, diagnosticAnswers, assemblyNotes],
  )

  // Company IDs for AI review
  const companyIds = useMemo(() => assemblerMatches.map((m) => m.id), [assemblerMatches])

  // Build module specs for AI review
  const moduleSpecs = useMemo(
    () =>
      modules.map((mod) => {
        const diag = diagnosticAnswers[mod.id] ?? {}
        return {
          name: mod.name,
          process: diag.mfg_process ?? "",
          material: diag.material ?? "",
          tolerance: diag.tolerance ?? "",
          batchSize: diag.batch_size ?? "",
          environment: diag.environment ?? "",
        }
      }),
    [modules, diagnosticAnswers],
  )

  // AI company review
  const { reviews, summary, isLoading } = useCompanyReview({
    stage: "assemble",
    projectId: activeProjectId,
    projectSubject: subject,
    modules: moduleSpecs,
    companyIds,
    enabled: companyIds.length > 0,
  })

  // Self-hide when no matches
  if (assemblerMatches.length === 0) return null
  // Self-hide when no checks and no reviews
  if (fitness.checks.length === 0 && !isLoading && reviews.length === 0) return null

  return (
    <Card className="border-primary/30">
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Header with Jian's avatar */}
        <div className="flex items-center gap-2.5">
          {jian?.avatarImage ? (
            <Image src={jian.avatarImage} alt={jian.name} width={28} height={28} className="rounded-full flex-shrink-0" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="h-3.5 w-3.5 text-primary" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {jian?.name ?? "Jian"}&apos;s Assembly Assessment
            </p>
            <p className="text-xs text-muted-foreground">
              {fitness.checks.length > 0
                ? `${fitness.checks.length} check${fitness.checks.length !== 1 ? "s" : ""} found`
                : "All checks passed"}
              {reviews.length > 0 ? ` · ${reviews.length} assemblers reviewed` : ""}
            </p>
          </div>
        </div>

        {/* Section A: Instant Checks */}
        {fitness.checks.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Instant Checks</p>
            <div className="space-y-1.5">
              {fitness.checks.map((check) => (
                <div key={check.id} className="flex items-start gap-2 text-xs">
                  {check.severity === "critical" ? (
                    <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-muted-foreground">{check.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section B: AI Assembler Assessment */}
        {(isLoading || reviews.length > 0) && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assembler Assessment</p>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Reviewing assemblers...
                </div>
              </div>
            ) : (
              <>
                {summary && (
                  <p className="text-xs text-muted-foreground italic">{summary}</p>
                )}
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <AssemblerReviewCard key={review.companyId} review={review} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AssemblerReviewCard({ review }: { review: CompanyReview }) {
  const config = VERDICT_CONFIG[review.verdict] ?? VERDICT_CONFIG.acceptable

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{review.companyName}</p>
        <Badge variant={config.variant} className="text-[10px]">
          {config.label}
        </Badge>
      </div>

      {review.strengths.length > 0 && (
        <div className="space-y-0.5">
          {review.strengths.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-success flex-shrink-0 mt-0.5" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {review.concerns.length > 0 && (
        <div className="space-y-0.5">
          {review.concerns.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0 mt-0.5" />
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      {review.recommendation && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3 w-3 text-info flex-shrink-0 mt-0.5" />
          <span className="italic">{review.recommendation}</span>
        </div>
      )}

      {review.bestForModules.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {review.bestForModules.map((mod) => (
            <Badge key={mod} variant="secondary" className="text-[10px]">
              {mod}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
