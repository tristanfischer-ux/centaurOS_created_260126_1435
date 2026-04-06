'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, getInitials } from '@/lib/utils'
import { safeParseAttributes } from '@/lib/marketplace-utils'
import { getAvatarGradient, type MarketplaceCategory } from '@/lib/marketplace-colors'
import {
    Search,
    Sparkles,
    Star,
    MapPin,
    ShieldCheck,
    ArrowRight,
    Loader2,
    X,
    Clock,
    CalendarCheck,
    Users,
    TrendingUp,
    Award,
} from 'lucide-react'
import { toast } from 'sonner'
import { getEnrichedPeopleListings, getEnrichedPeopleByIds, searchPeopleSemanticAction } from '@/actions/people-marketplace'
import type { EnrichedPersonListing, TalentMatch, TalentMatchResult } from '@/actions/people-marketplace'
import type { MarketplaceListing } from '@/actions/marketplace'

/**
 * TalentFinder - AI-powered conversational talent search.
 *
 * @description Provides a prominent search input where users describe who they need
 * in natural language. Uses AI to match against People listings and returns scored
 * results with reasoning. The "aha moment" component that makes users say "wow."
 *
 * @component
 *
 * @example
 * <TalentFinder onViewDetail={handleViewDetail} />
 */

/** Escape special regex characters in user input to prevent ReDoS. */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Client-side keyword matching — mirrors performKeywordMatching in people-marketplace.ts
 *  but runs against already-fetched listings to avoid a redundant server round trip. */
function clientKeywordMatch(query: string, listings: EnrichedPersonListing[]): TalentMatchResult {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    if (words.length === 0) return { matches: [], explanation: 'No matching keywords found.', error: null }

    const scored = listings.map(listing => {
        const attrs = safeParseAttributes(listing.attributes)
        const text = [
            listing.title, listing.description, listing.subcategory,
            ...((attrs.skills as string[]) ?? []),
            ...((attrs.expertise as string[]) ?? []),
            (attrs.role as string) || '',
            (attrs.location as string) || '',
            ...((attrs.industries as string[]) ?? []),
            ...((attrs.previous_companies as string[]) ?? []),
        ].join(' ').toLowerCase()

        let score = 0
        const matched: string[] = []
        for (const w of words) {
            // Use word-boundary matching (same as server-side performKeywordMatching)
            const pattern = new RegExp('\\b' + escapeRegex(w) + '\\b', 'i')
            if (pattern.test(text)) { score += 10; matched.push(w) }
        }
        if (listing.is_verified) score += 5
        if (listing.trustData.averageRating && listing.trustData.averageRating >= 4.5) score += 5
        if (listing.trustData.totalReviews > 0) score += 3
        if (listing.trustData.trustedByCount > 2) score += 3

        const max = words.length * 10 + 16
        const norm = Math.min(100, Math.round((score / max) * 100))
        const skills = ((attrs.skills as string[]) ?? (attrs.expertise as string[]) ?? [])
        const highlighted = skills.filter((s: string) => words.some(w => s.toLowerCase().includes(w)))

        return {
            listing, matchScore: norm,
            matchReasons: matched.length > 0 ? [`Matches keywords: ${matched.join(', ')}`] : ['General match based on profile'],
            highlightedSkills: highlighted,
        }
    })

    const top = scored.filter(m => m.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore).slice(0, 5)
    return { matches: top, explanation: `Found ${top.length} potential matches based on your description.`, error: null }
}

interface TalentFinderProps {
    /** Callback when user clicks to view a matched listing's detail */
    onViewDetail: (listing: MarketplaceListing) => void
}

/** Example queries shown as rotating placeholder text */
const EXAMPLE_QUERIES = [
    "I need a fractional CTO who's scaled hardware startups...",
    "Looking for a quality engineer with aerospace experience...",
    "Find me a CAD specialist who knows SolidWorks and Fusion360...",
    "Need a fractional CFO for a pre-seed hardware company...",
    "Looking for a supply chain expert in automotive...",
]

/** Badge type to human-readable label and icon */
const BADGE_LABELS: Record<string, { label: string; icon: typeof Award }> = {
    fast_responder: { label: 'Fast Responder', icon: Clock },
    top_rated: { label: 'Top Rated', icon: Star },
    verified_partner: { label: 'Verified Partner', icon: ShieldCheck },
    reliable: { label: 'Reliable', icon: Award },
    rising_star: { label: 'Rising Star', icon: TrendingUp },
}

export function TalentFinder({ onViewDetail }: TalentFinderProps) {
    const [query, setQuery] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [results, setResults] = useState<TalentMatchResult | null>(null)
    const [visibleMatches, setVisibleMatches] = useState<TalentMatch[]>([])
    const [animationComplete, setAnimationComplete] = useState(true)
    const [placeholderIndex, setPlaceholderIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    // Rotate placeholder text
    useEffect(() => {
        const interval = setInterval(() => {
            setPlaceholderIndex(prev => (prev + 1) % EXAMPLE_QUERIES.length)
        }, 4000)
        return () => clearInterval(interval)
    }, [])

    // Animate match cards appearing one by one
    useEffect(() => {
        if (!results?.matches.length) {
            setVisibleMatches([])
            // If results exist but matches is empty, animation is already "complete"
            if (results) setAnimationComplete(true)
            return
        }

        setVisibleMatches([])
        setAnimationComplete(false)
        const matches = results.matches
        let index = 0
        let timeoutId: ReturnType<typeof setTimeout>

        const addNext = () => {
            if (index < matches.length) {
                setVisibleMatches(prev => [...prev, matches[index]])
                index++
                timeoutId = setTimeout(addNext, 200)
            } else {
                setAnimationComplete(true)
            }
        }

        // Start animation after a small delay
        timeoutId = setTimeout(addNext, 300)

        // Cleanup: cancel pending timeouts when results change or component unmounts
        return () => clearTimeout(timeoutId)
    }, [results])

    const handleSearch = useCallback(async () => {
        if (!query.trim() || query.trim().length < 3) {
            toast.error('Please describe who you need (at least 3 characters)')
            return
        }

        setIsSearching(true)
        setResults(null)
        setAnimationComplete(false)

        try {
            // DECISION: Semantic pre-filter first — embed the query, find the top 25
            // most similar People listings via pgvector, then send those to GPT for
            // detailed scoring. This gives better results (semantically relevant
            // candidates) with fewer tokens (25 pre-filtered vs 50 random).
            // Falls back to full fetch + keyword matching if semantic search fails.
            let listings: EnrichedPersonListing[]
            try {
                const semanticHits = await searchPeopleSemanticAction(query.trim(), {
                    matchThreshold: 0.3,
                    matchCount: 25,
                })
                if (semanticHits.length > 0) {
                    listings = await getEnrichedPeopleByIds(semanticHits.map(h => h.id))
                } else {
                    listings = await getEnrichedPeopleListings()
                }
            } catch {
                console.warn('[TalentFinder] Semantic pre-filter failed, falling back to full fetch')
                listings = await getEnrichedPeopleListings()
            }

            if (listings.length === 0) {
                setResults({ matches: [], explanation: 'No talent listings available yet.', error: null })
                return
            }

            let result: TalentMatchResult | null = null
            try {
                const res = await fetch('/api/marketplace/talent-match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: query.trim(),
                        listings: listings.slice(0, 25).map(l => ({
                            id: l.id,
                            title: l.title,
                            description: l.description,
                            subcategory: l.subcategory,
                            attributes: l.attributes,
                            is_verified: l.is_verified,
                            trustData: l.trustData,
                        })),
                    }),
                })
                if (res.ok) {
                    const data = await res.json()
                    if (data.success && data.matches) {
                        // Map API response back to TalentMatch[] with full listing objects
                        const listingMap = new Map(listings.map(l => [l.id, l]))
                        const matches: TalentMatch[] = (data.matches as { id: string; score: number; reasons: string[]; highlightedSkills: string[] }[])
                            .map(m => {
                                const listing = listingMap.get(m.id)
                                if (!listing) return null
                                return {
                                    listing,
                                    matchScore: m.score,
                                    matchReasons: m.reasons,
                                    highlightedSkills: m.highlightedSkills,
                                } as TalentMatch
                            })
                            .filter((m): m is TalentMatch => m !== null)
                        result = { matches, explanation: data.explanation || '', error: null }
                    }
                }
            } catch {
                // AI route failed — fall back to keyword matching below
                console.warn('[TalentFinder] AI route failed, falling back to keyword matching')
            }

            // Fallback to keyword matching using already-fetched listings.
            if (!result) {
                result = clientKeywordMatch(query.trim(), listings)
            }

            setResults(result)
        } catch (err) {
            console.error('[TalentFinder] Search failed:', err)
            toast.error('Search failed. Please try again.')
        } finally {
            setIsSearching(false)
        }
    }, [query])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isSearching) {
            handleSearch()
        }
    }, [handleSearch, isSearching])

    const handleClear = useCallback(() => {
        setQuery('')
        setResults(null)
        setVisibleMatches([])
        inputRef.current?.focus()
    }, [])

    return (
        <div className="space-y-4">
            {/* Search hero */}
            <Card className="bg-gradient-to-br from-international-orange/5 via-background to-electric-blue/5 border-international-orange/20 overflow-hidden">
                <CardContent className="p-6">
                    <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-international-orange/10 flex items-center justify-center shrink-0">
                            <Sparkles className="h-5 w-5 text-international-orange" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground">
                                Describe who you need
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Tell us in plain English and we&apos;ll find your perfect match instantly.
                            </p>
                        </div>
                    </div>

                    {/* Search input */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={EXAMPLE_QUERIES[placeholderIndex]}
                            className={cn(
                                'w-full pl-12 pr-28 py-4 rounded-xl border bg-background text-base',
                                'placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange/50',
                                'transition-all duration-200'
                            )}
                            aria-label="Describe who you need"
                            disabled={isSearching}
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                            {query && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleClear}
                                    className="h-8 w-8"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                            <Button
                                onClick={handleSearch}
                                disabled={isSearching || query.trim().length < 3}
                                className="gap-2 rounded-lg"
                                size="sm"
                            >
                                {isSearching ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Matching...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        Find Talent
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                    {query.trim().length > 0 && query.trim().length < 3 && (
                        <p className="text-xs text-muted-foreground mt-2 ml-1">
                            Enter at least 3 characters
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Loading state */}
            {isSearching && (
                <div className="flex items-center justify-center py-8 gap-3">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full border-2 border-international-orange/20 border-t-international-orange animate-spin" />
                        <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-international-orange" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-foreground">Finding your perfect match...</p>
                        <p className="text-xs text-muted-foreground">Analyzing skills, experience, and fit</p>
                    </div>
                </div>
            )}

            {/* Results */}
            {results && !isSearching && (
                <div className="space-y-3" aria-live="polite">
                    {/* Summary */}
                    {results.explanation && (
                        <div className="flex items-center gap-2 px-1">
                            <Sparkles className="h-4 w-4 text-international-orange shrink-0" />
                            <p className="text-sm text-muted-foreground">{results.explanation}</p>
                        </div>
                    )}

                    {/* Match cards */}
                    {visibleMatches.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {visibleMatches.map((match, index) => (
                                <TalentMatchCard
                                    key={match.listing.id}
                                    match={match}
                                    rank={index + 1}
                                    onViewDetail={onViewDetail}
                                />
                            ))}
                        </div>
                    ) : animationComplete ? (
                        <Card className="border-dashed">
                            <CardContent className="py-8 text-center">
                                <p className="text-sm text-muted-foreground">
                                    No strong matches found. Try rephrasing your requirements or broadening your search.
                                </p>
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            )}
        </div>
    )
}

/**
 * TalentMatchCard - Individual match result card with score and reasoning.
 */
function TalentMatchCard({
    match,
    rank,
    onViewDetail,
}: {
    match: TalentMatch
    rank: number
    onViewDetail: (listing: MarketplaceListing) => void
}) {
    const { listing, matchScore, matchReasons, highlightedSkills } = match
    const attrs = safeParseAttributes(listing.attributes)
    const initials = getInitials(listing.title)
    const gradient = getAvatarGradient('People' as MarketplaceCategory, listing.title)
    const location = attrs.location as string | undefined
    const role = attrs.role as string | undefined
    const rate = (attrs.rate || attrs.day_rate) as string | undefined

    // Score color
    const scoreColor = matchScore >= 80
        ? 'text-status-success bg-status-success-light'
        : matchScore >= 60
            ? 'text-international-orange bg-international-orange/10'
            : 'text-muted-foreground bg-muted'

    return (
        <Card
            className={cn(
                'group cursor-pointer border overflow-hidden',
                'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200',
                'animate-in fade-in slide-in-from-bottom-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange/50',
                rank === 1 && 'ring-2 ring-international-orange/30 border-international-orange/20'
            )}
            style={{ animationDelay: `${(rank - 1) * 150}ms` }}
            role="button"
            tabIndex={0}
            aria-label={`View ${listing.title} — ${matchScore}% match`}
            onClick={() => onViewDetail(listing)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onViewDetail(listing)
                }
            }}
        >
            <CardContent className="p-4">
                {/* Header: Avatar + Info + Score */}
                <div className="flex gap-3 mb-3">
                    <div className="relative">
                        <div className={cn(
                            'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-semibold text-sm shrink-0 shadow-sm',
                            gradient
                        )}>
                            {initials}
                        </div>
                        {rank === 1 && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-international-orange text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                                1
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            {listing.is_verified && (
                                <ShieldCheck className="w-3.5 h-3.5 text-status-success shrink-0" aria-label="Verified" />
                            )}
                            <h3 className="text-sm font-bold text-foreground truncate">
                                {listing.title}
                            </h3>
                        </div>
                        {role && (
                            <p className="text-xs text-muted-foreground truncate">{role}</p>
                        )}
                    </div>

                    {/* Match score */}
                    <div
                        className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 h-fit',
                            scoreColor
                        )}
                        aria-label={`Match score: ${matchScore}%`}
                    >
                        <TrendingUp className="w-3 h-3" />
                        {matchScore}%
                    </div>
                </div>

                {/* Match reasons */}
                <div className="space-y-1 mb-3">
                    {matchReasons.slice(0, 2).map((reason, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="text-international-orange mt-0.5 shrink-0">+</span>
                            <span className="line-clamp-1">{reason}</span>
                        </p>
                    ))}
                </div>

                {/* Highlighted skills */}
                {highlightedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                        {highlightedSkills.slice(0, 3).map(skill => (
                            <Badge
                                key={skill}
                                variant="secondary"
                                className="text-[10px] bg-international-orange/10 text-international-orange border-0"
                            >
                                {skill}
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Trust signals row */}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-3">
                    {listing.trustData?.averageRating && listing.trustData.averageRating > 0 && (
                        <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="font-medium text-foreground">
                                {listing.trustData.averageRating.toFixed(1)}
                            </span>
                            <span>({listing.trustData.totalReviews})</span>
                        </div>
                    )}
                    {listing.trustData?.trustedByCount > 0 && (
                        <div className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>Trusted by {listing.trustData.trustedByCount}</span>
                        </div>
                    )}
                    {location && (
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[100px]">{location}</span>
                        </div>
                    )}
                </div>

                {/* Footer: Rate + CTAs */}
                <div className="flex items-center justify-between pt-3 border-t border-muted">
                    <div>
                        {rate && (
                            <span className="text-sm font-bold text-foreground">
                                {rate.startsWith('£') ? rate : `£${rate}`}
                                <span className="text-xs text-muted-foreground font-normal ml-0.5">/day</span>
                            </span>
                        )}
                    </div>
                    <Button
                        size="sm"
                        variant="default"
                        className="gap-1 text-xs h-8"
                        onClick={(e) => {
                            e.stopPropagation()
                            onViewDetail(listing)
                        }}
                    >
                        View Profile
                        <ArrowRight className="w-3 h-3" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
