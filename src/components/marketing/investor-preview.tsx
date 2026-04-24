/**
 * @file investor-preview.tsx
 *
 * @description Investor intelligence preview section on the marketing homepage.
 * Header + stats row + sign-up CTA. The interactive search box that used to
 * live here was removed 2026-04-24 — the authenticated /investors search is
 * the canonical surface, and a second broken search on the public page was a
 * liability (marketing promised a capability the logged-out user could not
 * actually validate).
 *
 * @security Public — no auth required, fetches only the total investor count
 * for the stats display via getPublicInvestorPreview().
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { AnimatedSection } from '@/components/marketing/animations'
import { getPublicInvestorPreview } from '@/actions/public-investor-preview'
import type { PublicInvestorPreview } from '@/actions/public-investor-preview'

function formatNumber(n: number): string {
  if (n >= 10000) return '10K+'
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K+`
  return `${n}+`
}

export function InvestorPreviewSection() {
  const [preview, setPreview] = useState<PublicInvestorPreview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPublicInvestorPreview()
      .then(setPreview)
      .catch(() => {
        console.error('[InvestorPreview] Failed to load preview')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !preview) return null

  const totalCount = preview.totalCount ?? 0

  return (
    <section id="investors" className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-8 sm:mb-10">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Investor Intelligence
          </span>
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Find the investors who actually{' '}
            <span className="text-international-orange">fund hardware</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
            Raising money for a hardware startup is its own full-time job. This is what I built because I wish I had it. Search venture capital, private equity, and angels — matching scores show how well each investor fits your stage, sector, and geography.
          </p>
        </AnimatedSection>

        <AnimatedSection className="grid grid-cols-3 gap-3 sm:gap-6 max-w-3xl mx-auto mb-10 sm:mb-12 md:mb-16">
          {[
            { value: formatNumber(totalCount), label: 'Investors' },
            { value: '49,000+', label: 'Contacts' },
            { value: '3,000+', label: 'Grants' },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-2 sm:p-6 rounded-xl border bg-card">
              <p className="text-lg sm:text-3xl md:text-4xl font-black text-international-orange mb-1">{stat.value}</p>
              <p className="text-[10px] sm:text-sm font-mono uppercase tracking-wider text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </AnimatedSection>

        <AnimatedSection className="text-center">
          <Link
            href="/join"
            className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white font-bold px-8 py-3.5 rounded-lg transition-colors text-sm sm:text-base"
          >
            Get Started Free — See All Investors
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-xs text-muted-foreground mt-3">
            Sign up free to search, filter, and get matched to the right investors for your startup.
          </p>
        </AnimatedSection>
      </div>
    </section>
  )
}
