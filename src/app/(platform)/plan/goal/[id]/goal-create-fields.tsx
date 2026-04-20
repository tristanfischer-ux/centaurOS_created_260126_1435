"use client"

/**
 * @file goal-create-fields.tsx — Direct-entry form body for the Strategic
 * Goal create flow. Pulled out of `goal-create-form.tsx` to keep each file
 * under 300 lines. All state lives on the parent; this is a thin wrapper
 * around `react-hook-form`'s render props.
 */
import type { UseFormReturn, UseFieldArrayReturn } from "react-hook-form"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export type GoalCreateFormValues = {
    title: string
    description?: string
    quarter: string
    milestoneDate: string
    assumptions: Array<{ assumption: string }>
}

interface Props {
    form: UseFormReturn<GoalCreateFormValues>
    fieldArray: UseFieldArrayReturn<GoalCreateFormValues, "assumptions", "id">
    submitError: string | null
    isPending: boolean
    onCancel: () => void
    onSubmit: (v: GoalCreateFormValues) => void
}

export function GoalCreateFields({ form, fieldArray, submitError, isPending, onCancel, onSubmit }: Props) {
    const { fields, append, remove } = fieldArray
    const errors = form.formState.errors

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
                <Label htmlFor="goal-title">Goal title</Label>
                <Input
                    id="goal-title"
                    placeholder="Close Seed round by 30 June"
                    {...form.register("title")}
                    aria-invalid={!!errors.title}
                />
                {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>

            <div className="space-y-2">
                <Label htmlFor="goal-description">Why it matters (optional)</Label>
                <Textarea
                    id="goal-description"
                    placeholder="One or two sentences on the outcome this unlocks."
                    rows={3}
                    {...form.register("description")}
                />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="goal-quarter">Quarter</Label>
                    <Input
                        id="goal-quarter"
                        placeholder="Q2 2026"
                        {...form.register("quarter")}
                        aria-invalid={!!errors.quarter}
                    />
                    {errors.quarter ? (
                        <p className="text-xs text-destructive">{errors.quarter.message}</p>
                    ) : null}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="goal-milestone">Milestone date</Label>
                    <Input
                        id="goal-milestone"
                        type="date"
                        {...form.register("milestoneDate")}
                        aria-invalid={!!errors.milestoneDate}
                    />
                    {errors.milestoneDate ? (
                        <p className="text-xs text-destructive">{errors.milestoneDate.message}</p>
                    ) : null}
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label>Disprove test</Label>
                    <span className="text-xs text-muted-foreground">
                        {fields.length}/3 assumption{fields.length === 1 ? "" : "s"}
                    </span>
                </div>
                <p className="text-xs text-muted-foreground">
                    Three claims that, if broken, mean this Goal is wrong. Specific and falsifiable.
                </p>
                <ul className="space-y-2">
                    {fields.map((field, idx) => {
                        const err = errors.assumptions?.[idx]?.assumption
                        return (
                            <li key={field.id} className="flex items-start gap-2">
                                <span className="mt-2 w-5 shrink-0 text-center text-xs font-mono text-muted-foreground">
                                    {idx + 1}
                                </span>
                                <div className="min-w-0 flex-1 space-y-1">
                                    <Input
                                        placeholder={`Assumption ${idx + 1}`}
                                        {...form.register(`assumptions.${idx}.assumption` as const)}
                                        aria-invalid={!!err}
                                    />
                                    {err ? <p className="text-xs text-destructive">{err.message}</p> : null}
                                </div>
                                {fields.length > 1 ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => remove(idx)}
                                        aria-label={`Remove assumption ${idx + 1}`}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </li>
                        )
                    })}
                </ul>
                {fields.length < 3 ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => append({ assumption: "" })}
                    >
                        <Plus className="h-4 w-4" /> Add assumption
                    </Button>
                ) : null}
                {errors.assumptions?.message ? (
                    <p className="text-xs text-destructive">{errors.assumptions.message}</p>
                ) : null}
            </div>

            {submitError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {submitError}
                </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending ? "Creating\u2026" : "Create Goal"}
                </Button>
            </div>
        </form>
    )
}
