"use client"

/**
 * @file intake-wizard.tsx — Flow A: guided 5-step project intake wizard.
 *
 * @description Replaces the blank text box with a guided 5-step form that
 * captures structured numerics alongside the free-text brief. The structured
 * fields land in cad_lab_projects.target_scale (JSONB array), used by Gate 1
 * as ground truth for numeric/unit verification against Chase's extracted brief.
 *
 * Steps:
 *   1. What are you building?   → subject (one-sentence pitch, max 200 chars)
 *   2. Target scale / capacity  → target_scale [{value, unit, dimension}…]
 *   3. Who is it for?           → market_segment + geography (multi-select chips)
 *   4. What stage are you at?   → startup_stage (idea|prototype|raising|scaling)
 *   5. Anything else?           → additional_context (max 1000 chars)
 *   6. Review screen            → assembled brief, "Start the engine" CTA
 *
 * Design system:
 *   - Light mode only. International Orange for primary CTAs.
 *   - shadcn-ui: Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea, Badge.
 *   - No "AI emphasis" copy. No hardcoded colours — semantic tokens only.
 *   - British spelling in all user-facing copy.
 *
 * Data flow:
 *   Submit → startProjectWithAutopilot(subject, wizardFields)
 *   → createCadLabProject (fires Chase)
 *   → persistWizardFields (writes target_scale etc.)
 *   → startAutopilot
 *   → redirect /the-forge-v2/projects/[id]
 *
 * @related
 *   - src/actions/start-project-with-autopilot.ts
 *   - src/app/(platform)/the-forge-v2/new/page.tsx
 */

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
    startProjectWithAutopilot,
    type TargetScaleEntry,
    type WizardIntakeFields,
} from "@/actions/start-project-with-autopilot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// ─── Constants ──────────────────────────────────────────────────────────

const TOTAL_STEPS = 5

const SUBJECT_MIN = 20
const SUBJECT_MAX = 200
const ADDITIONAL_CONTEXT_MAX = 1000

const DIMENSION_OPTIONS: Array<{ value: TargetScaleEntry["dimension"]; label: string }> = [
    { value: "power", label: "Power" },
    { value: "energy", label: "Energy" },
    { value: "area", label: "Area" },
    { value: "throughput", label: "Throughput" },
    { value: "volume", label: "Volume" },
    { value: "count", label: "Count" },
    { value: "length", label: "Length" },
    { value: "mass", label: "Mass" },
    { value: "time", label: "Time" },
]

const GEOGRAPHY_OPTIONS = [
    "United Kingdom",
    "European Union",
    "United States",
    "Canada",
    "Australia",
    "Middle East",
    "South East Asia",
    "Global",
]

const STAGE_OPTIONS: Array<{
    value: "idea" | "prototype" | "raising" | "scaling"
    label: string
    description: string
}> = [
    {
        value: "idea",
        label: "Idea",
        description: "Concept stage — no hardware built yet",
    },
    {
        value: "prototype",
        label: "Prototype",
        description: "Working demonstrator or proof of concept exists",
    },
    {
        value: "raising",
        label: "Raising",
        description: "Raising a round to fund the build",
    },
    {
        value: "scaling",
        label: "Scaling",
        description: "First unit built; working towards volume",
    },
]

// ─── Types ───────────────────────────────────────────────────────────────

interface ScaleRow extends TargetScaleEntry {
    id: string // ephemeral client-side key
}

interface FormState {
    // Step 1
    subject: string
    // Step 2
    scaleRows: ScaleRow[]
    // Step 3
    marketSegment: string
    geography: string[]
    // Step 4
    startupStage: "idea" | "prototype" | "raising" | "scaling" | null
    // Step 5
    additionalContext: string
}

function makeEmptyScaleRow(): ScaleRow {
    return {
        id: Math.random().toString(36).slice(2),
        value: 0,
        unit: "",
        dimension: "power",
    }
}

// ─── Step labels ──────────────────────────────────────────────────────────

const STEP_LABELS = [
    "What are you building?",
    "Target scale",
    "Who is it for?",
    "What stage?",
    "Anything else?",
]

// ─── Main component ───────────────────────────────────────────────────────

export function IntakeWizard(): React.ReactElement {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [form, setForm] = useState<FormState>({
        subject: "",
        scaleRows: [makeEmptyScaleRow()],
        marketSegment: "",
        geography: [],
        startupStage: null,
        additionalContext: "",
    })
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    // ─── Step validation ─────────────────────────────────────────────────

    function isStepValid(s: number): boolean {
        switch (s) {
            case 1:
                return (
                    form.subject.trim().length >= SUBJECT_MIN &&
                    form.subject.length <= SUBJECT_MAX
                )
            case 2:
                // At least one scale row must have a value > 0 and a unit
                return form.scaleRows.some(
                    (r) => r.value > 0 && r.unit.trim().length > 0,
                )
            case 3:
                return form.marketSegment.trim().length > 0
            case 4:
                return form.startupStage !== null
            case 5:
                return form.additionalContext.length <= ADDITIONAL_CONTEXT_MAX
            default:
                return true
        }
    }

    // ─── Navigation ──────────────────────────────────────────────────────

    function goNext(): void {
        if (step < TOTAL_STEPS) setStep((s) => s + 1)
        else handleSubmit()
    }

    function goBack(): void {
        if (step > 1) setStep((s) => s - 1)
    }

    // ─── Step 2 helpers ──────────────────────────────────────────────────

    function updateScaleRow(id: string, patch: Partial<ScaleRow>): void {
        setForm((f) => ({
            ...f,
            scaleRows: f.scaleRows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }))
    }

    function addScaleRow(): void {
        setForm((f) => ({
            ...f,
            scaleRows: [...f.scaleRows, makeEmptyScaleRow()],
        }))
    }

    function removeScaleRow(id: string): void {
        setForm((f) => ({
            ...f,
            scaleRows: f.scaleRows.filter((r) => r.id !== id),
        }))
    }

    // ─── Step 3 helpers ──────────────────────────────────────────────────

    function toggleGeography(geo: string): void {
        setForm((f) => ({
            ...f,
            geography: f.geography.includes(geo)
                ? f.geography.filter((g) => g !== geo)
                : [...f.geography, geo],
        }))
    }

    // ─── Submit ───────────────────────────────────────────────────────────

    function handleSubmit(): void {
        setSubmitError(null)

        const validScaleRows = form.scaleRows.filter(
            (r) => r.value > 0 && r.unit.trim().length > 0,
        )

        const wizardFields: WizardIntakeFields = {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        targetScale: validScaleRows.map(({ id: _ephemeralId, ...rest }) => rest),
            marketSegment: form.marketSegment.trim() || undefined,
            geography: form.geography.length > 0 ? form.geography : undefined,
            startupStage: form.startupStage ?? undefined,
            additionalContext: form.additionalContext.trim() || undefined,
        }

        startTransition(async () => {
            try {
                const result = await startProjectWithAutopilot(
                    form.subject.trim(),
                    wizardFields,
                )
                if (!result.ok) {
                    setSubmitError(result.error)
                    return
                }
                router.push(`/the-forge-v2/projects/${result.projectId}`)
            } catch (err) {
                const message =
                    err instanceof Error && err.message
                        ? err.message
                        : "Something went wrong starting the project. Try once more."
                console.error("[IntakeWizard] startProjectWithAutopilot threw:", err)
                setSubmitError(message)
            }
        })
    }

    // ─── Review screen data ──────────────────────────────────────────────

    const validScaleRowsForReview = form.scaleRows.filter(
        (r) => r.value > 0 && r.unit.trim().length > 0,
    )

    // ─── Render ──────────────────────────────────────────────────────────

    // Review screen (after step 5)
    if (step > TOTAL_STEPS) {
        return (
            <ReviewScreen
                form={form}
                validScaleRows={validScaleRowsForReview}
                onEdit={(s) => setStep(s)}
                onSubmit={handleSubmit}
                isPending={isPending}
                submitError={submitError}
            />
        )
    }

    const canAdvance = isStepValid(step)
    const isLastStep = step === TOTAL_STEPS

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Progress bar */}
            <ProgressBar currentStep={step} totalSteps={TOTAL_STEPS} />

            {/* Step card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <span
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-international-orange text-white text-sm font-semibold"
                            aria-hidden="true"
                        >
                            {step}
                        </span>
                        <CardTitle className="text-xl">
                            {STEP_LABELS[step - 1]}
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {step === 1 && (
                        <Step1
                            value={form.subject}
                            onChange={(v) => setForm((f) => ({ ...f, subject: v }))}
                        />
                    )}
                    {step === 2 && (
                        <Step2
                            rows={form.scaleRows}
                            onUpdate={updateScaleRow}
                            onAdd={addScaleRow}
                            onRemove={removeScaleRow}
                        />
                    )}
                    {step === 3 && (
                        <Step3
                            marketSegment={form.marketSegment}
                            geography={form.geography}
                            onMarketChange={(v) =>
                                setForm((f) => ({ ...f, marketSegment: v }))
                            }
                            onToggleGeo={toggleGeography}
                        />
                    )}
                    {step === 4 && (
                        <Step4
                            selected={form.startupStage}
                            onSelect={(v) =>
                                setForm((f) => ({ ...f, startupStage: v }))
                            }
                        />
                    )}
                    {step === 5 && (
                        <Step5
                            value={form.additionalContext}
                            onChange={(v) =>
                                setForm((f) => ({ ...f, additionalContext: v }))
                            }
                        />
                    )}
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <Button
                    variant="ghost"
                    onClick={goBack}
                    disabled={step === 1}
                    type="button"
                >
                    ← Back
                </Button>

                <span className="text-sm text-muted-foreground">
                    Step {step} of {TOTAL_STEPS}
                </span>

                <Button
                    variant="default"
                    className="bg-international-orange hover:bg-international-orange/90 text-white"
                    onClick={isLastStep ? () => setStep(TOTAL_STEPS + 1) : goNext}
                    disabled={!canAdvance}
                    aria-disabled={!canAdvance}
                    type="button"
                >
                    {isLastStep ? "Review brief →" : "Continue →"}
                </Button>
            </div>

            {submitError ? (
                <p role="alert" className="text-sm text-destructive text-center">
                    {submitError}
                </p>
            ) : null}
        </div>
    )
}

// ─── Progress bar ─────────────────────────────────────────────────────────

function ProgressBar({
    currentStep,
    totalSteps,
}: {
    currentStep: number
    totalSteps: number
}): React.ReactElement {
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
                {STEP_LABELS.map((label, i) => (
                    <span
                        key={label}
                        className={
                            i + 1 === currentStep
                                ? "text-international-orange font-semibold"
                                : i + 1 < currentStep
                                  ? "text-foreground"
                                  : ""
                        }
                    >
                        {i + 1}. {label}
                    </span>
                ))}
            </div>
            <div
                className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={currentStep}
                aria-valuemin={1}
                aria-valuemax={totalSteps}
                aria-label={`Step ${currentStep} of ${totalSteps}`}
            >
                <div
                    className="h-full bg-international-orange transition-all duration-300"
                    style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
                />
            </div>
        </div>
    )
}

// ─── Step 1: What are you building? ──────────────────────────────────────

function Step1({
    value,
    onChange,
}: {
    value: string
    onChange: (v: string) => void
}): React.ReactElement {
    const count = value.length
    const overLimit = count > SUBJECT_MAX
    const belowMin = count > 0 && count < SUBJECT_MIN

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                One sentence — what you&apos;re building, what it does, and what the
                key constraint is. Chase reads this to draft the Brief. The more
                specific you are, the less Chase has to infer.
            </p>

            <div className="space-y-2">
                <Label htmlFor="intake-subject">Your one-sentence pitch</Label>
                <Textarea
                    id="intake-subject"
                    placeholder="e.g. A 1.5 MW containerised battery storage system for grid-edge applications in the United Kingdom, targeting sub-£400k unit cost."
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    maxLength={SUBJECT_MAX + 50}
                    rows={4}
                    aria-required="true"
                    aria-describedby="intake-subject-count"
                    className={overLimit ? "border-destructive" : ""}
                />
                <p
                    id="intake-subject-count"
                    className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
                    aria-live="polite"
                >
                    {count} / {SUBJECT_MAX} characters
                    {overLimit ? " — over the limit" : ""}
                    {belowMin ? ` — ${SUBJECT_MIN - count} more to unlock` : ""}
                </p>
            </div>

            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">What Chase looks for:</p>
                <ul className="list-disc list-inside space-y-0.5">
                    <li>What the product does (function)</li>
                    <li>Who buys it (market)</li>
                    <li>Key constraint — cost, mass, size, timeline</li>
                    <li>A rough scale figure (e.g. 1.5 MW, 500 units/day)</li>
                </ul>
            </div>
        </div>
    )
}

// ─── Step 2: Target scale / capacity ─────────────────────────────────────

function Step2({
    rows,
    onUpdate,
    onAdd,
    onRemove,
}: {
    rows: ScaleRow[]
    onUpdate: (id: string, patch: Partial<ScaleRow>) => void
    onAdd: () => void
    onRemove: (id: string) => void
}): React.ReactElement {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Enter the key performance figures for your product. These become the
                ground truth used to verify the engine&apos;s output — so be as precise
                as you can. Add one row per dimension.
            </p>

            <div className="space-y-3">
                {rows.map((row, i) => (
                    <div key={row.id} className="flex items-end gap-2">
                        {/* Value */}
                        <div className="flex-1 space-y-1 min-w-0">
                            {i === 0 ? (
                                <Label htmlFor={`scale-value-${row.id}`}>Value</Label>
                            ) : null}
                            <Input
                                id={`scale-value-${row.id}`}
                                type="number"
                                min={0}
                                step="any"
                                placeholder="e.g. 1.5"
                                value={row.value === 0 ? "" : row.value}
                                onChange={(e) => {
                                    const n = parseFloat(e.target.value)
                                    onUpdate(row.id, { value: isNaN(n) ? 0 : n })
                                }}
                                aria-label={`Scale row ${i + 1} value`}
                            />
                        </div>

                        {/* Unit */}
                        <div className="flex-1 space-y-1 min-w-0">
                            {i === 0 ? (
                                <Label htmlFor={`scale-unit-${row.id}`}>Unit</Label>
                            ) : null}
                            <Input
                                id={`scale-unit-${row.id}`}
                                type="text"
                                placeholder="e.g. MW"
                                value={row.unit}
                                onChange={(e) => onUpdate(row.id, { unit: e.target.value })}
                                maxLength={20}
                                aria-label={`Scale row ${i + 1} unit`}
                            />
                        </div>

                        {/* Dimension */}
                        <div className="flex-1 space-y-1 min-w-0">
                            {i === 0 ? (
                                <Label htmlFor={`scale-dim-${row.id}`}>Dimension</Label>
                            ) : null}
                            <select
                                id={`scale-dim-${row.id}`}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                value={row.dimension}
                                onChange={(e) =>
                                    onUpdate(row.id, {
                                        dimension: e.target.value as TargetScaleEntry["dimension"],
                                    })
                                }
                                aria-label={`Scale row ${i + 1} dimension`}
                            >
                                {DIMENSION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Remove button — hidden for the last remaining row */}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemove(row.id)}
                            disabled={rows.length <= 1}
                            aria-label={`Remove scale row ${i + 1}`}
                            className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                            style={{ marginBottom: i === 0 ? 0 : undefined }}
                        >
                            ✕
                        </Button>
                    </div>
                ))}
            </div>

            <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onAdd}
                disabled={rows.length >= 5}
            >
                + Add another figure
            </Button>

            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Examples</p>
                <ul className="mt-1 space-y-0.5">
                    <li>1.5 · MW · Power — grid storage system rated output</li>
                    <li>4 · MWh · Energy — usable capacity</li>
                    <li>500 · m³/day · Throughput — water treatment flow</li>
                    <li>22 · m · Length — wingspan of a solar drone</li>
                </ul>
            </div>
        </div>
    )
}

// ─── Step 3: Who is it for? ───────────────────────────────────────────────

function Step3({
    marketSegment,
    geography,
    onMarketChange,
    onToggleGeo,
}: {
    marketSegment: string
    geography: string[]
    onMarketChange: (v: string) => void
    onToggleGeo: (geo: string) => void
}): React.ReactElement {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="intake-market">Market segment</Label>
                <p className="text-xs text-muted-foreground">
                    Describe who buys this and why. Chase uses this to frame the
                    regulatory stack and Fang uses it to weight the supplier shortlist.
                </p>
                <Textarea
                    id="intake-market"
                    placeholder="e.g. Grid operators and behind-the-meter commercial & industrial sites in the United Kingdom needing frequency response and peak shaving."
                    value={marketSegment}
                    onChange={(e) => onMarketChange(e.target.value)}
                    rows={3}
                    maxLength={500}
                    aria-required="true"
                />
            </div>

            <div className="space-y-3">
                <Label>Target geography</Label>
                <p className="text-xs text-muted-foreground">
                    Select all that apply — affects the regulatory matrix Chase seeds.
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Target geographies">
                    {GEOGRAPHY_OPTIONS.map((geo) => {
                        const isSelected = geography.includes(geo)
                        return (
                            <button
                                key={geo}
                                type="button"
                                onClick={() => onToggleGeo(geo)}
                                aria-pressed={isSelected}
                                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                                    isSelected
                                        ? "border-international-orange bg-international-orange/10 text-international-orange"
                                        : "border-border bg-background text-foreground hover:border-international-orange/50"
                                }`}
                            >
                                {geo}
                            </button>
                        )
                    })}
                </div>
                {geography.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                        Selected: {geography.join(", ")}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

// ─── Step 4: What stage are you at? ──────────────────────────────────────

function Step4({
    selected,
    onSelect,
}: {
    selected: "idea" | "prototype" | "raising" | "scaling" | null
    onSelect: (v: "idea" | "prototype" | "raising" | "scaling") => void
}): React.ReactElement {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                This tells the engine how much detail to produce — earlier-stage
                projects get more scenario analysis; later-stage ones get tighter
                cost and supplier focus.
            </p>

            <div
                className="grid gap-3 sm:grid-cols-2"
                role="group"
                aria-label="Project stage"
            >
                {STAGE_OPTIONS.map((opt) => {
                    const isSelected = selected === opt.value
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onSelect(opt.value)}
                            aria-pressed={isSelected}
                            className={`rounded-lg border p-4 text-left transition-all hover:-translate-y-0.5 active:scale-[0.99] duration-200 ${
                                isSelected
                                    ? "border-international-orange bg-international-orange/5 ring-2 ring-international-orange/20"
                                    : "border-border bg-card hover:border-international-orange/50"
                            }`}
                        >
                            <div className="font-semibold text-foreground">{opt.label}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                                {opt.description}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Step 5: Anything else? ───────────────────────────────────────────────

function Step5({
    value,
    onChange,
}: {
    value: string
    onChange: (v: string) => void
}): React.ReactElement {
    const count = value.length
    const overLimit = count > ADDITIONAL_CONTEXT_MAX

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Optional. Constraints, must-haves, non-negotiables — anything you
                want the engine to know before it starts. Leave blank if there&apos;s
                nothing specific.
            </p>

            <div className="space-y-2">
                <Label htmlFor="intake-context">Additional context</Label>
                <Textarea
                    id="intake-context"
                    placeholder="e.g. Must be ITAR-free. No lithium cells — sodium-ion or flow battery only. First unit to be installed in Scotland. Grant-funded R&amp;D — must produce a formal engineering report."
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={6}
                    maxLength={ADDITIONAL_CONTEXT_MAX + 100}
                    aria-describedby="intake-context-count"
                    className={overLimit ? "border-destructive" : ""}
                />
                <p
                    id="intake-context-count"
                    className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
                    aria-live="polite"
                >
                    {count} / {ADDITIONAL_CONTEXT_MAX} characters
                    {overLimit ? " — over the limit" : ""}
                </p>
            </div>
        </div>
    )
}

// ─── Review screen ────────────────────────────────────────────────────────

function ReviewScreen({
    form,
    validScaleRows,
    onEdit,
    onSubmit,
    isPending,
    submitError,
}: {
    form: FormState
    validScaleRows: ScaleRow[]
    onEdit: (step: number) => void
    onSubmit: () => void
    isPending: boolean
    submitError: string | null
}): React.ReactElement {
    const stageLabel = form.startupStage
        ? STAGE_OPTIONS.find((o) => o.value === form.startupStage)?.label ?? form.startupStage
        : null

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="space-y-1">
                <h2 className="text-2xl font-semibold text-foreground">
                    Your brief — review before the engine starts
                </h2>
                <p className="text-muted-foreground">
                    Check everything looks right. Edit any section, then press
                    &ldquo;Start the engine&rdquo; when ready.
                </p>
            </div>

            {/* Section 1 */}
            <ReviewSection
                stepNumber={1}
                title="What you're building"
                onEdit={() => onEdit(1)}
            >
                <p className="text-sm">{form.subject || "—"}</p>
            </ReviewSection>

            {/* Section 2 */}
            <ReviewSection
                stepNumber={2}
                title="Target scale / capacity"
                onEdit={() => onEdit(2)}
            >
                {validScaleRows.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {validScaleRows.map((r) => (
                            <Badge key={r.id} variant="secondary">
                                {r.value} {r.unit} ({r.dimension})
                            </Badge>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground italic">
                        No scale figures entered — the engine will infer from your brief.
                    </p>
                )}
            </ReviewSection>

            {/* Section 3 */}
            <ReviewSection
                stepNumber={3}
                title="Who it's for"
                onEdit={() => onEdit(3)}
            >
                <div className="space-y-2">
                    <p className="text-sm">
                        <span className="font-medium">Market: </span>
                        {form.marketSegment || "—"}
                    </p>
                    {form.geography.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {form.geography.map((g) => (
                                <Badge key={g} variant="outline">
                                    {g}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground italic">
                            No geography selected.
                        </p>
                    )}
                </div>
            </ReviewSection>

            {/* Section 4 */}
            <ReviewSection
                stepNumber={4}
                title="Stage"
                onEdit={() => onEdit(4)}
            >
                {stageLabel ? (
                    <Badge className="bg-international-orange/10 text-international-orange border-international-orange/30">
                        {stageLabel}
                    </Badge>
                ) : (
                    <p className="text-sm text-muted-foreground italic">Not selected.</p>
                )}
            </ReviewSection>

            {/* Section 5 */}
            <ReviewSection
                stepNumber={5}
                title="Additional context"
                onEdit={() => onEdit(5)}
            >
                {form.additionalContext.trim() ? (
                    <p className="text-sm whitespace-pre-wrap">{form.additionalContext}</p>
                ) : (
                    <p className="text-sm text-muted-foreground italic">None.</p>
                )}
            </ReviewSection>

            {/* Submit error */}
            {submitError ? (
                <p role="alert" className="text-sm text-destructive text-center">
                    {submitError}
                </p>
            ) : null}

            {/* CTA */}
            <div className="flex items-center justify-between pt-2">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onEdit(5)}
                    disabled={isPending}
                >
                    ← Back to step 5
                </Button>

                <Button
                    type="button"
                    className="bg-international-orange hover:bg-international-orange/90 text-white px-8 py-3 text-base font-semibold"
                    onClick={onSubmit}
                    disabled={isPending}
                    aria-busy={isPending}
                >
                    {isPending ? "Starting the engine…" : "Start the engine →"}
                </Button>
            </div>
        </div>
    )
}

// ─── Review section ───────────────────────────────────────────────────────

function ReviewSection({
    stepNumber,
    title,
    onEdit,
    children,
}: {
    stepNumber: number
    title: string
    onEdit: () => void
    children: React.ReactNode
}): React.ReactElement {
    return (
        <Card>
            <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold"
                                aria-hidden="true"
                            >
                                {stepNumber}
                            </span>
                            <span className="text-sm font-semibold text-foreground">
                                {title}
                            </span>
                        </div>
                        {children}
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onEdit}
                        className="flex-shrink-0 text-international-orange hover:text-international-orange/80"
                        aria-label={`Edit step ${stepNumber}: ${title}`}
                    >
                        Edit
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
