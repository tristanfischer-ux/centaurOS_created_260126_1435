/**
 * @file FirstGoal.tsx — Step 3 of Plan onboarding.
 *
 * @description Two modes, toggled by the founder:
 *
 *   1. Conversation with Sage (default) — a stub textarea pre-filled with
 *      a kick-off prompt. No LLM call in V1; the text is kept as the goal
 *      title/description draft.
 *   2. Direct entry — structured form per PLAN-SCHEMA §1 / §17.6 / §18:
 *      title, quarter, milestone_date, and 3 disprove-test assumptions.
 *
 * Direct entry exists as the escape hatch required by the red-team critique
 * in PLAN-SCHEMA §17.
 */

"use client"

import { useEffect, useRef } from "react"
import { MessageSquareText, ListChecks } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export type GoalMode = "conversation" | "direct"

export interface GoalFormState {
    mode: GoalMode
    // Conversation mode
    conversationDraft: string
    // Direct-entry mode
    title: string
    quarter: string
    milestoneDate: string
    assumption1: string
    assumption2: string
    assumption3: string
}

export const SAGE_KICKOFF =
    "I'll draft a Goal with you. Start by telling me what you're trying to prove this quarter."

export const EMPTY_GOAL_FORM: GoalFormState = {
    mode: "conversation",
    conversationDraft: SAGE_KICKOFF,
    title: "",
    quarter: suggestQuarter(),
    milestoneDate: suggestMilestoneDate(),
    assumption1: "",
    assumption2: "",
    assumption3: "",
}

function suggestQuarter(): string {
    const now = new Date()
    const q = Math.floor(now.getUTCMonth() / 3) + 1
    return `Q${q} ${now.getUTCFullYear()}`
}

function suggestMilestoneDate(): string {
    // Default: end of current quarter.
    const now = new Date()
    const q = Math.floor(now.getUTCMonth() / 3)
    const endMonth = q * 3 + 3 // e.g. Q1 (0) → month 3 (April), day 0 = 31 Mar
    const end = new Date(Date.UTC(now.getUTCFullYear(), endMonth, 0))
    return end.toISOString().slice(0, 10)
}

export function isGoalFormValid(form: GoalFormState): boolean {
    if (form.mode === "conversation") {
        // Must have written something beyond the kick-off prompt.
        return form.conversationDraft.trim().length > SAGE_KICKOFF.length + 5
    }
    return (
        form.title.trim().length >= 4 &&
        form.quarter.trim().length > 0 &&
        form.milestoneDate.trim().length > 0 &&
        form.assumption1.trim().length > 0 &&
        form.assumption2.trim().length > 0 &&
        form.assumption3.trim().length > 0
    )
}

interface FirstGoalStepProps {
    value: GoalFormState
    onChange: (patch: Partial<GoalFormState>) => void
    disabled?: boolean
}

export function FirstGoalStep({
    value,
    onChange,
    disabled,
}: FirstGoalStepProps): React.ReactElement {
    const firstInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

    useEffect(() => {
        firstInputRef.current?.focus()
    }, [value.mode])

    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Your first Strategic Goal.
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                    A Strategic Goal is one thing you're trying to prove this
                    quarter. Draft it with Sage — Strategy, or enter it
                    directly if you already know the shape.
                </p>
            </div>

            {/* Mode toggle */}
            <div
                role="tablist"
                aria-label="Goal entry mode"
                className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm"
            >
                <ModeTab
                    active={value.mode === "conversation"}
                    onClick={() => onChange({ mode: "conversation" })}
                    icon={<MessageSquareText className="h-4 w-4" />}
                    label="Draft with Sage"
                />
                <ModeTab
                    active={value.mode === "direct"}
                    onClick={() => onChange({ mode: "direct" })}
                    icon={<ListChecks className="h-4 w-4" />}
                    label="Direct entry"
                />
            </div>

            {value.mode === "conversation" ? (
                <div className="space-y-2">
                    <label
                        htmlFor="goal-conversation"
                        className="text-sm font-medium text-foreground"
                    >
                        Conversation with Sage — Strategy
                    </label>
                    <Textarea
                        id="goal-conversation"
                        ref={firstInputRef as React.RefObject<HTMLTextAreaElement>}
                        value={value.conversationDraft}
                        onChange={(e) =>
                            onChange({ conversationDraft: e.target.value })
                        }
                        disabled={disabled}
                        rows={10}
                        className="resize-y text-base leading-relaxed"
                        aria-describedby="goal-conversation-help"
                    />
                    <p
                        id="goal-conversation-help"
                        className="text-xs text-muted-foreground"
                    >
                        Your draft is saved as the goal description. Real-time
                        back-and-forth with Sage arrives in a later release.
                    </p>
                </div>
            ) : (
                <div className="space-y-5">
                    <div className="space-y-2">
                        <label
                            htmlFor="goal-title"
                            className="text-sm font-medium text-foreground"
                        >
                            Goal title
                        </label>
                        <Input
                            id="goal-title"
                            ref={firstInputRef as React.RefObject<HTMLInputElement>}
                            value={value.title}
                            onChange={(e) => onChange({ title: e.target.value })}
                            disabled={disabled}
                            placeholder="e.g. Prove 10 design-partner intros convert to paid pilots"
                            maxLength={140}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label
                                htmlFor="goal-quarter"
                                className="text-sm font-medium text-foreground"
                            >
                                Quarter
                            </label>
                            <Input
                                id="goal-quarter"
                                value={value.quarter}
                                onChange={(e) =>
                                    onChange({ quarter: e.target.value })
                                }
                                disabled={disabled}
                                placeholder="Q2 2026"
                                maxLength={12}
                            />
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="goal-milestone"
                                className="text-sm font-medium text-foreground"
                            >
                                Milestone date
                            </label>
                            <Input
                                id="goal-milestone"
                                type="date"
                                value={value.milestoneDate}
                                onChange={(e) =>
                                    onChange({ milestoneDate: e.target.value })
                                }
                                disabled={disabled}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                What would disprove this goal?
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Three assumptions that have to hold. If any of
                                them breaks, the goal is in trouble.
                            </p>
                        </div>
                        <AssumptionInput
                            id="goal-assumption-1"
                            index={1}
                            value={value.assumption1}
                            onChange={(v) => onChange({ assumption1: v })}
                            disabled={disabled}
                        />
                        <AssumptionInput
                            id="goal-assumption-2"
                            index={2}
                            value={value.assumption2}
                            onChange={(v) => onChange({ assumption2: v })}
                            disabled={disabled}
                        />
                        <AssumptionInput
                            id="goal-assumption-3"
                            index={3}
                            value={value.assumption3}
                            onChange={(v) => onChange({ assumption3: v })}
                            disabled={disabled}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

interface ModeTabProps {
    active: boolean
    onClick: () => void
    icon: React.ReactNode
    label: string
}

function ModeTab({ active, onClick, icon, label }: ModeTabProps): React.ReactElement {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (active
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
            }
        >
            {icon}
            {label}
        </button>
    )
}

interface AssumptionInputProps {
    id: string
    index: number
    value: string
    onChange: (next: string) => void
    disabled?: boolean
}

function AssumptionInput({
    id,
    index,
    value,
    onChange,
    disabled,
}: AssumptionInputProps): React.ReactElement {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent-foreground">
                {index}
            </div>
            <div className="flex-1 space-y-1">
                <label htmlFor={id} className="sr-only">
                    Disprove assumption {index}
                </label>
                <Input
                    id={id}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    placeholder={
                        index === 1
                            ? "e.g. Design partners will take a 30-min intro call"
                            : index === 2
                              ? "e.g. At least 40% convert to a paid pilot"
                              : "e.g. Pilot pricing of £5k lands without pushback"
                    }
                    maxLength={220}
                />
            </div>
        </div>
    )
}
