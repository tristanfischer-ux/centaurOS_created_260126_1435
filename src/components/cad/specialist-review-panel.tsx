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

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
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
import { requestSpecialistReview, quickSpecialistVerdict } from "@/actions/cad-lab-reviews"
import type { ReviewRequest, QuickVerdictResult } from "@/actions/cad-lab-reviews"
import type { SpecialistReview, ReviewVerdict, CadLabModule, CadLabDesignBrief } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import { recommendSpecialist } from "@/lib/cad-lab/recommend-specialist"

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
    /** Keys of in-flight reviews (survives navigation via context) */
    pendingReviewKeys?: Set<string>
    /** Mark a review as in-flight (persisted in context) */
    onMarkPending?: (moduleId: string, specialistId: string) => void
    /** Clear a pending review (on error) */
    onClearPending?: (moduleId: string, specialistId: string) => void
    /** Specialist ID to auto-trigger (set by batch review orchestrator) */
    triggerReview?: string
    /** Called when auto-triggered review fails (so batch can advance) */
    onReviewError?: (error: string) => void
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
    pendingReviewKeys,
    onMarkPending,
    onClearPending,
    triggerReview,
    onReviewError,
}: SpecialistReviewPanelProps) {
    const [loadingSpecialist, setLoadingSpecialist] = useState<string | null>(null)
    const [detailLoading, setDetailLoading] = useState<string | null>(null)
    const [quickVerdicts, setQuickVerdicts] = useState<Record<string, QuickVerdictResult>>({})
    const [error, setError] = useState<string | null>(null)
    const [showOtherSpecialists, setShowOtherSpecialists] = useState(false)

    // INTENT: Auto-trigger review when batch orchestrator sets triggerReview prop.
    // Only fires when prop changes and no review is already in progress.
    const triggerFiredRef = useRef<string | null>(null)
    useEffect(() => {
        if (triggerReview && triggerReview !== triggerFiredRef.current && !loadingSpecialist && !detailLoading) {
            triggerFiredRef.current = triggerReview
            handleRequestReview(triggerReview)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [triggerReview])

    // INTENT: Rank specialists by relevance to this module's text and diagnostics.
    // The top pick becomes the primary CTA; the rest are in an expandable section.
    const ranking = useMemo(
        () => recommendSpecialist(module, diagnosticAnswers ?? {}),
        [module, diagnosticAnswers],
    )

    // INTENT: Strip SVG/binary display data before sending to server action.
    // Module results include base64 SVG views (svgIso, svgTop, etc.) used
    // for rendering, which can be several MB total and exceed Next.js's
    // 1MB server action body limit.
    const buildSlimRequest = useCallback((specialistId: string): ReviewRequest => {
        const slimModules = allModules.map(m => {
            if (!m.result) return m
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { svgIso, svgTop, svgFront, svgBack, svgRight, svgLeft, svgExploded, ...rest } = m.result
            return { ...m, result: rest }
        })

        return {
            projectId,
            moduleId: module.id,
            specialistId,
            allModules: slimModules,
            designBrief,
            diagnosticAnswers,
            projectSubject,
        }
    }, [projectId, module, allModules, designBrief, diagnosticAnswers, projectSubject])

    const handleRequestReview = useCallback(async (specialistId: string) => {
        setLoadingSpecialist(specialistId)
        setError(null)
        onMarkPending?.(module.id, specialistId)

        const req = buildSlimRequest(specialistId)

        try {
            // ── Phase 1: Quick verdict (~3-5s) ──
            const quickResult = await quickSpecialistVerdict(req)
            if ("quickVerdict" in quickResult) {
                setQuickVerdicts(prev => ({ ...prev, [specialistId]: quickResult.quickVerdict }))
            }
            // Clear loading spinner — quick verdict is shown
            setLoadingSpecialist(null)

            // ── Phase 2: Full review (background, ~15-60s) ──
            setDetailLoading(specialistId)
            const fullResult = await requestSpecialistReview(req)
            setDetailLoading(null)

            if ("error" in fullResult) {
                setError(fullResult.error)
                onClearPending?.(module.id, specialistId)
                onReviewError?.(fullResult.error)
            } else {
                // Clear quick verdict — full review replaces it
                setQuickVerdicts(prev => {
                    const next = { ...prev }
                    delete next[specialistId]
                    return next
                })
                // INTENT: handleReviewComplete in context clears pending automatically
                onReviewComplete?.(fullResult.review)
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Review failed"
            setError(msg)
            setLoadingSpecialist(null)
            setDetailLoading(null)
            onClearPending?.(module.id, specialistId)
            onReviewError?.(msg)
        }
    }, [buildSlimRequest, onReviewComplete, onReviewError, onMarkPending, onClearPending, module.id])

    // Which specialists have already reviewed
    const reviewedBy = new Set(reviews.map(r => r.specialistId))

    // Overall verdict (worst of all reviews)
    const worstVerdict = reviews.length > 0
        ? reviews.some(r => r.verdict === "fail") ? "fail"
        : reviews.some(r => r.verdict === "warn") ? "warn"
        : "pass"
        : null

    // INTENT: Review buttons are shown whenever this panel renders. The parent page
    // already gates rendering behind diagnostics-complete + activeProjectId checks.
    // Previously gated on isModuleGenerated (status=generated|specified or CAD result),
    // but at the Specify stage modules are "decomposed" with no CAD — reviews assess
    // the manufacturing spec, not the CAD model, so the gate was too strict.

    // Resolve recommended specialist from ranking
    const topRanked = ranking[0]
    const topSpec = REVIEW_SPECIALISTS.find(s => s.id === topRanked?.id)
    const otherSpecs = REVIEW_SPECIALISTS.filter(s => s.id !== topRanked?.id)

    // INTENT: Check context-level pending state so spinners survive navigation
    const isPendingInContext = useCallback((specialistId: string) => {
        return pendingReviewKeys?.has(`${module.id}:${specialistId}`) ?? false
    }, [pendingReviewKeys, module.id])
    const anyPendingInContext = pendingReviewKeys ? Array.from(pendingReviewKeys).some(k => k.startsWith(`${module.id}:`)) : false

    /** Render a specialist button (shared between primary and secondary) */
    function SpecButton({ spec, primary }: { spec: ReviewSpecialist; primary?: boolean }) {
        const hasReview = reviewedBy.has(spec.id)
        const isLoading = loadingSpecialist === spec.id || isPendingInContext(spec.id)
        const Icon = spec.icon
        const existingReview = reviews.find(r => r.specialistId === spec.id)

        return (
            <Button
                variant={primary ? (hasReview ? "secondary" : "default") : (hasReview ? "ghost" : "secondary")}
                size="sm"
                disabled={isLoading || !!loadingSpecialist || anyPendingInContext}
                onClick={() => handleRequestReview(spec.id)}
                className={cn(
                    primary ? "text-sm gap-2" : "h-7 text-xs gap-1.5",
                    hasReview && existingReview?.verdict === "pass" && "text-success",
                    hasReview && existingReview?.verdict === "warn" && "text-warning",
                    hasReview && existingReview?.verdict === "fail" && "text-destructive",
                )}
            >
                {isLoading ? (
                    <Loader2 className={cn("animate-spin", primary ? "h-4 w-4" : "h-3 w-3")} />
                ) : hasReview ? (
                    existingReview?.verdict === "pass" ? <CheckCircle2 className={primary ? "h-4 w-4" : "h-3 w-3"} /> :
                    existingReview?.verdict === "warn" ? <AlertTriangle className={primary ? "h-4 w-4" : "h-3 w-3"} /> :
                    <XCircle className={primary ? "h-4 w-4" : "h-3 w-3"} />
                ) : (
                    <Icon className={primary ? "h-4 w-4" : "h-3 w-3"} />
                )}
                {primary
                    ? `Get ${spec.label}'s ${spec.focus} Review`
                    : <>{spec.label} <span className="text-muted-foreground font-normal">{hasReview ? "Re-review" : spec.focus}</span></>}
                {primary && hasReview && (
                    <span className="text-muted-foreground font-normal text-xs">(Re-review)</span>
                )}
            </Button>
        )
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground">Specialist Reviews</h4>
                    {worstVerdict && <VerdictBadge verdict={worstVerdict as ReviewVerdict} />}
                    {reviews.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            ({reviews.length} review{reviews.length !== 1 ? "s" : ""})
                        </span>
                    )}
                </div>
            </div>

            {/* Recommended specialist — primary CTA */}
            {topSpec && (
                <div className="space-y-1.5">
                    <SpecButton spec={topSpec} primary />
                    {topRanked.matchedKeywords.length > 0 && (
                        <p className="text-[11px] text-muted-foreground pl-1">
                            Matched: {topRanked.matchedKeywords.slice(0, 4).join(", ")}
                        </p>
                    )}
                </div>
            )}

            {/* Other specialists — expandable */}
            <div>
                <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    onClick={() => setShowOtherSpecialists(prev => !prev)}
                >
                    {showOtherSpecialists ? (
                        <ChevronDown className="h-3 w-3" />
                    ) : (
                        <ChevronRight className="h-3 w-3" />
                    )}
                    Choose a different specialist
                </button>
                {showOtherSpecialists && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {otherSpecs.map(spec => (
                            <SpecButton key={spec.id} spec={spec} />
                        ))}
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}

            {/* Loading indicator — local state OR context-level pending (survives navigation) */}
            {(loadingSpecialist || (!loadingSpecialist && anyPendingInContext && Object.keys(quickVerdicts).length === 0)) && (() => {
                const activeSpecId = loadingSpecialist ?? Array.from(pendingReviewKeys ?? []).find(k => k.startsWith(`${module.id}:`))?.split(":")[1]
                return activeSpecId ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                        <span>
                            {getSpecialistById(activeSpecId)?.name ?? "Specialist"} is reviewing {module.name}...
                        </span>
                    </div>
                ) : null
            })()}

            {/* Quick verdicts (shown while full review loads in background) */}
            {Object.entries(quickVerdicts).map(([specId, qv]) => {
                const spec = getSpecialistById(specId)
                const isExpandingDetail = detailLoading === specId
                return (
                    <div key={`qv-${specId}`} className="border rounded-md p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                            {spec?.avatarImage ? (
                                <Image
                                    src={spec.avatarImage}
                                    alt={spec.name}
                                    width={28}
                                    height={28}
                                    className="rounded-full flex-shrink-0"
                                />
                            ) : (
                                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        {spec?.name?.[0] ?? "?"}
                                    </span>
                                </div>
                            )}
                            <span className="text-sm font-medium text-foreground">
                                {spec?.name ?? specId}
                            </span>
                            <VerdictBadge verdict={qv.verdict} />
                        </div>
                        <p className="text-xs text-muted-foreground">{qv.summary}</p>
                        {isExpandingDetail && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span className="animate-pulse">Expanding analysis…</span>
                            </div>
                        )}
                    </div>
                )
            })}

            {/* Existing reviews */}
            {reviews.length > 0 && (
                <div className="space-y-2">
                    {reviews.map(review => (
                        <ReviewCard key={`${review.specialistId}-${review.reviewedAt}`} review={review} />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {reviews.length === 0 && !loadingSpecialist && !anyPendingInContext && (
                <p className="text-xs text-muted-foreground italic">
                    No reviews yet — optional, but recommended for extra confidence.
                </p>
            )}
        </div>
    )
}
