"use client"

/**
 * @file source-specialist-insights.tsx — Unresolved specialist warnings on Source page.
 *
 * @description Shows unresolved review warnings (severity: warning or critical,
 * no revision applied) grouped by specialist with avatars. Links back to Specify
 * review for that module.
 *
 * @related
 * - Source page: src/app/(platform)/the-forge/cad-lab/source/page.tsx
 * - Review types: src/lib/cad-lab-types.ts
 */

import { useMemo } from "react"
import Image from "next/image"
import { AlertTriangle, XCircle, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import type { SpecialistReview, CadLabModule } from "@/lib/cad-lab-types"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { useRouter } from "next/navigation"

interface SourceSpecialistInsightsProps {
  modules: CadLabModule[]
  moduleReviews: Record<string, SpecialistReview[]>
  revisedModuleIds?: Set<string>
}

export function SourceSpecialistInsights({
  modules,
  moduleReviews,
  revisedModuleIds = new Set(),
}: SourceSpecialistInsightsProps) {
  const router = useRouter()

  // Collect unresolved warnings/criticals grouped by specialist
  const { specialists, totalIssues } = useMemo(() => {
    const bySpecialist: Record<string, { specialistId: string; issues: { moduleName: string; moduleId: string; severity: string; message: string }[] }> = {}
    const moduleMap = new Map(modules.map(m => [m.id, m]))

    for (const [moduleId, reviews] of Object.entries(moduleReviews)) {
      if (revisedModuleIds.has(moduleId)) continue
      const mod = moduleMap.get(moduleId)
      if (!mod) continue

      for (const review of reviews) {
        for (const issue of review.issues) {
          if (issue.severity !== "warning" && issue.severity !== "critical") continue

          if (!bySpecialist[review.specialistId]) {
            bySpecialist[review.specialistId] = {
              specialistId: review.specialistId,
              issues: [],
            }
          }
          bySpecialist[review.specialistId].issues.push({
            moduleName: mod.name,
            moduleId,
            severity: issue.severity,
            message: issue.message,
          })
        }
      }
    }

    const specs = Object.values(bySpecialist)
    return {
      specialists: specs,
      totalIssues: specs.reduce((sum, s) => sum + s.issues.length, 0),
    }
  }, [modules, moduleReviews, revisedModuleIds])

  if (specialists.length === 0) return null

  return (
    <Card className="border-warning/30">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold text-foreground">
              {totalIssues} unresolved issue{totalIssues !== 1 ? "s" : ""} from expert review
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => router.push(`${FORGE_ROUTES.cadLabSpecify}?tab=review`)}
          >
            Review in Specify
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>

        <div className="space-y-3">
          {specialists.map(({ specialistId, issues }) => {
            const spec = getSpecialistById(specialistId)
            return (
              <div key={specialistId} className="flex items-start gap-2.5">
                {spec?.avatarImage ? (
                  <Image
                    src={spec.avatarImage}
                    alt={spec.name}
                    width={24}
                    height={24}
                    className="rounded-full flex-shrink-0 mt-0.5"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {spec?.name?.[0] ?? "?"}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-medium text-foreground">{spec?.name ?? specialistId}</p>
                  {issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      {issue.severity === "critical" ? (
                        <XCircle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0 mt-0.5" />
                      )}
                      <span>
                        <span className="font-medium text-foreground">{issue.moduleName}:</span>{" "}
                        {issue.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
