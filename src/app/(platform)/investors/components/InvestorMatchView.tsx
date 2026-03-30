/**
 * @file InvestorMatchView.tsx
 *
 * @description Top-matched investors view powered by SSE streaming from /api/investors/match.
 * Shows a profile completeness gate when needed, a responsive scored investor table,
 * tier-gated partner/email columns, near-miss section, shortlist functionality, and CSV export.
 *
 * FLOW: POST /api/investors/match -> SSE phases (scoring -> scored -> generating -> batch -> complete)
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  Download,
  Building2,
} from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { MatchScoreBadge } from './MatchScoreBadge'
import { LockedSection } from './LockedSection'
import { addToShortlist, removeFromShortlist } from '@/actions/investors'

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

/** Near misses come from SSE as a simpler shape than EnrichedMatch */
interface NearMiss {
  name: string
  type: string
  score: number
  reason: string
}

interface TierInfo {
  tier: string
  matchLimit: number
  totalScored: number
}

interface HiddenMatchSummary {
  count: number
  sectorMatchCount: number
  activeDeployingCount: number
  stageMatchCount: number
  avgScore: number
  topScore: number
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
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value}`
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function generateCsv(matches: EnrichedMatch[]): string {
  const headers = [
    'Rank',
    'Name',
    'Type',
    'Score',
    'Stage Focus',
    'Sectors',
    'Rationale',
    'Partner Name',
    'Partner Title',
    'Email Subject',
  ]
  const rows = matches.map((m, i) => [
    String(i + 1),
    escapeCsvField(m.investor.name),
    escapeCsvField(m.investor.type),
    String(m.matchScore),
    escapeCsvField(m.investor.stageFocus.join('; ')),
    escapeCsvField((Array.isArray(m.investor.sectors) ? m.investor.sectors : []).join('; ')),
    escapeCsvField(m.rationale),
    escapeCsvField(m.partner?.name ?? ''),
    escapeCsvField(m.partner?.title ?? ''),
    escapeCsvField(m.draftEmail?.subject ?? ''),
  ])
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
  isPro,
  isPaid,
  isShortlisted,
  shortlistLoading,
  onToggleShortlist,
}: {
  match: EnrichedMatch
  isPro: boolean
  isPaid: boolean
  isShortlisted: boolean
  shortlistLoading: boolean
  onToggleShortlist: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopyEmail = useCallback(() => {
    if (!match.draftEmail) return
    const text = `Subject: ${match.draftEmail.subject}\n\n${match.draftEmail.body}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [match.draftEmail])

  // DECISION: Pro users see draft email inline (no expand/collapse). Free/Starter use expand.
  const showEmailInline = isPro && match.draftEmail
  const [emailExpanded, setEmailExpanded] = useState(false)

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
          disabled={shortlistLoading}
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
      {isPaid && (
        <div className="pl-[52px] space-y-2">
          {match.partner ? (
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
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Partner data not yet available for this firm
            </p>
          )}

          {/* Pro: show email inline; Free/Starter: expand/collapse */}
          {showEmailInline && match.draftEmail && (
            <div className="border border-border rounded-md bg-muted/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
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
          )}

          {/* Non-Pro paid: expand/collapse for draft email */}
          {!isPro && match.draftEmail && (
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
  const [nearMisses, setNearMisses] = useState<NearMiss[]>([])
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [hiddenSummary, setHiddenSummary] = useState<HiddenMatchSummary | null>(null)
  const [progressText, setProgressText] = useState('')
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set())
  const [shortlistLoading, setShortlistLoading] = useState<Set<string>>(new Set())
  const [nearMissesOpen, setNearMissesOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const hasAutoRun = useRef(false)

  // INTENT: Determine paid status from tier info to gate partner/email column
  const isPaid = tierInfo ? tierInfo.tier !== 'free' : false
  const isPro = tierInfo ? (tierInfo.tier === 'professional' || tierInfo.tier === 'enterprise') : false
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

    // INTENT: Force a full session refresh (not just getSession which reads cache)
    // before SSE to prevent stale token errors. The TypeError: Failed to fetch
    // in _useSession/_getUser was caused by expired access tokens during SSE streaming.
    try {
      const supabase = createBrowserClient()
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) console.warn('[InvestorMatch] Pre-SSE session refresh failed:', refreshError.message)
    } catch (refreshErr) {
      console.warn('[InvestorMatch] Session refresh exception before SSE:', refreshErr)
    }

    // DECISION: Retry once on auth/fetch failure after forcing a fresh session
    const MAX_RETRIES = 1
    let lastError: unknown = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // On retry, force another session refresh
        try {
          const supabase = createBrowserClient()
          const { error } = await supabase.auth.refreshSession()
          if (error) console.warn('[InvestorMatch] Retry session refresh failed:', error.message)
        } catch { /* continue with retry anyway */ }
        setProgressText('Retrying...')
      }

      try {
        lastError = null
        const response = await fetch('/api/investors/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
        })

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`)
      }

      // INTENT: If the route returns cached JSON instead of SSE stream,
      // parse it directly and skip the streaming flow.
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const cached = await response.json()
        if (cached.cached && cached.matches) {
          setMatches(cached.matches as EnrichedMatch[])
          setNearMisses((cached.nearMisses || []) as NearMiss[])
          setTierInfo({ tier: cached.tier || 'free', matchLimit: 50, totalScored: cached.totalScored || 0 })
          setPhase('complete')
          setProgressText('')
          return
        }
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
                setProgressText(`Scoring ${event.total ?? ''} investors...`)
                break

              case 'scored':
                // INTENT: Route sends event.totalScored in the scored phase
                setPhase('scored')
                setProgressText(
                  `Scored ${event.totalScored ?? event.total ?? 0} investors. Generating insights...`
                )
                break

              case 'generating': {
                // INTENT: Route sends event.batchNumber and event.totalBatches in generating phase
                setPhase('generating')
                const batch = event.batchNumber ?? event.batch ?? 1
                const total = event.totalBatches ?? 1
                if (total <= 1) {
                  setProgressText('Finding your best investor matches...')
                } else {
                  setProgressText(`Analysing matches: ${batch} of ${total}...`)
                }
                break
              }

              case 'batch': {
                setPhase('batch')
                const incoming = (event.matches ?? []) as EnrichedMatch[]
                setMatches((prev) => [...prev, ...incoming])
                break
              }

              case 'near_misses': {
                // INTENT: Near misses come as { name, type, score, reason } not EnrichedMatch
                const incoming = (event.matches ?? []) as NearMiss[]
                setNearMisses((prev) => [...prev, ...incoming])
                break
              }

              case 'complete':
                setPhase('complete')
                if (event.tierInfo) setTierInfo(event.tierInfo as TierInfo)
                if (event.hiddenMatchSummary) setHiddenSummary(event.hiddenMatchSummary as HiddenMatchSummary)
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
      lastError = err
      // If we have retries left, continue the loop
      if (attempt < MAX_RETRIES) {
        console.warn(`[InvestorMatch] Attempt ${attempt + 1} failed, retrying...`, err instanceof Error ? err.message : err)
        continue
      }
      setPhase('error')
      const message = err instanceof Error ? err.message : 'Failed to connect'
      toast.error(message)
    }
    // If we got here without error (or handled it), break out of retry loop
    if (!lastError) break
    }

    // If all retries exhausted with errors
    if (lastError && !(lastError instanceof DOMException)) {
      setPhase('error')
      const message = lastError instanceof Error ? lastError.message : 'Failed to connect after retry'
      toast.error(message)
    }
  }, [])

  // INTENT: Auto-run matching on mount so user sees results immediately
  useEffect(() => {
    if (hasAutoRun.current) return
    hasAutoRun.current = true
    startMatching()
  }, [startMatching])

  const handleToggleShortlist = useCallback(async (investorId: string) => {
    setShortlistLoading((prev) => new Set(prev).add(investorId))

    try {
      const isCurrentlyShortlisted = shortlisted.has(investorId)

      if (isCurrentlyShortlisted) {
        const result = await removeFromShortlist(investorId)
        if (result.error) {
          toast.error(result.error)
          return
        }
        setShortlisted((prev) => {
          const next = new Set(prev)
          next.delete(investorId)
          return next
        })
        toast('Removed from shortlist')
      } else {
        const result = await addToShortlist(investorId, 'researching')
        if (result.error) {
          toast.error(result.error)
          return
        }
        setShortlisted((prev) => {
          const next = new Set(prev)
          next.add(investorId)
          return next
        })
        toast.success('Added to shortlist')
      }
    } catch {
      toast.error('Failed to update shortlist')
    } finally {
      setShortlistLoading((prev) => {
        const next = new Set(prev)
        next.delete(investorId)
        return next
      })
    }
  // GOTCHA: shortlisted is read inside the callback but we deliberately capture it
  // via closure so the toggle checks current state at call time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortlisted])

  const handleExportCsv = useCallback(() => {
    if (matches.length === 0) return
    const csv = generateCsv(matches)
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `investor-matches-${date}.csv`)
    toast.success(`Exported ${matches.length} matches to CSV`)
  }, [matches])

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
              : 'Matched investors based on your company profile'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* CSV export */}
          {matches.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          )}

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
            Refresh Matches
          </Button>
        </div>
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
                Tell us about your company so we can find the best investors for you. You can still browse all investors in the meantime.
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

      {/* Match results */}
      {visibleMatches.length > 0 && (
        <div className="space-y-3">
          {visibleMatches.map((match) => (
            <MatchRow
              key={match.investor.id}
              match={match}
              isPro={isPro}
              isPaid={isPaid}
              isShortlisted={shortlisted.has(match.investor.id)}
              shortlistLoading={shortlistLoading.has(match.investor.id)}
              onToggleShortlist={handleToggleShortlist}
            />
          ))}
        </div>
      )}

      {/* Blurred upgrade section for free users */}
      {hiddenMatches.length > 0 && (
        <LockedSection
          title={`${hiddenSummary?.count ?? hiddenMatches.length} more matches found`}
          requiredTier="starter"
          currentTier={tierInfo?.tier}
          featureDescription="Unlock all investor matches, partner contacts, and draft outreach emails."
          upgradeDetails={hiddenSummary ? (
            <div className="space-y-1.5 text-left mb-3">
              {hiddenSummary.sectorMatchCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{hiddenSummary.sectorMatchCount}</span> investing in your sector
                </p>
              )}
              {hiddenSummary.activeDeployingCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{hiddenSummary.activeDeployingCount}</span> actively deploying capital
                </p>
              )}
              {hiddenSummary.stageMatchCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{hiddenSummary.stageMatchCount}</span> targeting your stage
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Avg match score: <span className="font-semibold text-foreground">{hiddenSummary.avgScore}</span>/100
              </p>
            </div>
          ) : undefined}
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
                    {nearMisses.map((miss) => (
                      <div
                        key={miss.name}
                        className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                      >
                        <span className="text-xs font-bold text-muted-foreground tabular-nums w-8 text-right shrink-0">
                          {miss.score}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {miss.name}
                        </span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {miss.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex-1 truncate">
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
