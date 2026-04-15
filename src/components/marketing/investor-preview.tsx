/**
 * @file investor-preview.tsx
 *
 * @description Interactive investor search preview for the marketing homepage.
 * Visitors can search/describe their startup and see anonymized results proving
 * matching investors exist, then sign up to reveal details.
 *
 * @security Only displays ANONYMIZED data — no firm names, no contact info,
 * no identifying information. Designed to drive signup conversion.
 */

'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Search,
  Lock,
  ArrowRight,
  Zap,
  X,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AnimatedSection, StaggerContainer } from '@/components/marketing/animations'
import { MatchPillarBars } from '@/app/(platform)/investors/components/MatchPillarBars'
import { getPublicInvestorPreview, searchPublicInvestors } from '@/actions/public-investor-preview'
import type {
  PublicInvestorPreview,
  AnonymizedInvestorResult,
  InvestorSearchResult,
} from '@/actions/public-investor-preview'
import { useEffect } from 'react'

// ─── Example search chips ────────────────────────────────────────────────────

const EXAMPLE_SEARCHES = [
  'Deep tech seed',
  'Consumer hardware Series A',
  'Medical devices pre-seed',
  'UK manufacturing',
]

// ─── Signup URL builder ─────────────────────────────────────────────────────

// INTENT: Extract stage/sector from the search query to pre-populate the /join form.
// Duplicated from server action keywords because "use server" files can only export async functions.

const STAGE_MAP: Record<string, string> = {
  'pre-seed': 'Pre-Seed', 'preseed': 'Pre-Seed', 'seed': 'Seed',
  'series-a': 'Series A', 'series a': 'Series A', 'series-b': 'Series B',
  'series b': 'Series B', 'growth': 'Growth', 'early': 'Early Stage',
}

const SECTOR_LIST = [
  'hardware', 'software', 'saas', 'fintech', 'healthtech', 'medtech',
  'biotech', 'cleantech', 'climate', 'deeptech', 'deep tech', 'robotics',
  'consumer', 'electronics', 'manufacturing', 'medical', 'devices', 'iot',
  'aerospace', 'space', 'automotive', 'defence',
]

function buildSignupUrl(searchQuery?: string): string {
  const params = new URLSearchParams({ role: 'founder' })

  if (searchQuery) {
    const lower = searchQuery.toLowerCase()

    // Extract stage
    for (const [keyword, stage] of Object.entries(STAGE_MAP)) {
      if (lower.includes(keyword)) {
        params.set('stage', stage)
        break
      }
    }

    // Extract sectors as industry
    const matched: string[] = []
    for (const sector of SECTOR_LIST) {
      if (lower.includes(sector)) {
        matched.push(sector.charAt(0).toUpperCase() + sector.slice(1))
      }
    }
    if (matched.length > 0) {
      params.set('industry', matched.slice(0, 2).join(', '))
    }
  }

  return `/join?${params.toString()}`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 10000) return '10K+'
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K+`
  return `${n}+`
}

// ─── Skeleton Card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 bg-muted rounded" />
          <div className="h-4 w-16 bg-muted rounded" />
        </div>
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-muted rounded-full" />
          <div className="h-5 w-20 bg-muted rounded-full" />
        </div>
        <div className="flex gap-2">
          <div className="h-5 w-14 bg-muted rounded-full" />
          <div className="h-5 w-18 bg-muted rounded-full" />
          <div className="h-5 w-12 bg-muted rounded-full" />
        </div>
        <div className="h-4 w-28 bg-muted rounded" />
      </CardContent>
    </Card>
  )
}

// ─── Anonymized Result Card ──────────────────────────────────────────────────

function AnonymizedCard({ result, signupUrl }: { result: AnonymizedInvestorResult; signupUrl: string }) {
  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]">
      <CardContent className="p-4 space-y-3">
        {/* Header: placeholder name + composite % */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{result.placeholder}</span>
              {result.firm_type && result.firm_type !== result.subcategory && (
                <Badge variant="outline" size="sm" className="text-[10px]">
                  {result.firm_type}
                </Badge>
              )}
              <Badge variant="secondary" size="sm" className="text-[10px]">
                {result.subcategory}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                result.geo_summary,
                result.cheque_range_label,
                result.stage_focus.slice(0, 3).join(', '),
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-xl font-bold text-international-orange tabular-nums">
              {result.composite}%
            </span>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              match
            </span>
          </div>
        </div>

        {/* 6 pillar bars — exact same component the authenticated For You tab uses */}
        <MatchPillarBars pillars={result.pillars} hideZeroValues />

        {/* Thesis excerpt — single anonymous-flavour sentence */}
        {result.thesis_excerpt && (
          <p className="text-sm text-foreground/80 leading-snug line-clamp-2">
            {result.thesis_excerpt}
          </p>
        )}

        {/* Sectors + active flag */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {result.sectors.map((sector) => (
              <span
                key={sector}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium"
              >
                {sector}
              </span>
            ))}
          </div>
          {result.is_active_deploying && (
            <span className="flex items-center gap-0.5 text-success shrink-0">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              <span className="text-[9px] font-semibold uppercase tracking-wide">Active</span>
            </span>
          )}
        </div>

        {/* Lock CTA */}
        <div className="pt-2 border-t border-border">
          <Link
            href={signupUrl}
            className="flex items-center gap-1.5 text-xs text-international-orange font-medium hover:underline"
          >
            <Lock className="h-3 w-3" />
            Sign up free to see this investor
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}


// ─── Main Section ────────────────────────────────────────────────────────────

export function InvestorPreviewSection() {
  const [preview, setPreview] = useState<PublicInvestorPreview | null>(null)
  const [searchResult, setSearchResult] = useState<InvestorSearchResult | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const signupUrl = buildSignupUrl(activeQuery || undefined)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // Load default preview on mount
  useEffect(() => {
    getPublicInvestorPreview()
      .then(setPreview)
      .catch(() => {
        console.error('[InvestorPreview] Failed to load preview')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed || trimmed.length < 2) return

    setActiveQuery(trimmed)
    startTransition(async () => {
      try {
        const result = await searchPublicInvestors(trimmed)
        setSearchResult(result)
      } catch {
        console.error('[InvestorPreview] Search failed')
        setSearchResult({ results: [], totalMatches: 0 })
      }
    })
  }, [])

  const handleReset = useCallback(() => {
    setSearchQuery('')
    setActiveQuery('')
    setSearchResult(null)
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch(searchQuery)
    }
  }, [handleSearch, searchQuery])

  const handleChipClick = useCallback((chip: string) => {
    setSearchQuery(chip)
    handleSearch(chip)
  }, [handleSearch])

  // Don't render if no data and not searching
  if (loading || (!preview && !searchResult)) return null

  const totalCount = preview?.totalCount ?? 0
  const hasSearched = !!activeQuery && !!searchResult

  return (
    <section id="investors" className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <AnimatedSection className="text-center mb-8 sm:mb-10">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Investor Intelligence
          </span>
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Find the investors who actually{' '}
            <span className="text-international-orange">fund hardware</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
            Search investors — venture capital, private equity, and angels. Matching scores show how well each investor fits your stage, sector, and geography.
          </p>
        </AnimatedSection>

        {/* Stats row */}
        <AnimatedSection className="grid grid-cols-3 gap-3 sm:gap-6 max-w-3xl mx-auto mb-10 sm:mb-12 md:mb-16">
          {[
            { value: formatNumber(totalCount), label: 'Investors' },
            { value: '49,000+', label: 'Contacts' },
            { value: '3,000+', label: 'Grants' },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-4 sm:p-6 rounded-xl border bg-card">
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-international-orange mb-1">{stat.value}</p>
              <p className="text-xs sm:text-sm font-mono uppercase tracking-wider text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </AnimatedSection>

        {/* Search box */}
        <AnimatedSection className="max-w-2xl mx-auto mb-8 sm:mb-10">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. pre-seed hardware startup building consumer electronics"
                className="w-full h-11 pl-9 pr-9 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange transition-colors"
                aria-label="Describe your startup to find matching investors"
              />
              {searchQuery && (
                <button
                  onClick={handleReset}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => handleSearch(searchQuery)}
              disabled={isPending || searchQuery.trim().length < 2}
              className="h-11 px-5 rounded-lg bg-international-orange hover:bg-international-orange-hover disabled:opacity-50 text-white font-semibold text-sm transition-colors shrink-0"
            >
              Search
            </button>
          </div>

          {/* Example chips (only shown before search) */}
          {!hasSearched && (
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {EXAMPLE_SEARCHES.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-international-orange/40 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
        </AnimatedSection>

        {/* Trust bar (default state) */}
        {!hasSearched && preview && (
          <AnimatedSection className="flex flex-wrap justify-center gap-6 sm:gap-10 mb-10 sm:mb-14">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-4 w-4 text-success" />
              <span>
                <strong className="text-foreground">{preview.activeDeployingCount}+</strong> actively deploying
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-electric-blue" />
              <span>
                <strong className="text-foreground">Keyword</strong> matching
              </span>
            </div>
          </AnimatedSection>
        )}

        {/* Loading state */}
        {isPending && (
          <div className="max-w-2xl mx-auto space-y-4 mb-10">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Search results */}
        {hasSearched && !isPending && (
          <div className="max-w-2xl mx-auto mb-10">
            {/* Active query badge */}
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="brand" size="sm">
                &ldquo;{activeQuery}&rdquo;
              </Badge>
              <button
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>

            {searchResult.results.length > 0 ? (
              <>
                {/* Results header */}
                <p className="text-lg font-bold text-foreground mb-4">
                  Found {searchResult.totalMatches} matching investor{searchResult.totalMatches !== 1 ? 's' : ''}
                </p>

                {/* Result cards */}
                <StaggerContainer className="space-y-4">
                  {searchResult.results.map((result) => (
                    <AnonymizedCard key={result.placeholder} result={result} signupUrl={signupUrl} />
                  ))}
                </StaggerContainer>

                {/* Below cards CTA */}
                {searchResult.totalMatches > searchResult.results.length && (
                  <p className="text-sm text-muted-foreground mt-6 text-center">
                    Showing {searchResult.results.length} of {searchResult.totalMatches} results.{' '}
                    <Link
                      href={signupUrl}
                      className="text-international-orange font-medium hover:underline"
                    >
                      Sign up free to browse all {searchResult.totalMatches} investors and get matched.
                    </Link>
                  </p>
                )}
              </>
            ) : (
              /* Zero results */
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">
                  No exact matches — but with {formatNumber(totalCount)} investors, we likely have someone.
                </p>
                <Link
                  href={signupUrl}
                  className="inline-flex items-center gap-1 text-international-orange font-medium text-sm mt-2 hover:underline"
                >
                  Sign up to search the full directory
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <AnimatedSection className="text-center">
          <Link
            href={signupUrl}
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
