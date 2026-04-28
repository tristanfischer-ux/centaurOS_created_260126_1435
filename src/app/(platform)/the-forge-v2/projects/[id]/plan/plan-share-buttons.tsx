"use client"

import { Mail, Link2, CheckCheck } from "lucide-react"
import { useState } from "react"

interface PlanShareButtonsProps {
    planName: string
}

export function PlanShareButtons({ planName }: PlanShareButtonsProps): React.ReactElement {
    const [copied, setCopied] = useState(false)

    const handleEmailMe = (): void => {
        const subject = encodeURIComponent(`${planName} — Fractional Forge`)
        const body = encodeURIComponent(
            `Your Fractional Forge plan is ready.\n\nView or download it at: ${window.location.href}`,
        )
        window.location.href = `mailto:?subject=${subject}&body=${body}`
    }

    const handleShareLink = async (): Promise<void> => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard API may be blocked; fall back to prompt
            window.prompt("Copy this link to share your plan:", window.location.href)
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={handleEmailMe}
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold hover:bg-secondary"
            >
                <Mail className="h-3.5 w-3.5" /> Email me
            </button>
            <button
                type="button"
                onClick={() => void handleShareLink()}
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold hover:bg-secondary"
            >
                {copied ? (
                    <><CheckCheck className="h-3.5 w-3.5 text-green-600" /> Copied!</>
                ) : (
                    <><Link2 className="h-3.5 w-3.5" /> Share link</>
                )}
            </button>
        </>
    )
}
