/**
 * @file RecruitMatchView.tsx
 *
 * @description Top-matched executive recruits view powered by SSE streaming from /api/recruits/match.
 * Auto-fires on mount, renders two-column match cards (WHO + WHY), collapsible near-misses.
 *
 * FLOW: POST /api/recruits/match -> SSE phases (scoring -> scored -> generating -> batch -> complete)
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Loader2,
  Star,
  ChevronDown,
  ChevronUp,
  MapPin,
  Building2,
  Search,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MatchScoreBadge } from '@/app/(platform)/investors/components/MatchScoreBadge'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichedRecruitMatch {
  executive: {
    id: string
    name: string
    headline: string
    skills: string[]
    industries: string[]
    yearsExperience: number
    hourlyRate: number | null
    location: string | null
    rating: number
    reviewCount: number
    isVerified: boolean
    trustedByCount: number
  }
  matchScore: number
  topFactors: string[]
  rationale: string
  matchSignals: string[]
  highlightedSkills: string[]
}

/** Near misses come from SSE as a simpler shape */
interface NearMiss {
  name: string
  headline: string
  score: number
  reason: string
}

type Phase =
  | 'idle'
  | 'scoring'
  | 'scored'
  | 'generating'
  | 'batch'
  | 'complete'
  | 'incomplete_profile'
  | 'no_company'
  | 'error'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProfileIncompleteCard({ missingFields }: { missingFields: string[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-warning" />
          Complete your profile to unlock matches
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We need a few more details about your team needs to find the best executive matches.
        </p>
        <ul className="space-y-1.5">
          {missingFields.map((field) => (
            <li key={field} className="text-sm text-foreground flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
              {field}
            </li>
          ))}
        </ul>
        <Button asChild className="bg-international-orange hover:bg-international-orange-hover">
          <Link href="/settings">
            Complete Profile
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function StarRating({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  // INTENT: Render up to 5 stars, filled proportionally to rating
  const fullStars = Math.floor(rating)
  const hasHalf = rating - fullStars >= 0.5

  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="inline-flex items-center">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={cn(
              'h-3.5 w-3.5',
              i < fullStars
                ? 'fill-warning text-warning'
                : i === fullStars && hasHalf
                  ? 'fill-warning/50 text-warning'
                  : 'text-muted-foreground/30'
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">
        {rating.toFixed(1)} ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
      </span>
    </span>
  )
}

function MatchCard({ match }: { match: EnrichedRecruitMatch }) {
  const exec = match.executive

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-transform">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-5">
            {/* LEFT COLUMN: WHO they are */}
            <div className="space-y-3">
              {/* Score + Name */}
              <div className="flex items-start gap-3">
                <MatchScoreBadge
                  score={match.matchScore}
                  topFactors={match.topFactors}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{exec.name}</span>
                    {exec.isVerified && (
                      <Badge variant="success" className="text-xs">
                        Verified
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {exec.headline}
                  </p>
                </div>
              </div>

              {/* Skills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {match.highlightedSkills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="outline"
                    className="text-xs border-international-orange/30 text-international-orange"
                  >
                    {skill}
                  </Badge>
                ))}
                {exec.skills
                  .filter((s) => !match.highlightedSkills.includes(s))
                  .slice(0, 3)
                  .map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
              </div>

              {/* Rating + Verified + Trusted */}
              <div className="flex items-center gap-3 flex-wrap">
                <StarRating rating={exec.rating} reviewCount={exec.reviewCount} />
                {exec.trustedByCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Trusted by {exec.trustedByCount}
                  </span>
                )}
              </div>

              {/* Rate + Location + Experience */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {exec.hourlyRate !== null && (
                  <span className="font-medium">&pound;{exec.hourlyRate}/hr</span>
                )}
                {exec.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {exec.location}
                  </span>
                )}
                <span>{exec.yearsExperience} years exp.</span>
              </div>

              {/* View Profile link */}
              <div>
                <Button variant="ghost" size="sm" asChild className="px-0 text-international-orange">
                  <Link href={`/recruits/${exec.id}`}>
                    View Profile
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* RIGHT COLUMN: WHY they're right */}
            <div className="space-y-3 md:border-l md:border-border md:pl-5">
              {/* Rationale */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {match.rationale}
              </p>

              {/* Match signals */}
              {match.matchSignals.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {match.matchSignals.map((signal) => (
                    <Badge
                      key={signal}
                      className="text-xs bg-international-orange/10 text-international-orange border-0"
                    >
                      {signal}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Industries */}
              {exec.industries.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {exec.industries.map((industry) => (
                    <Badge key={industry} variant="secondary" className="text-xs">
                      {industry}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Discuss with Harper */}
              <div className="pt-1">
                <AskSpecialistButton
                  specialistId="hiring-team"
                  specialistName="Harper"
                  context={{
                    type: 'general',
                    title: `${exec.name} — Recruit Match`,
                    description: `Match score: ${match.matchScore}/100. ${match.rationale}`,
                    metadata: {
                      notes: `Skills: ${exec.skills.join(', ')}. Signals: ${match.matchSignals.join(', ')}.`,
                    },
                  }}
                  variant="chip"
                  label="Discuss with Harper"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function RecruitMatchView() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [matches, setMatches] = useState<EnrichedRecruitMatch[]>([])
  const [nearMisses, setNearMisses] = useState<NearMiss[]>([])
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [progressText, setProgressText] = useState('')
  const [nearMissesOpen, setNearMissesOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const hasAutoRun = useRef(false)

  const startMatching = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setPhase('scoring')
    setMatches([])
    setNearMisses([])
    setMissingFields([])
    setProgressText('Connecting...')

    try {
      const response = await fetch('/api/recruits/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // DECISION: Keep incomplete last line in buffer for next chunk
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue

          try {
            const event = JSON.parse(raw)

            switch (event.phase) {
              case 'no_company':
                setPhase('no_company')
                break

              case 'incomplete_profile':
                setPhase('incomplete_profile')
                setMissingFields(event.missingFields ?? [])
                break

              case 'scoring':
                setPhase('scoring')
                setProgressText('Analysing your team needs...')
                break

              case 'scored':
                setPhase('scored')
                setProgressText(
                  `Found ${event.totalScored ?? event.total ?? 0} candidates, generating insights...`
                )
                break

              case 'generating':
                setPhase('generating')
                setProgressText(
                  `Generating recommendations ${event.batchNumber ?? event.batch ?? '?'} of ${event.totalBatches ?? '?'}...`
                )
                break

              case 'batch': {
                setPhase('batch')
                const incoming = (event.matches ?? []) as EnrichedRecruitMatch[]
                setMatches((prev) => [...prev, ...incoming])
                break
              }

              case 'near_misses': {
                const incoming = (event.matches ?? []) as NearMiss[]
                setNearMisses((prev) => [...prev, ...incoming])
                break
              }

              case 'complete':
                setPhase('complete')
                setProgressText('')
                break

              case 'error':
                setPhase('error')
                toast.error(event.message ?? 'Something went wrong')
                break

              default:
                break
            }
          } catch {
            // GOTCHA: Partial JSON from chunk boundary — skip, next iteration will complete it
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setPhase('error')
      const message = err instanceof Error ? err.message : 'Failed to connect'
      toast.error(message)
    }
  }, [])

  // INTENT: Auto-run matching on mount so user sees results immediately
  useEffect(() => {
    if (hasAutoRun.current) return
    hasAutoRun.current = true
    startMatching()
  }, [startMatching])

  const isLoading = phase === 'scoring' || phase === 'scored' || phase === 'generating'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recommended for Your Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {phase === 'complete'
              ? `${matches.length} matches found`
              : 'Matched executives based on your team profile'}
          </p>
        </div>

        {/* Refresh button */}
        <Button
          onClick={startMatching}
          disabled={isLoading}
          className={cn(
            isLoading
              ? 'bg-muted text-muted-foreground'
              : 'bg-international-orange hover:bg-international-orange-hover'
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Idle state */}
      {phase === 'idle' && matches.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-international-orange/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-international-orange" />
            </div>
            <p className="text-sm text-muted-foreground">
              Preparing your personalised executive matches...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress indicator */}
      <AnimatePresence>
        {isLoading && progressText && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-international-orange animate-pulse" />
                  <span className="text-sm font-medium text-foreground">{progressText}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No company setup — onboarding prompt */}
      {phase === 'no_company' && (
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <div className="mx-auto p-3 rounded-full bg-international-orange-light w-fit">
              <Building2 className="h-8 w-8 text-international-orange" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Set up your company to see matches</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Tell us about your company so we can find the best candidates for you. You can still browse all candidates in the meantime.
              </p>
            </div>
            <Link href="/settings/company">
              <Button size="sm" className="bg-international-orange hover:bg-international-orange-hover">
                Set up company profile
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Profile incomplete gate */}
      {phase === 'incomplete_profile' && (
        <ProfileIncompleteCard missingFields={missingFields} />
      )}

      {/* Empty state — complete but no real matches */}
      {phase === 'complete' && matches.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No talent matches yet</p>
            <p className="text-xs text-muted-foreground">
              Check back as more professionals join the platform. You can still browse all candidates in the Browse tab.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Match cards */}
      {matches.length > 0 && (
        <div className="space-y-4">
          <AnimatePresence>
            {matches.map((match) => (
              <MatchCard key={match.executive.id} match={match} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Near misses section */}
      {nearMisses.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <button
              onClick={() => setNearMissesOpen(!nearMissesOpen)}
              className="flex items-center justify-between w-full text-left"
            >
              <h2 className="text-base font-semibold text-foreground">
                Near Misses ({nearMisses.length})
              </h2>
              {nearMissesOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>

          <AnimatePresence>
            {nearMissesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <CardContent className="pt-3">
                  <div className="space-y-2">
                    {nearMisses.map((miss) => (
                      <div
                        key={miss.name}
                        className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                      >
                        <span className="text-xs font-bold text-muted-foreground tabular-nums w-8 text-right shrink-0">
                          {miss.score}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-foreground">
                            {miss.name}
                          </span>
                          <p className="text-xs text-muted-foreground truncate">
                            {miss.headline}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 max-w-[200px] truncate">
                          {miss.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* Error state */}
      {phase === 'error' && matches.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm font-medium text-foreground">Failed to load matches</p>
            <p className="text-xs text-muted-foreground">
              Something went wrong. Please try again.
            </p>
            <Button variant="secondary" size="sm" onClick={startMatching}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
