/**
 * @file InviteFractional.tsx — Step 4 of Plan onboarding (skippable).
 *
 * @description Minimal invite form: email, specialisation, 1 goal to attach.
 * "Skip and invite later" is the primary CTA — most founders don't want a
 * fractional on day one. The form is optional and stays collapsed behind a
 * disclosure until the founder opts in.
 */

"use client"

import { useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import type { FractionalSpecialisation } from "@/types/plan"

export interface FractionalFormState {
    showForm: boolean
    email: string
    displayName: string
    specialisation: FractionalSpecialisation
    roleInFoundry: string
}

export const EMPTY_FRACTIONAL_FORM: FractionalFormState = {
    showForm: false,
    email: "",
    displayName: "",
    specialisation: "fundraising",
    roleInFoundry: "",
}

export function isFractionalFormValid(form: FractionalFormState): boolean {
    if (!form.showForm) return true // Skip path is always valid.
    const emailLooksValid = /.+@.+\..+/.test(form.email.trim())
    return (
        emailLooksValid &&
        form.displayName.trim().length >= 2 &&
        form.roleInFoundry.trim().length >= 2
    )
}

const SPECIALISATIONS: ReadonlyArray<{ value: FractionalSpecialisation; label: string }> = [
    { value: "fundraising", label: "Fundraising" },
    { value: "cfo", label: "CFO / Finance" },
    { value: "cto", label: "CTO / Engineering" },
    { value: "product", label: "Product" },
    { value: "marketing", label: "Marketing" },
    { value: "sales", label: "Sales" },
    { value: "operations", label: "Operations" },
    { value: "people", label: "People" },
    { value: "legal", label: "Legal" },
    { value: "advisory", label: "Advisory" },
    { value: "other", label: "Other" },
]

interface InviteFractionalStepProps {
    value: FractionalFormState
    onChange: (patch: Partial<FractionalFormState>) => void
    goalTitlePreview: string | null
    disabled?: boolean
}

export function InviteFractionalStep({
    value,
    onChange,
    goalTitlePreview,
    disabled,
}: InviteFractionalStepProps): React.ReactElement {
    const firstInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        if (value.showForm) firstInputRef.current?.focus()
    }, [value.showForm])

    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Bring a fractional in? (Optional)
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                    A fractional is a part-time operator attached to a goal —
                    typically a fundraising lead, CFO or CTO. Most founders
                    skip this on day one and invite someone once a goal needs
                    the extra pair of hands.
                </p>
            </div>

            {!value.showForm ? (
                <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                        You can invite a fractional any time from the Plan
                        workspace.
                    </p>
                    <button
                        type="button"
                        onClick={() => onChange({ showForm: true })}
                        disabled={disabled}
                        className="mt-3 text-sm font-medium text-accent underline underline-offset-4 hover:text-accent/80 disabled:opacity-60"
                    >
                        Or invite one now
                    </button>
                </div>
            ) : (
                <div className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">
                            Invite a fractional
                        </p>
                        <button
                            type="button"
                            onClick={() => onChange({ showForm: false })}
                            disabled={disabled}
                            className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        >
                            Cancel
                        </button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label
                                htmlFor="fractional-name"
                                className="text-sm font-medium text-foreground"
                            >
                                Name
                            </label>
                            <Input
                                id="fractional-name"
                                ref={firstInputRef}
                                value={value.displayName}
                                onChange={(e) =>
                                    onChange({ displayName: e.target.value })
                                }
                                disabled={disabled}
                                placeholder="e.g. Priya Khan"
                                maxLength={80}
                            />
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="fractional-email"
                                className="text-sm font-medium text-foreground"
                            >
                                Email
                            </label>
                            <Input
                                id="fractional-email"
                                type="email"
                                value={value.email}
                                onChange={(e) =>
                                    onChange({ email: e.target.value })
                                }
                                disabled={disabled}
                                placeholder="priya@example.com"
                                maxLength={160}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label
                                htmlFor="fractional-specialisation"
                                className="text-sm font-medium text-foreground"
                            >
                                Specialisation
                            </label>
                            <select
                                id="fractional-specialisation"
                                value={value.specialisation}
                                onChange={(e) =>
                                    onChange({
                                        specialisation: e.target
                                            .value as FractionalSpecialisation,
                                    })
                                }
                                disabled={disabled}
                                className="flex h-11 min-h-[44px] w-full rounded-md border-2 border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                            >
                                {SPECIALISATIONS.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="fractional-role"
                                className="text-sm font-medium text-foreground"
                            >
                                Role in your foundry
                            </label>
                            <Input
                                id="fractional-role"
                                value={value.roleInFoundry}
                                onChange={(e) =>
                                    onChange({ roleInFoundry: e.target.value })
                                }
                                disabled={disabled}
                                placeholder="e.g. Fractional CFO"
                                maxLength={80}
                            />
                        </div>
                    </div>

                    {goalTitlePreview && (
                        <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                            They'll be attached to your first goal:{" "}
                            <span className="font-medium text-foreground">
                                {goalTitlePreview}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
