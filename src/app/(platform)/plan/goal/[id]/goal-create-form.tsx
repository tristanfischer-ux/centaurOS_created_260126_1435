"use client"

/**
 * @file goal-create-form.tsx — Goal-create variant (params.id === 'new').
 * V1 ships direct-entry only (per PLAN-MOCKUP-GOAL-CREATE red-team #5). The
 * conversation-mode toggle is visible but the chat flow lands later.
 * Wires to `createStrategicGoal` (Agent B.4 owns `src/actions/plan/goals.ts`).
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm } from "react-hook-form"
import { z } from "zod"
import { ChevronLeft, MessagesSquare } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GoalCreateFields, type GoalCreateFormValues } from "./goal-create-fields"

const todayPlus90 = () => {
    const d = new Date()
    d.setDate(d.getDate() + 90)
    return d.toISOString().slice(0, 10)
}

const currentQuarter = () => {
    const now = new Date()
    const q = Math.floor(now.getMonth() / 3) + 1
    return `Q${q} ${now.getFullYear()}`
}

const formSchema = z.object({
    title: z.string().trim().min(1, "Give this Goal a clear title").max(200, "Max 200 characters"),
    description: z.string().trim().max(10_000).optional(),
    quarter: z.string().regex(/^Q[1-4] \d{4}$/, 'Format must be "Q2 2026"'),
    milestoneDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
    assumptions: z
        .array(
            z.object({
                assumption: z.string().trim().min(1, "Describe the assumption").max(500),
            }),
        )
        .min(1, "Add at least one disprove assumption")
        .max(3, "Maximum 3 assumptions"),
}) satisfies z.ZodType<GoalCreateFormValues>

type Mode = "direct" | "conversation"

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
    const btn = (m: Mode, label: React.ReactNode) => (
        <button
            type="button"
            onClick={() => onChange(m)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium transition-colors ${
                mode === m ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
        >
            {label}
        </button>
    )
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Mode</span>
            <div className="inline-flex rounded-full border border-border bg-muted/30 p-0.5">
                {btn("direct", "Direct entry")}
                {btn("conversation", <><MessagesSquare className="h-3 w-3" /> Conversation</>)}
            </div>
        </div>
    )
}

type CreateStrategicGoalFn = (input: {
    title: string
    description?: string | null
    quarter: string
    milestoneDate: string
    disproveAssumptions?: Array<{
        assumption: string
        current_state: "holding" | "slipping" | "broken" | "unknown"
    }>
}) => Promise<{ success: true; data: { id: string } } | { error: string }>

export function GoalCreateForm() {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [mode, setMode] = useState<Mode>("direct")

    const form = useForm<GoalCreateFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            description: "",
            quarter: currentQuarter(),
            milestoneDate: todayPlus90(),
            assumptions: [{ assumption: "" }, { assumption: "" }, { assumption: "" }],
        },
    })

    const fieldArray = useFieldArray({ control: form.control, name: "assumptions" })

    const onSubmit = (values: GoalCreateFormValues) => {
        setSubmitError(null)
        startTransition(async () => {
            try {
                // Dynamic import so this file compiles before Agent B.4 lands the module.
                const mod = (await import("@/actions/plan/goals").catch(() => null)) as
                    | { createStrategicGoal?: CreateStrategicGoalFn }
                    | null
                if (!mod?.createStrategicGoal) {
                    setSubmitError(
                        "Goal creation is being wired up. Check back in a minute — this action ships alongside the rest of Plan.",
                    )
                    return
                }
                const result = await mod.createStrategicGoal({
                    title: values.title,
                    description: values.description || null,
                    quarter: values.quarter,
                    milestoneDate: values.milestoneDate,
                    disproveAssumptions: values.assumptions.map((a) => ({
                        assumption: a.assumption,
                        current_state: "unknown" as const,
                    })),
                })
                if ("error" in result && result.error) {
                    setSubmitError(result.error)
                    return
                }
                if ("success" in result && result.success) {
                    router.push(`/plan/goal/${result.data.id}`)
                    router.refresh()
                }
            } catch (err) {
                setSubmitError(err instanceof Error ? err.message : "Something went wrong")
            }
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => router.push("/plan")}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" /> Back to Plan
                </button>
                <ModeToggle mode={mode} onChange={setMode} />
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Badge variant="brand" size="md" className="rounded-full">
                            New Strategic Goal
                        </Badge>
                    </div>
                    <CardTitle className="text-2xl">Define a goal worth pressure-testing</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        One quarterly milestone, up to three claims you&rsquo;ll try to break. Keep it tight —
                        you can edit later.
                    </p>
                </CardHeader>
                <CardContent>
                    {mode === "conversation" ? (
                        <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                            <p className="mb-2 font-medium text-foreground">Conversation mode is coming next</p>
                            <p>
                                Direct entry captures the same goal in under a minute. Switch back to &ldquo;Direct
                                entry&rdquo; above to continue.
                            </p>
                        </div>
                    ) : (
                        <GoalCreateFields
                            form={form}
                            fieldArray={fieldArray}
                            submitError={submitError}
                            isPending={isPending}
                            onCancel={() => router.push("/plan")}
                            onSubmit={onSubmit}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
