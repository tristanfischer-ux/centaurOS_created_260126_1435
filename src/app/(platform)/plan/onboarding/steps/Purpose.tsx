/**
 * @file Purpose.tsx — Step 2 of Plan onboarding.
 *
 * @description Textarea bound to `foundries.purpose_data.purpose` via the
 * existing `updateFoundryPurpose` server action. Skipping writes nothing and
 * leaves the field blank. 240-char soft ceiling with live counter.
 */

"use client"

import { useEffect, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"

export const PURPOSE_MAX_CHARS = 240

interface PurposeStepProps {
    value: string
    onChange: (next: string) => void
    disabled?: boolean
}

export function PurposeStep({
    value,
    onChange,
    disabled,
}: PurposeStepProps): React.ReactElement {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)

    useEffect(() => {
        textareaRef.current?.focus()
    }, [])

    const remaining = PURPOSE_MAX_CHARS - value.length
    const overLimit = remaining < 0

    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    What's your foundry's purpose?
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                    One sentence on why this organisation exists — the reason
                    you'd keep going through a bad quarter. It grounds every
                    Strategic Goal you add later.
                </p>
            </div>

            <div className="space-y-2">
                <label
                    htmlFor="foundry-purpose"
                    className="text-sm font-medium text-foreground"
                >
                    Purpose
                </label>
                <Textarea
                    id="foundry-purpose"
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    placeholder="We exist to…"
                    rows={4}
                    maxLength={PURPOSE_MAX_CHARS + 40}
                    className="resize-none text-base leading-relaxed"
                    aria-describedby="foundry-purpose-counter foundry-purpose-help"
                />
                <div className="flex items-center justify-between text-xs">
                    <p id="foundry-purpose-help" className="text-muted-foreground">
                        You can edit this later from Settings.
                    </p>
                    <p
                        id="foundry-purpose-counter"
                        className={
                            overLimit
                                ? "font-semibold text-destructive"
                                : remaining < 40
                                  ? "font-medium text-status-warning"
                                  : "text-muted-foreground"
                        }
                    >
                        {value.length} / {PURPOSE_MAX_CHARS}
                    </p>
                </div>
            </div>
        </div>
    )
}
