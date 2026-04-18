"use client"

/**
 * @file supplier-fitness-review.tsx — Combined instant checks + AI company review for Source.
 *
 * @description Two sections: (A) Instant fitness checks (rule-based, no API call),
 * (B) AI company assessment (Haiku, cached). Shows Chase's avatar and personality.
 *
 * @related
 * - Fitness logic: src/lib/cad-lab/supplier-fitness.ts
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
import { computeSupplierFitness } from "@/lib/cad-lab/supplier-fitness"
import { useCompanyReview } from "@/hooks/use-company-review"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { CompanyReview } from "@/actions/company-review"

interface SupplierFitnessReviewProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  supplierMatches: Map<string, CadLabSupplierMatch[]>
  activeProjectId: string | null
  subject: string
}

const VERDICT_CONFIG: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "destructive" }> = {
  recommended: { label: "Recommended", variant: "success" },
  acceptable: { label: "Acceptable", variant: "secondary" },
  caution: { label: "Caution", variant: "warning" },
  not_recommended: { label: "Not Recommended", variant: "destructive" },
}

export function SupplierFitnessReview({
  modules,
  diagnosticAnswers,
  supplierMatches,
  activeProjectId,
  subject,
}: SupplierFitnessReviewProps) {
  const chase = getSpecialistById("vp-supply-chain")

  // Instant fitness checks
  const fitness = useMemo(
    () => computeSupplierFitness(modules, diagnosticAnswers, supplierMatches),
    [modules, diagnosticAnswers, supplierMatches],
  )

  // Collect unique companies + their best matchScore for the AI review context.
  // The matchContext lets Chase reconcile narrative with score (e.g., naming
  // aerospace certs when scoring low on generic match).
  const { allCompanyIds, matchContext, matchScoreIndex } = useMemo(() => {
    const idSet = new Set<string>()
    const bestByCompany = new Map<string, CadLabSupplierMatch>()
    for (const matches of supplierMatches.values()) {
      for (const m of matches) {
        idSet.add(m.id)
        const existing = bestByCompany.get(m.id)
        if (!existing || m.matchScore > existing.matchScore) {
          bestByCompany.set(m.id, m)
        }
      }
    }
    const ids = [...idSet]
    const ctx = ids.map((id) => {
      const m = bestByCompany.get(id)
      return {
        companyId: id,
        matchScore: m ? Math.round(m.matchScore) : 0,
        topReasons: m ? m.matchReasons.slice(0, 3) : [],
      }
    })
    const scoreIndex = new Map<string, number>()
    for (const [id, m] of bestByCompany) scoreIndex.set(id, m.matchScore)
    return { allCompanyIds: ids, matchContext: ctx, matchScoreIndex: scoreIndex }
  }, [supplierMatches])

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
    stage: "source",
    projectId: activeProjectId,
    projectSubject: subject,
    modules: moduleSpecs,
    companyIds: allCompanyIds,
    matchContext,
    enabled: allCompanyIds.length > 0,
  })

  // Sort reviews: Recommended → Acceptable → Caution → Not Recommended.
  // Within each tier, highest matchScore first so the reader sees the
  // supplier-landing order that best matches procurement intuition.
  const VERDICT_PRIORITY: Record<string, number> = {
    recommended: 0,
    acceptable: 1,
    caution: 2,
    not_recommended: 3,
  }
  const sortedReviews = useMemo(() => {
    return [...reviews].sort((a, b) => {
      const va = VERDICT_PRIORITY[a.verdict] ?? 99
      const vb = VERDICT_PRIORITY[b.verdict] ?? 99
      if (va !== vb) return va - vb
      const sa = matchScoreIndex.get(a.companyId) ?? 0
      const sb = matchScoreIndex.get(b.companyId) ?? 0
      return sb - sa
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, matchScoreIndex])

  // Self-hide when no matches
  if (supplierMatches.size === 0) return null
  // Self-hide when no checks and no reviews loading/loaded
  if (fitness.checks.length === 0 && !isLoading && reviews.length === 0) return null

  return (
    <Card className="border-international-orange/30">
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Header with Chase's avatar */}
        <div className="flex items-center gap-2.5">
          {chase?.avatarImage ? (
            <Image src={chase.avatarImage} alt={chase.name} width={28} height={28} className="rounded-full flex-shrink-0" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-international-orange/10 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="h-3.5 w-3.5 text-international-orange" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {chase?.name ?? "Chase"}&apos;s Supplier Assessment
            </p>
            <p className="text-xs text-muted-foreground">
              {fitness.checks.length > 0
                ? `${fitness.checks.length} check${fitness.checks.length !== 1 ? "s" : ""} found`
                : "All checks passed"}
              {reviews.length > 0 ? ` · ${reviews.length} companies reviewed` : ""}
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
                  <span className="text-muted-foreground">
                    {check.moduleName && (
                      <span className="font-medium text-foreground">{check.moduleName}: </span>
                    )}
                    {check.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section B: AI Company Assessment */}
        {(isLoading || reviews.length > 0) && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company Assessment</p>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
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
                  Reviewing companies...
                </div>
              </div>
            ) : (
              <>
                {summary && (
                  <p className="text-xs text-muted-foreground italic">{summary}</p>
                )}
                <div className="space-y-3">
                  {sortedReviews.map((review) => (
                    <CompanyReviewCard
                      key={review.companyId}
                      review={review}
                      matchScore={matchScoreIndex.get(review.companyId)}
                    />
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

function CompanyReviewCard({
  review,
  matchScore,
}: {
  review: CompanyReview
  matchScore?: number
}) {
  const config = VERDICT_CONFIG[review.verdict] ?? VERDICT_CONFIG.acceptable

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{review.companyName}</p>
        <div className="flex items-center gap-1.5">
          {matchScore != null && (
            <span className="text-[10px] font-mono text-muted-foreground" title="Match score (0-100) from the scoring engine — see reconciliation note if it disagrees with the verdict">
              {Math.round(matchScore)}pt
            </span>
          )}
          <Badge variant={config.variant} className="text-[10px]">
            {config.label}
          </Badge>
        </div>
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
