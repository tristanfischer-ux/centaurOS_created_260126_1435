/**
 * @file Expert referral landing page.
 *
 * @description Public landing page for expert referral links. Shows a branded
 * onboarding experience that converts referred experts into ForgeOS members.
 * Validates the referral code and shows who referred them.
 *
 * @security Public page. Referral code validated server-side.
 */

import { Suspense } from 'react'
import { Metadata } from 'next'
import Link from 'next/link'
import { lookupReferralCode } from '@/actions/expert-referrals'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    ShieldCheck,
    Users,
    TrendingUp,
    Star,
    ArrowRight,
    Sparkles,
} from 'lucide-react'

export const metadata: Metadata = {
    title: 'Join as an Expert',
    description: 'Join the ForgeOS expert network. Connect with hardware startups looking for your skills.',
    openGraph: {
        title: 'Join ForgeOS as an Expert',
        description: 'Connect with hardware startups looking for your skills. Join the fastest-growing expert network for hardware.',
        type: 'website',
    },
}

interface PageProps {
    searchParams: Promise<{ ref?: string }>
}

function LoadingSkeleton() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Skeleton className="w-full max-w-lg h-96 rounded-2xl" />
        </div>
    )
}

async function ExpertLandingContent({ referralCode }: { referralCode?: string }) {
    let referralInfo: { referrerName: string; note: string | null } | null = null

    if (referralCode) {
        const result = await lookupReferralCode(referralCode)
        if (result.valid && result.referral) {
            referralInfo = {
                referrerName: result.referral.referrerName,
                note: result.referral.note,
            }
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-international-orange/5 via-background to-electric-blue/5 flex items-center justify-center p-4">
            <div className="w-full max-w-lg space-y-6">
                {/* Main card */}
                <Card className="border-international-orange/20 shadow-xl">
                    <CardContent className="p-8 space-y-6">
                        {/* Logo */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-international-orange flex items-center justify-center text-white font-bold text-lg">
                                F
                            </div>
                            <span className="text-xl font-bold text-foreground">ForgeOS</span>
                        </div>

                        {/* Referral badge */}
                        {referralInfo && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-international-orange/5 border border-international-orange/20">
                                <Users className="w-4 h-4 text-international-orange shrink-0" />
                                <p className="text-sm text-foreground">
                                    <span className="font-semibold">{referralInfo.referrerName}</span> invited you to join
                                </p>
                            </div>
                        )}

                        {referralInfo?.note && (
                            <p className="text-sm text-muted-foreground italic border-l-2 border-international-orange/30 pl-3">
                                &ldquo;{referralInfo.note}&rdquo;
                            </p>
                        )}

                        {/* Headline */}
                        <div>
                            <h1 className="text-2xl font-bold text-foreground mb-2">
                                Join the ForgeOS Expert Network
                            </h1>
                            <p className="text-muted-foreground leading-relaxed">
                                Connect with hardware startups looking for your expertise.
                                Get discovered by founders building the next generation of physical products.
                            </p>
                        </div>

                        {/* Benefits */}
                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-status-success-light flex items-center justify-center shrink-0">
                                    <ShieldCheck className="w-4 h-4 text-status-success" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-foreground">Verified Profile</p>
                                    <p className="text-xs text-muted-foreground">Build credibility with endorsements and verified badges</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-international-orange/10 flex items-center justify-center shrink-0">
                                    <TrendingUp className="w-4 h-4 text-international-orange" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-foreground">Matched Leads</p>
                                    <p className="text-xs text-muted-foreground">Get matched with startups that need your exact skills</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-electric-blue/10 flex items-center justify-center shrink-0">
                                    <Star className="w-4 h-4 text-electric-blue" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-foreground">Build Your Reputation</p>
                                    <p className="text-xs text-muted-foreground">Collect reviews, endorsements, and showcase your portfolio</p>
                                </div>
                            </div>
                        </div>

                        {/* CTA */}
                        <div className="space-y-3">
                            <Button asChild className="w-full gap-2" size="lg">
                                <Link href={referralCode ? `/join?role=executive&ref=${referralCode}` : '/join?role=executive'}>
                                    <Sparkles className="w-5 h-5" />
                                    Create Your Expert Profile
                                    <ArrowRight className="w-5 h-5" />
                                </Link>
                            </Button>
                            <p className="text-xs text-center text-muted-foreground">
                                Free to join. No credit card required.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Trust signal */}
                <p className="text-center text-xs text-muted-foreground">
                    Join a growing network of hardware experts and startups on ForgeOS.
                </p>
            </div>
        </div>
    )
}

export default async function ExpertJoinPage({ searchParams }: PageProps) {
    const { ref: referralCode } = await searchParams

    return (
        <Suspense fallback={<LoadingSkeleton />}>
            <ExpertLandingContent referralCode={referralCode} />
        </Suspense>
    )
}
