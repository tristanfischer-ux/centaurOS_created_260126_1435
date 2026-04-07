"use client"

/**
 * @file newsletter-signup.tsx — Email capture component for public content pages.
 *
 * @description Simple newsletter signup form that collects email addresses.
 * Displayed in the content layout (blog pages). Stores signups via server action
 * which can be wired to Resend audiences or a database table.
 *
 * @related
 * - src/app/(content)/layout.tsx - Renders this component
 * - src/actions/newsletter.ts - Server action for storing signups
 */

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Mail, Check } from "lucide-react"
import { subscribeToNewsletter } from "@/actions/newsletter"

export function NewsletterSignup() {
    const [email, setEmail] = useState("")
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
    const [errorMessage, setErrorMessage] = useState("")

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return

        setStatus("loading")
        setErrorMessage("")

        const result = await subscribeToNewsletter(email.trim())
        if (result.error) {
            setStatus("error")
            setErrorMessage(result.error)
        } else {
            setStatus("success")
            setEmail("")
        }
    }, [email])

    if (status === "success") {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-status-success/20 bg-status-success/5 px-4 py-3">
                <Check className="h-4 w-4 text-status-success flex-shrink-0" />
                <p className="text-sm text-foreground">
                    You are subscribed. We will send you insights worth reading.
                </p>
            </div>
        )
    }

    return (
        <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-start gap-3">
                <div className="rounded-full bg-international-orange/10 p-2 flex-shrink-0">
                    <Mail className="h-4 w-4 text-international-orange" />
                </div>
                <div className="flex-1 space-y-3">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">
                            Get insights from fractional executives
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Monthly perspectives on strategy, operations, and scaling. No spam.
                        </p>
                    </div>
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            required
                            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
                            aria-label="Email address"
                        />
                        <Button
                            type="submit"
                            size="sm"
                            disabled={status === "loading" || !email.trim()}
                        >
                            {status === "loading" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                "Subscribe"
                            )}
                        </Button>
                    </form>
                    {status === "error" && (
                        <p className="text-xs text-destructive" role="alert">
                            {errorMessage}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
