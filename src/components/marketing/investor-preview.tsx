/**
 * @file investor-preview.tsx
 *
 * @description Public investor directory preview for the marketing homepage.
 * Shows a sample of real investor cards to demonstrate the directory's value,
 * with the last few cards blurred behind a signup CTA. Designed to convert
 * visitors who are interested in investor access.
 *
 * @security Only displays safe public fields (firm name, type, city, stages).
 * Contact emails, LinkedIn URLs, and intelligence data are NEVER exposed.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  MapPin,
  Building2,
  TrendingUp,
  Lock,
  ArrowRight,
  CheckCircle2,
  Users,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { AnimatedSection, AnimatedCard, StaggerContainer } from '@/components/marketing/animations'
import { getPublicInvestorPreview } from '@/actions/public-investor-preview'
import type { PublicInvestorCard, PublicInvestorPreview } from '@/actions/public-investor-preview'

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K+`
  return `${n}+`
}

function InvestorMiniCard({ investor, blurred = false }: { investor: PublicInvestorCard; blurred?: boolean }) {
  return (
    <div className={`relative ${blurred ? 'select-none' : ''}`}>
      <Card className={`flex flex-col h-full transition-all duration-200 ${
        blurred ? 'blur-[6px] pointer-events-none' : 'hover:-translate-y-0.5'
      }`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground line-clamp-1 leading-snug">
                {investor.title}
              </h4>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {investor.subcategory && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {investor.subcategory}
                  </Badge>
                )}
                {investor.firm_type && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {investor.firm_type}
                  </Badge>
                )}
              </div>
            </div>
            {investor.is_active_deploying && (
              <span className="flex items-center gap-0.5 text-success shrink-0">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                <span className="text-[9px] font-semibold uppercase tracking-wide">Active</span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {investor.hq_city && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span>{investor.hq_city}</span>
            </div>
          )}
          {investor.stage_focus.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {investor.stage_focus.map((stage) => (
                <span
                  key={stage}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-international-orange/10 text-international-orange font-medium"
                >
                  {stage}
                </span>
              ))}
            </div>
          )}
          {investor.fund_tier && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" />
              <span>{investor.fund_tier}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lock overlay for blurred cards */}
      {blurred && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-1">
            <div className="h-8 w-8 rounded-full bg-background border-2 border-international-orange/30 flex items-center justify-center">
              <Lock className="h-4 w-4 text-international-orange" />
            </div>
            <span className="text-[10px] font-semibold text-international-orange">Sign up to view</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function InvestorPreviewSection() {
  const [preview, setPreview] = useState<PublicInvestorPreview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPublicInvestorPreview()
      .then(setPreview)
      .catch(() => {
        // Silently fail — section just won't render
        console.error('[InvestorPreview] Failed to load preview')
      })
      .finally(() => setLoading(false))
  }, [])

  // Don't render section if no data or still loading
  if (loading || !preview || preview.investors.length === 0) return null

  const visibleCards = preview.investors.slice(0, 5)
  const blurredCards = preview.investors.slice(5, 8)

  return (
    <section className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Investor Intelligence
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            {formatNumber(preview.totalCount)} Investors.{' '}
            <span className="text-international-orange">Find Your Match.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Browse the UK&rsquo;s most comprehensive investor directory for hardware startups.
            Filter by stage, sector, cheque size, and get AI-matched to investors who fund companies like yours.
          </p>
        </AnimatedSection>

        {/* Stats bar */}
        <AnimatedSection className="flex flex-wrap justify-center gap-6 sm:gap-10 mb-10 sm:mb-14">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 text-international-orange" />
            <span>
              <strong className="text-foreground">{formatNumber(preview.totalCount)}</strong> investors
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4 text-success" />
            <span>
              <strong className="text-foreground">{preview.activeDeployingCount}+</strong> actively deploying
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-electric-blue" />
            <span>
              <strong className="text-foreground">AI-powered</strong> matching
            </span>
          </div>
        </AnimatedSection>

        {/* Card grid */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-10 sm:mb-14">
          {visibleCards.map((investor) => (
            <AnimatedCard key={investor.id}>
              <InvestorMiniCard investor={investor} />
            </AnimatedCard>
          ))}
          {blurredCards.map((investor) => (
            <AnimatedCard key={investor.id}>
              <InvestorMiniCard investor={investor} blurred />
            </AnimatedCard>
          ))}
        </StaggerContainer>

        {/* CTA */}
        <AnimatedSection className="text-center">
          <Link
            href="/join?role=founder"
            className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white font-bold px-8 py-3.5 rounded-lg transition-colors text-sm sm:text-base"
          >
            Browse All {formatNumber(preview.totalCount)} Investors — Free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-xs text-muted-foreground mt-3">
            Sign up free to search, filter, and get AI-matched to the right investors for your startup.
          </p>
        </AnimatedSection>
      </div>
    </section>
  )
}
