"use client"

/**
 * @file specialist-review-panel.tsx — Inline specialist review for CAD Lab modules.
 *
 * @description Collapsible panel that shows specialist review verdicts (pass/warn/fail)
 * below each module in the Build page. Users can request reviews from manufacturing,
 * engineering, CTO, and supply chain specialists. Reviews include structured issues,
 * recommendations, and transparent calculation audit trails.
 *
 * @related
 * - Review action: src/actions/cad-lab-reviews.ts
 * - Types: src/lib/cad-lab-types.ts (SpecialistReview)
 * - Build page: src/app/(platform)/the-forge/cad-lab/build/page.tsx
 */

import { useState, useCallback } from "react"
import Image from "next/image"
import {
    CheckCircle2,
    AlertTriangle,
    XCircle,
    ChevronDown,
    ChevronRight,
    Loader2,
    Wrench,
    Cpu,
    Network,
    Truck,
    Calculator,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import { requestSpecialistReview } from "@/actions/cad-lab-reviews"
import type { ReviewRequest } from "@/actions/cad-lab-reviews"
import type { SpecialistReview, ReviewVerdict, CadLabModule, CadLabDesignBrief } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Configuration ──────────────────────────────────────────────────

interface ReviewSpecialist {
    id: string
    label: string
    focus: string
    icon: typeof Wrench
}

const REVIEW_SPECIALISTS: ReviewSpecialist[] = [
    { id: "vp-manufacturing", label: "Fang", focus: "Manufacturability", icon: Wrench },
    { id: "vp-engineering", label: "Jian", focus: "Engineering", icon: Cpu },
    { id: "cto", label: "Max", focus: "Integration", icon: Network },
    { id: "vp-supply-chain", label: "Chase", focus: "Supply Chain", icon: Truck },
]

// ─── Props ──────────────────────────────────────────────────────────

interface SpecialistReviewPanelProps {
    /** Module being reviewed */
    module: CadLabModule
    /** All modules in the project */
    allModules: CadLabModule[]
    /** Existing reviews for this module (if any) */
    reviews?: SpecialistReview[]
    /** Project ID for saving reviews */
    projectId: string
    /** Project subject */
    projectSubject: string
    /** Design brief */
    designBrief?: CadLabDesignBrief
    /** Diagnostic answers */
    diagnosticAnswers?: DiagnosticAnswers
    /** Callback when a new review is added */
    onReviewComplete?: (review: SpecialistReview) => void
}

// ─── Verdict Badge ──────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: ReviewVerdict }) {
    switch (verdict) {
        case "pass":
            return (
                <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> PASS
                </Badge>
            )
        case "warn":
            return (
                <Badge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> WARN
                </Badge>
            )
        case "fail":
            return (
                <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" /> FAIL
                </Badge>
            )
    }
}

// ─── Single Review Card ─────────────────────────────────────────────

function ReviewCard({ review }: { review: SpecialistReview }) {
    const [expanded, setExpanded] = useState(false)
    const specialist = getSpecialistById(review.specialistId)

    return (
        <div className="border rounded-md overflow-hidden">
            {/* Header — always visible */}
            <button
                type="button"
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                {/* Specialist avatar */}
                {specialist?.avatarImage ? (
                    <Image
                        src={specialist.avatarImage}
                        alt={review.specialistName}
                        width={28}
                        height={28}
                        className="rounded-full flex-shrink-0"
                    />
                ) : (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-muted-foreground">
                            {review.specialistName[0]}
                        </span>
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                            {review.specialistName}
                        </span>
                        <VerdictBadge verdict={review.verdict} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                        {review.summary}
                    </p>
                </div>

                {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="border-t p-3 space-y-3 bg-muted/10">
                    {/* Issues */}
                    {review.issues.length > 0 && (
                        <div className="space-y-1.5">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Issues Found
                            </h4>
                            {review.issues.map((issue, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "text-sm rounded-md px-2.5 py-1.5",
                                        issue.severity === "critical" && "bg-destructive/10 text-destructive",
                                        issue.severity === "warning" && "bg-warning/10 text-warning",
                                        issue.severity === "info" && "bg-info/10 text-info",
                                    )}
                                >
                                    <span className="font-medium">[{issue.severity.toUpperCase()}] {issue.category}:</span>{" "}
                                    {issue.message}
                                    {issue.suggestion && (
                                        <p className="text-xs mt-0.5 opacity-80">
                                            Fix: {issue.suggestion}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Recommendations */}
                    {review.recommendations.length > 0 && (
                        <div className="space-y-1">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Recommendations
                            </h4>
                            <ol className="list-decimal list-inside space-y-0.5 text-sm text-foreground">
                                {review.recommendations.map((rec, i) => (
                                    <li key={i}>{rec}</li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {/* Calculations audit trail */}
                    {review.calculations.length > 0 && (
                        <div className="space-y-1">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <Calculator className="h-3 w-3" /> Calculations Performed
                            </h4>
                            <div className="space-y-0.5">
                                {review.calculations.map((calc, i) => (
                                    <div key={i} className="text-xs text-muted-foreground">
                                        <code className="text-international-orange">{calc.tool}</code>
                                        {" → "}
                                        {calc.description}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-xs text-muted-foreground">
                        Reviewed {new Date(review.reviewedAt).toLocaleString()} ({(review.reviewTimeMs / 1000).toFixed(1)}s)
                    </p>
                </div>
            )}
        </div>
    )
}

// ─── Main Component ─────────────────────────────────────────────────

export function SpecialistReviewPanel({
    module,
    allModules,
    reviews = [],
    projectId,
    projectSubject,
    designBrief,
    diagnosticAnswers,
    onReviewComplete,
}: SpecialistReviewPanelProps) {
    const [loadingSpecialist, setLoadingSpecialist] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleRequestReview = useCallback(async (specialistId: string) => {
        setLoadingSpecialist(specialistId)
        setError(null)

        try {
            // Strip SVG/binary display data before sending to server action.
            // Module results include base64 SVG views (svgIso, svgTop, etc.) used
            // for rendering, which can be several MB total and exceed Next.js's
            // 1MB server action body limit. The review context only needs structural
            // text data (geometry dimensions, DFM results, etc.) — not the images.
            const slimModules = allModules.map(m => {
                if (!m.result) return m
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { svgIso, svgTop, svgFront, svgBack, svgRight, svgLeft, svgExploded, ...rest } = m.result
                return { ...m, result: rest }
            })

            const req: ReviewRequest = {
                projectId,
                moduleId: module.id,
                specialistId,
                allModules: slimModules,
                designBrief,
                diagnosticAnswers,
                projectSubject,
            }

            const result = await requestSpecialistReview(req)
            if ("error" in result) {
                setError(result.error)
            } else {
                onReviewComplete?.(result.review)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Review failed")
        } finally {
            setLoadingSpecialist(null)
        }
    }, [projectId, module, allModules, designBrief, diagnosticAnswers, projectSubject, onReviewComplete])

    // Which specialists have already reviewed
    const reviewedBy = new Set(reviews.map(r => r.specialistId))

    // Overall verdict (worst of all reviews)
    const worstVerdict = reviews.length > 0
        ? reviews.some(r => r.verdict === "fail") ? "fail"
        : reviews.some(r => r.verdict === "warn") ? "warn"
        : "pass"
        : null

    const isModuleGenerated = module.status === "generated" || !!module.result

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground">Specialist Reviews</h4>
                    {worstVerdict && <VerdictBadge verdict={worstVerdict as ReviewVerdict} />}
                    {reviews.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            ({reviews.length}/{REVIEW_SPECIALISTS.length})
                        </span>
                    )}
                </div>
            </div>

            {/* Review request buttons */}
            {isModuleGenerated && (
                <div className="flex flex-wrap gap-1.5">
                    {REVIEW_SPECIALISTS.map(spec => {
                        const hasReview = reviewedBy.has(spec.id)
                        const isLoading = loadingSpecialist === spec.id
                        const Icon = spec.icon
                        const existingReview = reviews.find(r => r.specialistId === spec.id)

                        return (
                            <Button
                                key={spec.id}
                                variant={hasReview ? "ghost" : "secondary"}
                                size="sm"
                                disabled={isLoading || !!loadingSpecialist}
                                onClick={() => handleRequestReview(spec.id)}
                                className={cn(
                                    "h-7 text-xs gap-1.5",
                                    hasReview && existingReview?.verdict === "pass" && "text-success",
                                    hasReview && existingReview?.verdict === "warn" && "text-warning",
                                    hasReview && existingReview?.verdict === "fail" && "text-destructive",
                                )}
                            >
                                {isLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : hasReview ? (
                                    existingReview?.verdict === "pass" ? <CheckCircle2 className="h-3 w-3" /> :
                                    existingReview?.verdict === "warn" ? <AlertTriangle className="h-3 w-3" /> :
                                    <XCircle className="h-3 w-3" />
                                ) : (
                                    <Icon className="h-3 w-3" />
                                )}
                                {spec.label}
                                <span className="text-muted-foreground font-normal">
                                    {hasReview ? "Re-review" : spec.focus}
                                </span>
                            </Button>
                        )
                    })}
                </div>
            )}

            {/* Error */}
            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}

            {/* Loading indicator */}
            {loadingSpecialist && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                    <span>
                        {getSpecialistById(loadingSpecialist)?.name ?? "Specialist"} is reviewing {module.name}...
                    </span>
                </div>
            )}

            {/* Existing reviews */}
            {reviews.length > 0 && (
                <div className="space-y-2">
                    {reviews.map(review => (
                        <ReviewCard key={`${review.specialistId}-${review.reviewedAt}`} review={review} />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {reviews.length === 0 && !loadingSpecialist && isModuleGenerated && (
                <p className="text-xs text-muted-foreground italic">
                    No reviews yet. Request a specialist review to validate this module.
                </p>
            )}
        </div>
    )
}
