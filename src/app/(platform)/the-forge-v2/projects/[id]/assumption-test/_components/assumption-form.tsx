"use client"

/**
 * @file assumption-form.tsx — Real form that captures + persists a
 * Products-style assumption test via the createAssumptionTest server action.
 * Backed by the assumption_tests table shipped 2026-04-22.
 */

import { useState, useTransition } from "react"
import { Beaker, CheckCircle2, Target, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { createAssumptionTest } from "@/actions/cad-lab-projects"

type Decision = "keep" | "kill" | "pivot" | ""

interface SubmittedRecord {
    hypothesis: string
    expected: string
    actual: string
    decision: Exclude<Decision, "">
    rationale: string
}

const DECISION_META: Record<Exclude<Decision, "">, { label: string; description: string; tone: string }> = {
    keep: { label: "Keep", description: "Hypothesis validated — continue building against it.", tone: "bg-status-success-light text-status-success border-status-success/30" },
    kill: { label: "Kill", description: "Hypothesis invalidated — stop investing against it.", tone: "bg-destructive/10 text-destructive border-destructive/30" },
    pivot: { label: "Pivot", description: "Hypothesis mixed — reshape the assumption before retesting.", tone: "bg-international-orange/10 text-international-orange border-international-orange/30" },
}

export function AssumptionForm({ projectId }: { projectId: string }): React.ReactElement {
    const [hypothesis, setHypothesis] = useState("")
    const [expected, setExpected] = useState("")
    const [actual, setActual] = useState("")
    const [decision, setDecision] = useState<Decision>("")
    const [rationale, setRationale] = useState("")
    const [submitted, setSubmitted] = useState<SubmittedRecord | null>(null)
    const [isPending, startTransition] = useTransition()

    const canSubmit = hypothesis.trim().length > 0 && expected.trim().length > 0 && decision !== "" && !isPending

    function handleSubmit(e: React.FormEvent): void {
        e.preventDefault()
        if (decision === "") return
        if (!canSubmit) return
        startTransition(async () => {
            const result = await createAssumptionTest({
                projectId,
                hypothesis: hypothesis.trim(),
                expectedOutcome: expected.trim(),
                actualOutcome: actual.trim() || null,
                decision,
                rationale: rationale.trim() || null,
                testedAt: actual.trim().length > 0 ? new Date().toISOString() : null,
            })
            if ("error" in result) {
                toast.error(result.error)
                return
            }
            toast.success("Assumption test logged")
            setSubmitted({
                hypothesis: hypothesis.trim(),
                expected: expected.trim(),
                actual: actual.trim(),
                decision,
                rationale: rationale.trim(),
            })
        })
    }

    function handleReset(): void {
        setHypothesis("")
        setExpected("")
        setActual("")
        setDecision("")
        setRationale("")
        setSubmitted(null)
    }

    if (submitted) {
        const meta = DECISION_META[submitted.decision]
        return (
            <Card className="rounded-xl border border-l-[3px] border-l-status-success">
                <CardContent className="py-5 px-5 space-y-4">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-status-success mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">
                                Assumption test logged
                            </p>
                            <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-0.5">
                                Persisted to the assumption_tests register for this foundry. Products-side propagation ships in Phase 4.
                            </p>
                        </div>
                    </div>
                    <dl className="space-y-3 border-t border-border pt-4">
                        <Row label="Hypothesis" value={submitted.hypothesis} />
                        <Row label="Expected outcome" value={submitted.expected} />
                        {submitted.actual && <Row label="Actual outcome" value={submitted.actual} />}
                        <div className="space-y-1">
                            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">Decision</p>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-xs font-semibold ${meta.tone}`}>
                                    {meta.label}
                                </Badge>
                                <p className="text-[12.5px] text-muted-foreground">{meta.description}</p>
                            </div>
                        </div>
                        {submitted.rationale && <Row label="Rationale" value={submitted.rationale} />}
                    </dl>
                    <div className="flex items-center justify-end pt-2 border-t border-border">
                        <Button size="sm" variant="secondary" onClick={handleReset}>
                            Log another
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-5 space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="at-hypothesis">Hypothesis</Label>
                        <Textarea
                            id="at-hypothesis"
                            rows={3}
                            placeholder="What belief are you testing? Be falsifiable — e.g. 'progressive maize farmers will pay £120 for the device annually'."
                            value={hypothesis}
                            onChange={e => setHypothesis(e.target.value)}
                            required
                            maxLength={5000}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="at-expected">Expected outcome</Label>
                        <Textarea
                            id="at-expected"
                            rows={3}
                            placeholder="What does 'validated' look like? Be specific — e.g. '≥3 of 5 interviewees commit verbally at £120 or above'."
                            value={expected}
                            onChange={e => setExpected(e.target.value)}
                            required
                            maxLength={5000}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="at-actual">Actual outcome</Label>
                        <Textarea
                            id="at-actual"
                            rows={3}
                            placeholder="What actually happened? Leave blank if the test has not run yet."
                            value={actual}
                            onChange={e => setActual(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <section aria-labelledby="decision-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-international-orange" />
                    <Target className="h-4 w-4 text-international-orange" />
                    <h2 id="decision-heading" className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Decision
                    </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(Object.keys(DECISION_META) as Array<Exclude<Decision, "">>).map(key => {
                        const meta = DECISION_META[key]
                        const isSelected = decision === key
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setDecision(key)}
                                aria-pressed={isSelected}
                                className={`text-left rounded-xl border p-4 transition-all ${isSelected ? 'border-international-orange bg-international-orange/[0.05] ring-2 ring-international-orange/20' : 'border-border bg-background hover:bg-muted/30'}`}
                            >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                                    {isSelected && <CheckCircle2 className="h-4 w-4 text-international-orange" />}
                                </div>
                                <p className="text-[12.5px] text-muted-foreground leading-relaxed">{meta.description}</p>
                            </button>
                        )
                    })}
                </div>
            </section>

            <Card className="rounded-xl border">
                <CardContent className="py-5 px-5 space-y-1.5">
                    <Label htmlFor="at-rationale">Rationale (optional)</Label>
                    <Textarea
                        id="at-rationale"
                        rows={3}
                        placeholder="Why this decision? What propagates to Products (SAM confidence, pricing band, persona focus)?"
                        value={rationale}
                        onChange={e => setRationale(e.target.value)}
                    />
                    <p className="text-[11.5px] text-muted-foreground">Feeds the lessons-learned registry and the Products assumption roster.</p>
                </CardContent>
            </Card>

            <Card className="rounded-xl border bg-muted/30">
                <CardContent className="py-5 px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Persists to assumption_tests register</p>
                        <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed max-w-xl">
                            Scoped to your foundry via RLS. Records feed the lessons-learned registry and will propagate to Products assumption roster in Phase 4.
                        </p>
                    </div>
                    <Button type="submit" size="sm" disabled={!canSubmit} className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Beaker className="h-3.5 w-3.5" />}
                        Log assumption test
                    </Button>
                </CardContent>
            </Card>
        </form>
    )
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
    return (
        <div className="space-y-1">
            <dt className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">{label}</dt>
            <dd className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{value}</dd>
        </div>
    )
}
