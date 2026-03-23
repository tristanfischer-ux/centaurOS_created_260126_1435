'use client'

import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset } from './actions'

function SubmitButton(): React.ReactNode {
    const { pending } = useFormStatus()
    return (
        <Button
            formAction={requestPasswordReset}
            className="w-full h-12 bg-international-orange hover:bg-international-orange/90 text-white font-medium"
            disabled={pending}
        >
            {pending ? 'Sending...' : 'Send reset link'}
        </Button>
    )
}

function ForgotPasswordForm(): React.ReactNode {
    const searchParams = useSearchParams()
    const status = searchParams.get('status')
    const error = searchParams.get('error')

    if (status === 'sent') {
        return (
            <div className="w-full max-w-sm mx-auto space-y-6 my-auto">
                <div className="space-y-2">
                    <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-international-orange">
                        Fractional Forge
                    </h2>
                    <h1 className="text-3xl font-display font-semibold text-foreground tracking-tight">
                        Check your email
                    </h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        If an account exists with that email, we&apos;ve sent a password reset link. It may take a minute to arrive.
                    </p>
                </div>
                <Link
                    href="/login"
                    className="inline-flex items-center text-sm text-international-orange hover:underline font-medium"
                >
                    &larr; Back to login
                </Link>
            </div>
        )
    }

    return (
        <div className="w-full max-w-sm mx-auto space-y-8 my-auto">
            <div className="space-y-2">
                <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-international-orange">
                    Fractional Forge
                </h2>
                <h1 className="text-3xl font-display font-semibold text-foreground tracking-tight">
                    Reset your password
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                    Enter the email address you signed up with and we&apos;ll send you a reset link.
                </p>
            </div>

            {error === 'invalid-email' && (
                <div
                    role="alert"
                    className="p-4 text-sm text-destructive bg-status-error-light border border-destructive rounded-sm flex items-center gap-3"
                >
                    <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden="true" />
                    Please enter a valid email address.
                </div>
            )}

            <form className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                        Email Address
                        <span className="text-destructive ml-1" aria-label="required">*</span>
                    </Label>
                    <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="you@company.com"
                        autoComplete="email"
                        required
                        aria-required="true"
                        className="h-11 bg-background border focus:border-international-orange focus:ring-international-orange/20 transition-all font-medium"
                    />
                </div>
                <SubmitButton />
            </form>

            <div className="text-center">
                <Link
                    href="/login"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    &larr; Back to login
                </Link>
            </div>
        </div>
    )
}

export default function ForgotPasswordPage(): React.ReactNode {
    return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-background">
            <Suspense fallback={null}>
                <ForgotPasswordForm />
            </Suspense>
        </div>
    )
}
