/**
 * @file onboarding-flow.tsx — Client orchestrator for the 5-step Plan flow.
 *
 * @description Drives step state (1..5 via ?step=N), collects form values, and
 * on the final step persists: foundry purpose (step 2), first Strategic Goal
 * (step 3), fractional invite (step 4, skippable), then routes to /plan.
 *
 * Steps 2 and 3 are saved when the user advances past them, so that an
 * interrupted flow leaves durable progress behind. Step 4 saves on submit
 * only (since it's optional and the user may opt out at any point).
 */

"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { updateFoundryPurpose } from "@/actions/foundry"
import { createStrategicGoal } from "@/actions/plan/goals"
import type { CreateGoalInput } from "@/actions/plan/types"
// NOTE: fractionals.ts is owned by Agent B.4 and may not be merged yet.
// The import is tolerated at type-check time via the ambient declaration
// below; failure to invite at runtime is caught and surfaced in-flow.
// @ts-expect-error — module lands with Agent B.4; see task B.5 spec.
import { inviteFractional } from "@/actions/plan/fractionals"

import { WelcomeStep } from "./steps/Welcome"
import { PurposeStep, PURPOSE_MAX_CHARS } from "./steps/Purpose"
import {
    FirstGoalStep,
    EMPTY_GOAL_FORM,
    SAGE_KICKOFF,
    isGoalFormValid,
    type GoalFormState,
} from "./steps/FirstGoal"
import {
    InviteFractionalStep,
    EMPTY_FRACTIONAL_FORM,
    isFractionalFormValid,
    type FractionalFormState,
} from "./steps/InviteFractional"
import { TourStep } from "./steps/Tour"

type StepNumber = 1 | 2 | 3 | 4 | 5

const STEP_LABELS: Record<StepNumber, string> = {
    1: "Welcome",
    2: "Purpose",
    3: "First goal",
    4: "Fractional",
    5: "Tour",
}

interface OnboardingFlowProps {
    firstName?: string
    foundryId: string
    userId: string
    initialStep?: StepNumber
}

export function OnboardingFlow({
    firstName,
    foundryId,
    userId,
    initialStep = 1,
}: OnboardingFlowProps): React.ReactElement {
    const router = useRouter()

    const [step, setStep] = useState<StepNumber>(initialStep)
    const [purpose, setPurpose] = useState<string>("")
    const [goalForm, setGoalForm] = useState<GoalFormState>(EMPTY_GOAL_FORM)
    const [fractionalForm, setFractionalForm] = useState<FractionalFormState>(
        EMPTY_FRACTIONAL_FORM,
    )
    const [createdGoalId, setCreatedGoalId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const patchGoal = useCallback((patch: Partial<GoalFormState>) => {
        setGoalForm((prev) => ({ ...prev, ...patch }))
    }, [])

    const patchFractional = useCallback((patch: Partial<FractionalFormState>) => {
        setFractionalForm((prev) => ({ ...prev, ...patch }))
    }, [])

    const goalTitlePreview = useMemo(() => {
        if (goalForm.mode === "direct" && goalForm.title.trim()) {
            return goalForm.title.trim()
        }
        if (goalForm.mode === "conversation") {
            const firstLine = goalForm.conversationDraft
                .split("\n")
                .map((s) => s.trim())
                .find((s) => s.length > 0 && s !== SAGE_KICKOFF)
            if (firstLine) return firstLine.slice(0, 80)
        }
        return null
    }, [goalForm])

    const updateStepUrl = useCallback(
        (next: StepNumber) => {
            setStep(next)
            const url = new URL(window.location.href)
            url.searchParams.set("step", String(next))
            window.history.replaceState(null, "", url.toString())
        },
        [],
    )

    const canAdvance = useMemo(() => {
        switch (step) {
            case 1:
                return true
            case 2:
                // Purpose is skippable — Next is always enabled, text just
                // must be within soft-max when provided.
                return purpose.length <= PURPOSE_MAX_CHARS
            case 3:
                return isGoalFormValid(goalForm)
            case 4:
                return isFractionalFormValid(fractionalForm)
            case 5:
                return true
            default:
                return false
        }
    }, [step, purpose, goalForm, fractionalForm])

    // ── Side-effects per step ────────────────────────────────────────────
    const savePurpose = async (): Promise<boolean> => {
        const trimmed = purpose.trim()
        if (trimmed.length === 0) return true // Skip path.
        const result = await updateFoundryPurpose(foundryId, {
            purpose: trimmed,
            mission: null,
            vision: null,
            questionnaire: null,
            updatedAt: new Date().toISOString(),
            updatedBy: userId,
        })
        if (!result.success) {
            setError(result.error || "Couldn't save your purpose. Try again?")
            return false
        }
        return true
    }

    const saveGoal = async (): Promise<boolean> => {
        // Derive CreateGoalInput from whichever mode the founder chose.
        let title: string
        let description: string | null
        let quarter: string
        let milestoneDate: string
        let assumptions: Array<{ assumption: string }> = []

        if (goalForm.mode === "conversation") {
            const draft = goalForm.conversationDraft.trim()
            // Strip the kick-off prompt from the stored description.
            const userText = draft.startsWith(SAGE_KICKOFF)
                ? draft.slice(SAGE_KICKOFF.length).trim()
                : draft
            const firstLine = userText.split("\n")[0]?.trim() || ""
            title = firstLine.slice(0, 140) || "Untitled goal"
            description = userText.length > 0 ? userText : null
            quarter = EMPTY_GOAL_FORM.quarter
            milestoneDate = EMPTY_GOAL_FORM.milestoneDate
            assumptions = []
        } else {
            title = goalForm.title.trim()
            description = null
            quarter = goalForm.quarter.trim()
            milestoneDate = goalForm.milestoneDate
            assumptions = [
                goalForm.assumption1,
                goalForm.assumption2,
                goalForm.assumption3,
            ]
                .map((a) => a.trim())
                .filter((a) => a.length > 0)
                .map((assumption) => ({ assumption }))
        }

        const input: CreateGoalInput = {
            title,
            description,
            quarter,
            milestoneDate,
            purposeConnection: null,
            leadUserId: userId,
            leadFractionalId: null,
            leadSpecialistSlug: null,
            disproveAssumptions: assumptions,
        }

        const result = await createStrategicGoal(input)
        if (!result.success) {
            setError(result.error || "Couldn't save your goal. Try again?")
            return false
        }
        setCreatedGoalId(result.data.id)
        return true
    }

    const saveFractionalInvite = async (): Promise<boolean> => {
        if (!fractionalForm.showForm) return true
        try {
            const invite = inviteFractional as unknown as (input: {
                email: string
                displayName: string
                specialisation: FractionalFormState["specialisation"]
                roleInFoundry: string
                attachGoalId: string | null
            }) => Promise<{ success: boolean; error?: string | null }>
            const result = await invite({
                email: fractionalForm.email.trim(),
                displayName: fractionalForm.displayName.trim(),
                specialisation: fractionalForm.specialisation,
                roleInFoundry: fractionalForm.roleInFoundry.trim(),
                attachGoalId: createdGoalId,
            })
            if (result && result.success === false) {
                setError(
                    result.error ||
                        "Couldn't send the invite. You can try again from the workspace.",
                )
                return false
            }
            return true
        } catch {
            // Module not merged yet, or network error. Non-fatal — founder
            // can re-invite from the workspace.
            setError(
                "Invites are about to arrive — we couldn't send this one right now. You can invite from the workspace once you're in.",
            )
            return false
        }
    }

    // ── Navigation ──────────────────────────────────────────────────────
    const handleNext = (): void => {
        if (!canAdvance || isPending) return
        setError(null)
        startTransition(async () => {
            if (step === 2) {
                const ok = await savePurpose()
                if (!ok) return
            }
            if (step === 3) {
                const ok = await saveGoal()
                if (!ok) return
            }
            if (step === 4) {
                const ok = await saveFractionalInvite()
                if (!ok) return
            }
            if (step === 5) {
                router.push("/plan")
                return
            }
            updateStepUrl((step + 1) as StepNumber)
        })
    }

    const handleBack = (): void => {
        if (step === 1 || isPending) return
        setError(null)
        updateStepUrl((step - 1) as StepNumber)
    }

    const handleSkipStep = (): void => {
        if (isPending) return
        setError(null)
        if (step === 2) {
            setPurpose("")
            startTransition(() => updateStepUrl(3))
            return
        }
        if (step === 4) {
            patchFractional({ showForm: false })
            startTransition(() => updateStepUrl(5))
            return
        }
    }

    const handleCancel = (): void => {
        if (isPending) return
        router.push("/today")
    }

    // ── Render ──────────────────────────────────────────────────────────
    const nextLabel =
        step === 5
            ? "Enter Workspace"
            : step === 4 && !fractionalForm.showForm
              ? "Skip and finish"
              : "Next"

    const skipLabel =
        step === 2
            ? "Skip for now"
            : step === 4 && fractionalForm.showForm
              ? "Skip and invite later"
              : null

    return (
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col px-4 py-10 sm:px-6 lg:px-8">
            {/* Header row: progress + cancel */}
            <div className="mb-8 flex items-center justify-between gap-4">
                <ProgressDots current={step} />
                <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                    <X className="h-4 w-4" />
                    Cancel
                </button>
            </div>

            <Card className="flex-1">
                <CardContent className="p-6 sm:p-10">
                    {step === 1 && <WelcomeStep firstName={firstName} />}
                    {step === 2 && (
                        <PurposeStep
                            value={purpose}
                            onChange={setPurpose}
                            disabled={isPending}
                        />
                    )}
                    {step === 3 && (
                        <FirstGoalStep
                            value={goalForm}
                            onChange={patchGoal}
                            disabled={isPending}
                        />
                    )}
                    {step === 4 && (
                        <InviteFractionalStep
                            value={fractionalForm}
                            onChange={patchFractional}
                            goalTitlePreview={goalTitlePreview}
                            disabled={isPending}
                        />
                    )}
                    {step === 5 && <TourStep />}

                    {error && (
                        <div
                            role="alert"
                            className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                        >
                            {error}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Footer controls */}
            <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={handleBack}
                        disabled={step === 1 || isPending}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Button>
                    {skipLabel && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleSkipStep}
                            disabled={isPending}
                        >
                            {skipLabel}
                        </Button>
                    )}
                </div>
                <Button
                    type="button"
                    onClick={handleNext}
                    disabled={!canAdvance || isPending}
                    size="lg"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving…
                        </>
                    ) : (
                        <>
                            {nextLabel}
                            {step === 5 ? (
                                <Check className="h-4 w-4" />
                            ) : (
                                <ArrowRight className="h-4 w-4" />
                            )}
                        </>
                    )}
                </Button>
            </div>

            {/* Screen-reader step announce */}
            <p className="sr-only" aria-live="polite">
                Step {step} of 5: {STEP_LABELS[step]}
            </p>
        </div>
    )
}

// ── Progress indicator ──────────────────────────────────────────────────

interface ProgressDotsProps {
    current: StepNumber
}

function ProgressDots({ current }: ProgressDotsProps): React.ReactElement {
    return (
        <ol className="flex items-center gap-2" aria-label="Onboarding progress">
            {([1, 2, 3, 4, 5] as const).map((n) => {
                const isDone = n < current
                const isActive = n === current
                return (
                    <li
                        key={n}
                        className={
                            "h-2.5 rounded-full transition-all " +
                            (isActive
                                ? "w-8 bg-accent"
                                : isDone
                                  ? "w-2.5 bg-accent/60"
                                  : "w-2.5 bg-border")
                        }
                        aria-current={isActive ? "step" : undefined}
                    >
                        <span className="sr-only">
                            Step {n}: {STEP_LABELS[n as StepNumber]}
                            {isActive
                                ? " (current)"
                                : isDone
                                  ? " (complete)"
                                  : ""}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}
