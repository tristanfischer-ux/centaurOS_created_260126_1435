/**
 * @file InvestorMatchView.tsx
 *
 * @description Top-matched investors view powered by SSE streaming from /api/investors/match.
 * Shows a profile completeness gate when needed, a responsive scored investor table,
 * tier-gated partner/email columns, near-miss section, and shortlist functionality.
 *
 * FLOW: POST /api/investors/match -> SSE phases (scoring -> scored -> generating -> batch -> complete)
 */

'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Heart,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mail,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MatchScoreBadge } from './MatchScoreBadge'
import { LockedSection } from './LockedSection'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichedMatch {
  investor: {
    id: string
    name: string
    type: string
    stageFocus: string[]
    sectors: string[]
    fundSize: number | null
    chequeRange: { min: number; max: number } | null
    thesis: string
    portfolio: string[]
  }
  matchScore: number
  topFactors: string[]
  rationale: string
  partner?: {
    name: string
    title: string
    email?: string
    linkedin?: string
    rationale?: string
  }
  draftEmail?: {
    subject: string
    body: string
  }
}

interface TierInfo {
  tier: string
  matchLimit: number
  totalScored: number
}

type Phase =
  | 'idle'
  | 'scoring'
  | 'scored'
  | 'generating'
  | 'batch'
  | 'complete'
  | 'incomplete_profile'
  | 'error'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

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
          We need a few more details about your company to find the best investor matches.
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
          <Link href="/strategy">
            Complete Profile
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function MatchRow({
  match,
  isPaid,
  isShortlisted,
  onToggleShortlist,
}: {
  match: EnrichedMatch
  isPaid: boolean
  isShortlisted: boolean
  onToggleShortlist: (id: string) => void
}) {
  const [emailExpanded, setEmailExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyEmail = useCallback(() => {
    if (!match.draftEmail) return
    const text = `Subject: ${match.draftEmail.subject}\n\n${match.draftEmail.body}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [match.draftEmail])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="border border-border rounded-lg bg-card p-4 space-y-3"
    >
      {/* Row header: score + investor name + shortlist */}
      <div className="flex items-start gap-3">
        <MatchScoreBadge score={match.matchScore} topFactors={match.topFactors} size="md" />

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Investor info */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{match.investor.name}</span>
            <Badge variant="secondary" className="text-xs">
              {match.investor.type}
            </Badge>
          </div>

          {/* Stage focus tags */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {match.investor.stageFocus.map((stage) => (
              <Badge key={stage} variant="outline" className="text-xs">
                {stage}
              </Badge>
            ))}
          </div>

          {/* Fund size + cheque range */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {match.investor.fundSize && (
              <span>Fund: {formatCurrency(match.investor.fundSize)}</span>
            )}
            {match.investor.chequeRange && (
              <span>
                Cheque: {formatCurrency(match.investor.chequeRange.min)} &ndash;{' '}
                {formatCurrency(match.investor.chequeRange.max)}
              </span>
            )}
          </div>
        </div>

        {/* Shortlist button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleShortlist(match.investor.id)}
          className="shrink-0"
          aria-label={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
        >
          <Heart
            className={cn(
              'h-4 w-4 transition-colors',
              isShortlisted
                ? 'fill-international-orange text-international-orange'
                : 'text-muted-foreground'
            )}
          />
        </Button>
      </div>

      {/* Rationale */}
      <div className="pl-[52px]">
        <p className="text-sm text-muted-foreground leading-relaxed">{match.rationale}</p>
      </div>

      {/* Partner + Email (paid only) */}
      {isPaid && match.partner && (
        <div className="pl-[52px] space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-foreground">{match.partner.name}</span>
            <span className="text-muted-foreground">{match.partner.title}</span>
            {match.partner.linkedin && (
              <a
                href={match.partner.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-international-orange hover:underline inline-flex items-center gap-1"
              >
                LinkedIn
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Draft email expand/collapse */}
          {match.draftEmail && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEmailExpanded(!emailExpanded)}
                className="text-xs gap-1 px-2"
              >
                <Mail className="h-3.5 w-3.5" />
                Draft outreach email
                {emailExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </Button>

              <AnimatePresence>
                {emailExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 border border-border rounded-md bg-muted/50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-foreground">
                          Subject: {match.draftEmail.subject}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyEmail}
                          className="text-xs gap-1 h-7"
                        >
                          {copied ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {copied ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                        {match.draftEmail.body}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InvestorMatchView() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [matches, setMatches] = useState<EnrichedMatch[]>([])
  const [nearMisses, setNearMisses] = useState<EnrichedMatch[]>([])
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [progressText, setProgressText] = useState('')
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set())
  const [nearMissesOpen, setNearMissesOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // INTENT: Determine paid status from tier info to gate partner/email column
  const isPaid = tierInfo ? tierInfo.tier !== 'free' : false
  const FREE_MATCH_LIMIT = 5

  const startMatching = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setPhase('scoring')
    setMatches([])
    setNearMisses([])
    setMissingFields([])
    setTierInfo(null)
    setProgressText('Connecting...')

    try {
      const response = await fetch('/api/investors/match', {
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
              case 'incomplete_profile':
                setPhase('incomplete_profile')
                setMissingFields(event.missingFields ?? [])
                break

              case 'scoring':
                setPhase('scoring')
                setProgressText(`Scoring ${event.total ?? ''} investors...`)
                break

              case 'scored':
                setPhase('scored')
                setProgressText(`Scored ${event.total ?? 0} investors. Generating insights...`)
                break

              case 'generating':
                setPhase('generating')
                setProgressText(
                  `Generating matches: batch ${event.batch ?? '?'} of ${event.totalBatches ?? '?'}...`
                )
                break

              case 'batch': {
                setPhase('batch')
                const incoming = (event.matches ?? []) as EnrichedMatch[]
                setMatches((prev) => [...prev, ...incoming])
                break
              }

              case 'near_misses': {
                const incoming = (event.matches ?? []) as EnrichedMatch[]
                setNearMisses((prev) => [...prev, ...incoming])
                break
              }

              case 'complete':
                setPhase('complete')
                if (event.tierInfo) setTierInfo(event.tierInfo as TierInfo)
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

  const handleToggleShortlist = useCallback((investorId: string) => {
    setShortlisted((prev) => {
      const next = new Set(prev)
      if (next.has(investorId)) {
        next.delete(investorId)
        toast('Removed from shortlist')
      } else {
        next.add(investorId)
        toast.success('Added to shortlist')
      }
      return next
    })
  }, [])

  // INTENT: Visible matches for free users are capped; paid see all
  const visibleMatches = isPaid ? matches : matches.slice(0, FREE_MATCH_LIMIT)
  const hiddenMatches = !isPaid && matches.length > FREE_MATCH_LIMIT ? matches.slice(FREE_MATCH_LIMIT) : []
  const isLoading = phase === 'scoring' || phase === 'scored' || phase === 'generating'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Investor Matches</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {phase === 'complete' && tierInfo
              ? `${matches.length} matches from ${tierInfo.totalScored} investors scored`
              : 'AI-matched investors based on your company profile'}
          </p>
        </div>

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
          {phase === 'idle' ? 'Find Matches' : 'Refresh Matches'}
        </Button>
      </div>

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

      {/* Profile incomplete gate */}
      {phase === 'incomplete_profile' && (
        <ProfileIncompleteCard missingFields={missingFields} />
      )}

      {/* Idle state */}
      {phase === 'idle' && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-international-orange/10 flex items-center justify-center mx-auto">
              <Sparkles className="h-6 w-6 text-international-orange" />
            </div>
            <p className="text-sm font-medium text-foreground">Ready to find your ideal investors</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Click &quot;Find Matches&quot; to score investors against your company profile and
              generate personalised outreach insights.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Match results */}
      {visibleMatches.length > 0 && (
        <div className="space-y-3">
          {visibleMatches.map((match) => (
            <MatchRow
              key={match.investor.id}
              match={match}
              isPaid={isPaid}
              isShortlisted={shortlisted.has(match.investor.id)}
              onToggleShortlist={handleToggleShortlist}
            />
          ))}
        </div>
      )}

      {/* Blurred upgrade section for free users */}
      {hiddenMatches.length > 0 && (
        <LockedSection
          title={`${hiddenMatches.length} more matches`}
          requiredTier="starter"
          featureDescription="Unlock all investor matches, partner contacts, and draft outreach emails."
        >
          {/* Placeholder rows rendered blurred behind the overlay */}
          <div className="space-y-3">
            {hiddenMatches.slice(0, 3).map((match) => (
              <div key={match.investor.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="space-y-1">
                    <div className="h-4 w-40 bg-muted rounded" />
                    <div className="h-3 w-64 bg-muted rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </LockedSection>
      )}

      {/* Tier info banner */}
      {phase === 'complete' && tierInfo && !isPaid && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground text-center">
              Showing {Math.min(matches.length, FREE_MATCH_LIMIT)} of {tierInfo.totalScored} scored
              investors.{' '}
              <Link href="/pricing" className="text-international-orange hover:underline font-medium">
                Upgrade for full access
              </Link>
            </p>
          </CardContent>
        </Card>
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
                    {nearMisses.map((match) => (
                      <div
                        key={match.investor.id}
                        className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                      >
                        <MatchScoreBadge score={match.matchScore} topFactors={match.topFactors} />
                        <span className="text-sm font-medium text-foreground">
                          {match.investor.name}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {match.investor.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex-1 truncate">
                          {match.rationale}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleShortlist(match.investor.id)}
                          aria-label={
                            shortlisted.has(match.investor.id)
                              ? 'Remove from shortlist'
                              : 'Add to shortlist'
                          }
                        >
                          <Heart
                            className={cn(
                              'h-3.5 w-3.5',
                              shortlisted.has(match.investor.id)
                                ? 'fill-international-orange text-international-orange'
                                : 'text-muted-foreground'
                            )}
                          />
                        </Button>
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
            <Button
              variant="secondary"
              size="sm"
              onClick={startMatching}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
