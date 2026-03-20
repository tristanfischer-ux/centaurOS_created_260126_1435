'use client'

/**
 * @file claim-cta.tsx — Reusable CTA section for the claim landing page.
 * Shows different buttons based on authentication state.
 */

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { redeemClaim } from '@/actions/listing-claims'
import { toast } from 'sonner'

interface ClaimCtaProps {
    token: string
    isAuthenticated: boolean
    headline?: string
    onClaimed?: () => void
}

export function ClaimCta({
    token,
    isAuthenticated,
    headline = 'Does this look right? Claim your listing to update anything that\'s off.',
    onClaimed,
}: ClaimCtaProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // SECURITY: Validate token format before embedding in URLs
    const safeToken = /^[a-f0-9]+$/.test(token) ? token : ''

    const handleClaim = () => {
        startTransition(async () => {
            const result = await redeemClaim(token)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Listing claimed successfully!')
                onClaimed?.()
                setTimeout(() => router.push('/my-listing'), 1500)
            }
        })
    }

    const handleSignUp = () => {
        if (!safeToken) return
        router.push(`/join/factory?redirect=/claim/${safeToken}`)
    }

    const handleLogin = () => {
        if (!safeToken) return
        router.push(`/login?redirect=/claim/${safeToken}`)
    }

    return (
        <section>
            <Card>
                <CardContent className="p-6 sm:p-8 text-center space-y-4">
                    <p className="text-lg font-medium text-foreground">
                        {headline}
                    </p>

                    {isAuthenticated ? (
                        <Button
                            onClick={handleClaim}
                            disabled={isPending}
                            size="lg"
                            className="w-full sm:w-auto sm:min-w-[240px]"
                        >
                            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Claim This Listing
                        </Button>
                    ) : (
                        <div className="space-y-3">
                            <Button
                                onClick={handleSignUp}
                                size="lg"
                                className="w-full sm:w-auto sm:min-w-[240px]"
                            >
                                Check Your Listing
                            </Button>
                            <div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleLogin}
                                    className="text-muted-foreground"
                                >
                                    <LogIn className="h-4 w-4 mr-2" />
                                    Already have an account? Sign in
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}
