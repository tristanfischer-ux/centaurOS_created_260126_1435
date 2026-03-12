'use client'

/**
 * @file claim-view.tsx — Client component for the claim flow.
 *
 * @description Validates the token, shows company info, and handles
 * the claim action. Redirects to /my-listing after successful claim.
 */

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building, CheckCircle2, XCircle, Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { validateClaimToken, redeemClaim } from '@/actions/listing-claims'
import type { ClaimValidation } from '@/actions/listing-claims'
import { toast } from 'sonner'

/** Mask email for display: j***@example.com */
function maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (!domain) return '***'
    const visible = local.slice(0, 1)
    return `${visible}***@${domain}`
}

interface ClaimViewProps {
    token: string
    isAuthenticated: boolean
}

export function ClaimView({ token, isAuthenticated }: ClaimViewProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [claim, setClaim] = useState<ClaimValidation | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [claimed, setClaimed] = useState(false)

    useEffect(() => {
        async function validate() {
            const result = await validateClaimToken(token)
            if (result.error) {
                setError(result.error)
            } else if (result.data) {
                setClaim(result.data)
                if (!result.data.is_valid) {
                    setError('This claim link has expired or has already been used.')
                }
            }
            setIsLoading(false)
        }
        validate()
    }, [token])

    const handleClaim = () => {
        startTransition(async () => {
            const result = await redeemClaim(token)
            if (result.error) {
                toast.error(result.error)
            } else {
                setClaimed(true)
                toast.success('Listing claimed successfully!')
                setTimeout(() => router.push('/my-listing'), 1500)
            }
        })
    }

    // SECURITY: Validate token format before embedding in URLs
    const safeToken = /^[a-f0-9]+$/.test(token) ? token : ''

    const handleLogin = () => {
        if (!safeToken) return
        router.push(`/login?redirect=/claim/${safeToken}`)
    }

    const handleSignUp = () => {
        if (!safeToken) return
        router.push(`/join/factory?redirect=/claim/${safeToken}`)
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Validating your claim link...</span>
                </div>
            </div>
        )
    }

    if (error && !claim) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                        <XCircle className="h-12 w-12 text-destructive" />
                        <h2 className="text-xl font-semibold text-foreground">Invalid Claim Link</h2>
                        <p className="text-sm text-muted-foreground">{error}</p>
                        <Button variant="outline" onClick={() => router.push('/')}>
                            Go to Homepage
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (claimed) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                        <CheckCircle2 className="h-12 w-12 text-success" />
                        <h2 className="text-xl font-semibold text-foreground">Listing Claimed!</h2>
                        <p className="text-sm text-muted-foreground">
                            Redirecting you to edit your listing...
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="max-w-lg w-full">
                <CardHeader className="text-center pb-2">
                    <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-international-orange/10 mx-auto mb-3">
                        <Building className="h-7 w-7 text-international-orange" />
                    </div>
                    <CardTitle className="text-xl">Claim Your Listing</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Verify that you represent this company on Fractional Forge
                    </p>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Company preview */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <h3 className="text-lg font-semibold text-foreground">
                            {claim?.company_name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            This listing was sent to {claim?.email ? maskEmail(claim.email) : 'your email'}
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    {!error && claim?.is_valid && (
                        <>
                            {isAuthenticated ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                        By claiming this listing, you confirm that you represent{' '}
                                        <strong>{claim.company_name}</strong> and can update its information.
                                    </p>
                                    <Button
                                        onClick={handleClaim}
                                        disabled={isPending}
                                        className="w-full"
                                        size="lg"
                                    >
                                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                        Claim This Listing
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">
                                        To claim this listing, create a free Fractional Forge account.
                                        It takes under a minute and there&rsquo;s no cost or commitment.
                                    </p>
                                    <Button
                                        onClick={handleSignUp}
                                        className="w-full"
                                        size="lg"
                                    >
                                        Create Free Account &amp; Claim
                                    </Button>
                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <span className="w-full border-t border-border" />
                                        </div>
                                        <div className="relative flex justify-center text-xs uppercase">
                                            <span className="bg-card px-2 text-muted-foreground">
                                                or
                                            </span>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={handleLogin}
                                        className="w-full"
                                        size="lg"
                                    >
                                        <LogIn className="h-4 w-4 mr-2" />
                                        Already have an account? Sign in
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
