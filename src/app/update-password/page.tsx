'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function UpdatePasswordPage(): React.ReactNode {
    const router = useRouter()
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (password.length < 8) {
            setError('Password must be at least 8 characters.')
            return
        }
        if (password !== confirm) {
            setError('Passwords do not match.')
            return
        }

        setLoading(true)
        const supabase = createClient()
        const { error: updateError } = await supabase.auth.updateUser({ password })

        if (updateError) {
            setError(updateError.message)
            setLoading(false)
            return
        }

        setSuccess(true)
        setTimeout(() => router.push('/today'), 2000)
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center p-8 bg-background">
                <div className="w-full max-w-sm mx-auto space-y-4 text-center">
                    <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-international-orange">
                        Fractional Forge
                    </h2>
                    <h1 className="text-3xl font-display font-semibold text-foreground tracking-tight">
                        Password updated
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Redirecting you to your dashboard...
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-background">
            <div className="w-full max-w-sm mx-auto space-y-8">
                <div className="space-y-2">
                    <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-international-orange">
                        Fractional Forge
                    </h2>
                    <h1 className="text-3xl font-display font-semibold text-foreground tracking-tight">
                        Set new password
                    </h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        Choose a strong password with at least 8 characters.
                    </p>
                </div>

                {error && (
                    <div
                        role="alert"
                        className="p-4 text-sm text-destructive bg-status-error-light border border-destructive rounded-sm flex items-center gap-3"
                    >
                        <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden="true" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                            New Password
                            <span className="text-destructive ml-1" aria-label="required">*</span>
                        </Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                            minLength={8}
                            className="h-11 bg-background border focus:border-international-orange focus:ring-international-orange/20 transition-all font-medium font-mono tracking-widest"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                            Confirm Password
                            <span className="text-destructive ml-1" aria-label="required">*</span>
                        </Label>
                        <Input
                            id="confirm"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            required
                            minLength={8}
                            className="h-11 bg-background border focus:border-international-orange focus:ring-international-orange/20 transition-all font-medium font-mono tracking-widest"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-international-orange hover:bg-international-orange/90 text-white font-medium"
                    >
                        {loading ? 'Updating...' : 'Update password'}
                    </Button>
                </form>
            </div>
        </div>
    )
}
