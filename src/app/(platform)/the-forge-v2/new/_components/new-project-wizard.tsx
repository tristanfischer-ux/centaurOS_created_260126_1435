"use client"

/**
 * @file new-project-wizard.tsx — Client wizard for PROJECT-CREATE (v2).
 *
 * @description Conversational 3-step wizard that captures a fresh build brief
 * and hands off to the existing `createCadLabProject` server action. Step 1
 * captures the product description (subject), step 2 collects optional
 * reference URLs, step 3 summarises before submit. On success the user lands
 * on /the-forge-v2/projects/[id].
 *
 * @related
 * - Mockup: FORGE-MOCKUP-PROJECT-CREATE.html
 * - Action: createCadLabProject in @/actions/cad-lab-projects
 * - Shell: ../../_components/workspace-shell
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { createCadLabProject } from "@/actions/cad-lab-projects"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"

// INTENT: hard validation bounds used both for the live counter and the
// server-action call — mirrors the mockup's "short voice memo" framing.
const SUBJECT_MIN = 20
const SUBJECT_MAX = 1000
const REFERENCE_SLOTS = 3

type StepId = 1 | 2 | 3

const STEP_LABELS: Record<StepId, string> = {
    1: "What are you building?",
    2: "Any references?",
    3: "Ready to decompose?",
}

export function NewProjectWizard(): React.ReactElement {
    const router = useRouter()
    const [step, setStep] = useState<StepId>(1)
    const [subject, setSubject] = useState<string>("")
    const [references, setReferences] = useState<string[]>(() =>
        Array.from({ length: REFERENCE_SLOTS }, () => ""),
    )
    const [isPending, startTransition] = useTransition()

    const trimmedSubject = subject.trim()
    const subjectLength = trimmedSubject.length
    const subjectValid = subjectLength >= SUBJECT_MIN && subjectLength <= SUBJECT_MAX

    const filledReferences = useMemo(
        () => references.map((r) => r.trim()).filter((r) => r.length > 0),
        [references],
    )

    function updateReference(index: number, value: string): void {
        setReferences((prev) => {
            const next = [...prev]
            next[index] = value
            return next
        })
    }

    function handleNext(): void {
        if (step === 1) {
            if (!subjectValid) {
                toast.error(
                    subjectLength < SUBJECT_MIN
                        ? `Add at least ${SUBJECT_MIN - subjectLength} more character${SUBJECT_MIN - subjectLength === 1 ? "" : "s"} so the specialists have enough to work with.`
                        : `Trim the description to ${SUBJECT_MAX} characters or fewer.`,
                )
                return
            }
            setStep(2)
            return
        }
        if (step === 2) {
            setStep(3)
            return
        }
    }

    function handleBack(): void {
        if (step === 2) setStep(1)
        else if (step === 3) setStep(2)
    }

    function handleSubmit(): void {
        if (!subjectValid) {
            toast.error("Add a product description before starting the build.")
            setStep(1)
            return
        }

        startTransition(async () => {
            // DECISION: references are captured in local state only for now —
            // the existing `createCadLabProject` signature does not accept
            // them. They'll be wired up when the reference-ingestion action
            // lands (see mockup "Step 4 preview" / ref-picker).
            const result = await createCadLabProject(trimmedSubject)

            if ("error" in result) {
                toast.error(result.error)
                return
            }

            toast.success("Project created — starting decomposition.")
            router.push(`/the-forge-v2/projects/${result.projectId}`)
        })
    }

    // ─── Progress bar ────────────────────────────────────────────────
    const progressPercent = (step / 3) * 100

    return (
        <div className="space-y-8">
            {/* Progress strip */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span className="font-mono uppercase tracking-widest">
                        Step {step} of 3
                    </span>
                    <span>{STEP_LABELS[step]}</span>
                </div>
                <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={step}
                    aria-valuemin={1}
                    aria-valuemax={3}
                    aria-label={`Wizard progress: step ${step} of 3`}
                >
                    <div
                        className="h-full rounded-full bg-international-orange transition-all duration-300 ease-out"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            {/* Step card */}
            <Card>
                <CardContent className="space-y-6 p-6 sm:p-8">
                    {step === 1 && (
                        <StepOne
                            subject={subject}
                            onChange={setSubject}
                            length={subjectLength}
                            valid={subjectValid}
                        />
                    )}

                    {step === 2 && (
                        <StepTwo
                            references={references}
                            onChange={updateReference}
                        />
                    )}

                    {step === 3 && (
                        <StepThree
                            subject={trimmedSubject}
                            references={filledReferences}
                            onEdit={(target) => setStep(target)}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                    >
                        <Link href="/the-forge-v2">Cancel</Link>
                    </Button>
                    {step > 1 && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleBack}
                            disabled={isPending}
                            className="gap-1.5"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back
                        </Button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {step < 3 && (
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleNext}
                            disabled={isPending || (step === 1 && !subjectValid)}
                            className="gap-1.5 bg-international-orange text-white hover:bg-international-orange/90"
                        >
                            Next
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    {step === 3 && (
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleSubmit}
                            disabled={isPending || !subjectValid}
                            className="gap-1.5 bg-international-orange text-white hover:bg-international-orange/90"
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Starting…
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Start building
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Step 1 ──────────────────────────────────────────────────────────

function StepOne({
    subject,
    onChange,
    length,
    valid,
}: {
    subject: string
    onChange: (value: string) => void
    length: number
    valid: boolean
}): React.ReactElement {
    const belowMin = length > 0 && length < SUBJECT_MIN
    const aboveMax = length > SUBJECT_MAX

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <h2 className={typography.wizardStepTitle}>
                    What are you building?
                </h2>
                <p className={typography.wizardStepDescription}>
                    Describe the product like you would brief a capable
                    co-founder over coffee. Call out the problem, envelope
                    (cost, mass, timeline), and anything non-obvious.
                </p>
                <p className={cn(typography.bodySmall, "text-international-orange")}>
                    <strong>What&rsquo;s the smart version?</strong> Cheap intelligence makes most physical
                    products re-imaginable. If your idea is a normal product, mention what
                    sensors, data, or learning loop would make it 10× better — the specialists
                    will design the BOM around that.
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="subject">Product description</Label>
                <textarea
                    id="subject"
                    name="subject"
                    value={subject}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="e.g. A high-altitude solar UAV — 22m wing, 14-day persistence, maritime surveillance market. Target unit cost under £200k. First flight in 6 months."
                    rows={8}
                    maxLength={SUBJECT_MAX + 200}
                    aria-invalid={!valid && length > 0}
                    aria-describedby="subject-counter subject-hint"
                    className={cn(
                        "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                        "placeholder:text-muted-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "resize-y leading-relaxed",
                        aboveMax && "border-destructive focus-visible:ring-destructive",
                    )}
                />
                <div className="flex items-center justify-between">
                    <p
                        id="subject-hint"
                        className={typography.bodySmall}
                    >
                        The specialists listen for problem, market, envelope,
                        regulatory stack, and timing.
                    </p>
                    <p
                        id="subject-counter"
                        className={cn(
                            typography.wizardCharacterCount,
                            belowMin && "text-international-orange",
                            aboveMax && "text-destructive",
                            valid && "text-muted-foreground",
                        )}
                    >
                        {length} / {SUBJECT_MAX}
                        {belowMin && ` · ${SUBJECT_MIN - length} more to unlock`}
                    </p>
                </div>
            </div>
        </div>
    )
}

// ─── Step 2 ──────────────────────────────────────────────────────────

function StepTwo({
    references,
    onChange,
}: {
    references: string[]
    onChange: (index: number, value: string) => void
}): React.ReactElement {
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <h2 className={typography.wizardStepTitle}>
                    Any references?
                </h2>
                <p className={typography.wizardStepDescription}>
                    Optional. Paste links to existing products, papers,
                    datasheets, or competitor specs. The specialists use them
                    as anchors during decomposition. Leave blank to start from
                    a clean sheet.
                </p>
            </div>

            <div className="space-y-3">
                {references.map((value, index) => (
                    <div key={index} className="space-y-1.5">
                        <Label htmlFor={`reference-${index}`}>
                            Reference {index + 1}
                            <span className={cn(typography.bodySmall, "ml-2 normal-case font-normal")}>
                                optional
                            </span>
                        </Label>
                        <Input
                            id={`reference-${index}`}
                            name={`reference-${index}`}
                            type="url"
                            value={value}
                            onChange={(e) => onChange(index, e.target.value)}
                            placeholder="https://…"
                            inputMode="url"
                            autoComplete="off"
                        />
                    </div>
                ))}
            </div>

            <p className={typography.bodySmall}>
                File uploads land in the project detail view after creation —
                you can drop datasheets, CAD snapshots, and slide decks there.
            </p>
        </div>
    )
}

// ─── Step 3 ──────────────────────────────────────────────────────────

function StepThree({
    subject,
    references,
    onEdit,
}: {
    subject: string
    references: string[]
    onEdit: (step: StepId) => void
}): React.ReactElement {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className={typography.wizardStepTitle}>
                    Ready to decompose?
                </h2>
                <p className={typography.wizardStepDescription}>
                    Review the brief below. The specialists will draft rev 0.1
                    of your Brief, Modules, BOM skeleton, and Risks register
                    from it — everything stays editable afterwards.
                </p>
            </div>

            <div className="space-y-4">
                <SummaryBlock
                    title="What you're building"
                    value={subject}
                    onEdit={() => onEdit(1)}
                />

                <SummaryBlock
                    title={`References (${references.length})`}
                    value={
                        references.length > 0
                            ? references.join("\n")
                            : "None — starting clean."
                    }
                    onEdit={() => onEdit(2)}
                    mono={references.length > 0}
                />
            </div>

            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-international-orange" />
                <p className={typography.bodySmall}>
                    Nothing is committed until you press <span className="font-semibold text-foreground">Start building</span>.
                    After that, rev 0.1 drafts appear on your new project
                    cockpit within a minute or two.
                </p>
            </div>
        </div>
    )
}

function SummaryBlock({
    title,
    value,
    onEdit,
    mono = false,
}: {
    title: string
    value: string
    onEdit: () => void
    mono?: boolean
}): React.ReactElement {
    return (
        <div className="rounded-md border border-border bg-background p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className={cn(typography.label, "text-foreground/70")}>
                    {title}
                </h3>
                <button
                    type="button"
                    onClick={onEdit}
                    className="text-xs font-medium text-international-orange hover:underline"
                >
                    Edit
                </button>
            </div>
            <p
                className={cn(
                    "whitespace-pre-wrap text-sm text-foreground leading-relaxed",
                    mono && "font-mono text-xs break-all",
                )}
            >
                {value}
            </p>
        </div>
    )
}
