'use client'

/**
 * @file claim-view.tsx — Scrollable landing page for the claim flow.
 *
 * @description Shows listing preview (curiosity payoff), value props, and
 * frictionless claim CTA. Falls back to minimal card if preview unavailable.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ListingPreview as ListingPreviewType } from '@/actions/listing-claims'
import { ListingPreview } from './listing-preview'
import { ClaimCta } from './claim-cta'
import { HowItWorks, AdvisoryModel, WhatsFree, About } from './value-sections'

interface ClaimViewProps {
    token: string
    isAuthenticated: boolean
    preview: ListingPreviewType | null
    previewError: string | null
}

export function ClaimView({ token, isAuthenticated, preview, previewError }: ClaimViewProps) {
    const router = useRouter()
    const [claimed, setClaimed] = useState(false)

    // ─── Invalid / expired token ────────────────────────────────────────────
    if (preview && !preview.is_valid) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                        <XCircle className="h-12 w-12 text-destructive" />
                        <h2 className="text-xl font-semibold text-foreground">Invalid Claim Link</h2>
                        <p className="text-sm text-muted-foreground">
                            This claim link has expired or has already been used.
                        </p>
                        <Button variant="outline" onClick={() => router.push('/')}>
                            Go to Homepage
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // ─── Claim success ──────────────────────────────────────────────────────
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

    // ─── No preview data — fall back to minimal card ────────────────────────
    if (!preview || previewError) {
        return (
            <div className="min-h-screen bg-background">
                <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-12">
                    <LogoBar />

                    <div className="flex items-center justify-center">
                        <Card className="max-w-md w-full">
                            <CardContent className="p-8 text-center space-y-4">
                                <h2 className="text-xl font-semibold text-foreground">
                                    Claim Your Listing
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {previewError || 'Verify and update your company listing on Fractional Forge.'}
                                </p>
                                <ClaimCta
                                    token={token}
                                    isAuthenticated={isAuthenticated}
                                    headline="Ready to claim your listing?"
                                    onClaimed={() => setClaimed(true)}
                                />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Full landing page ──────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-12">
                <LogoBar />

                {/* Section 1: Listing Preview */}
                <ListingPreview preview={preview} />

                {/* Section 2: First CTA */}
                <ClaimCta
                    token={token}
                    isAuthenticated={isAuthenticated}
                    onClaimed={() => setClaimed(true)}
                />

                {/* Section 3: How It Works */}
                <HowItWorks />

                {/* Section 4: Advisory Model */}
                <AdvisoryModel />

                {/* Section 5: What's Free */}
                <WhatsFree />

                {/* Section 6: About */}
                <About />

                {/* Section 7: Repeat CTA */}
                <ClaimCta
                    token={token}
                    isAuthenticated={isAuthenticated}
                    headline="Ready to check your listing?"
                    onClaimed={() => setClaimed(true)}
                />
            </div>
        </div>
    )
}

// ─── Logo Bar ───────────────────────────────────────────────────────────────────

function LogoBar() {
    return (
        <div className="flex items-center justify-center">
            <span className="text-xl font-bold text-foreground tracking-tight">
                Fractional Forge
            </span>
        </div>
    )
}
