/**
 * @file SupplierMatchView.tsx
 *
 * @description Top-matched suppliers view powered by SSE streaming from /api/suppliers/match.
 * Shows a profile completeness gate, two-column match rows (supplier info + AI rationale),
 * tier-gated contact columns, near-miss section, save functionality, and CSV export.
 *
 * FLOW: POST /api/suppliers/match -> SSE phases (profile → scoring → scored → generating → batch → complete)
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
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Download,
  MapPin,
  Star,
  ShieldCheck,
  MessageSquare,
  FileText,
  Phone,
} from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { MatchScoreBadge } from '@/app/(platform)/investors/components/MatchScoreBadge'
import { LockedSection } from '@/app/(platform)/investors/components/LockedSection'
import { saveMarketplaceListing, unsaveMarketplaceListing } from '@/actions/marketplace'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichedSupplierMatch {
  supplier: {
    id: string
    name: string
    category: string
    subcategory: string
    description: string
    city: string | null
    country: string | null
    is_verified: boolean
    average_rating: number | null
    contact_email: string | null
    contact_name: string | null
    contact_phone: string | null
    contact_linkedin: string | null
  }
  matchScore: number
  topFactors: string[]
  rationale: string
}

interface NearMiss {
  name: string
  subcategory: string
  score: number
  reason: string
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

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function generateCsv(matches: EnrichedSupplierMatch[]): string {
  const headers = ['Rank', 'Name', 'Category', 'Subcategory', 'Score', 'Location', 'Rationale', 'Contact', 'Email']
  const rows = matches.map((m, i) => [
    String(i + 1),
    escapeCsvField(m.supplier.name),
    escapeCsvField(m.supplier.category),
    escapeCsvField(m.supplier.subcategory),
    String(m.matchScore),
    escapeCsvField([m.supplier.city, m.supplier.country].filter(Boolean).join(', ')),
    escapeCsvField(m.rationale),
    escapeCsvField(m.supplier.contact_name ?? ''),
    escapeCsvField(m.supplier.contact_email ?? ''),
  ])
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
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

/** Context-aware CTA label */
function ctaLabel(category: string): string {
  switch (category) {
    case 'Products': return 'Get Quote'
    case 'Services': return 'Book Consultation'
    case 'People': return 'Message'
    default: return 'Contact'
  }
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
          We need a few more details about your company to find the best supplier matches.
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

function SupplierMatchRow({
  match,
  isSaved,
  saveLoading,
  onToggleSave,
  isPaid,
}: {
  match: EnrichedSupplierMatch
  isSaved: boolean
  saveLoading: boolean
  onToggleSave: (id: string) => void
  isPaid: boolean
}) {
  const s = match.supplier
  const location = [s.city, s.country].filter(Boolean).join(', ')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="border border-border rounded-lg bg-card overflow-hidden"
    >
      <div className="flex flex-col lg:flex-row">
        {/* Left column: Supplier identity */}
        <div className="flex-1 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <MatchScoreBadge score={match.matchScore} topFactors={match.topFactors} size="md" />

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">{s.name}</span>
                {s.is_verified && (
                  <Badge variant="success" className="text-xs gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary" className="text-xs">{s.category}</Badge>
                {s.subcategory && (
                  <Badge variant="outline" className="text-xs">{s.subcategory}</Badge>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {location}
                  </span>
                )}
                {s.average_rating && s.average_rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-warning text-warning" />
                    {s.average_rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            {/* Save button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleSave(s.id)}
              disabled={saveLoading}
              className="shrink-0"
              aria-label={isSaved ? 'Remove from saved' : 'Save supplier'}
            >
              <Heart
                className={cn(
                  'h-4 w-4 transition-colors',
                  isSaved
                    ? 'fill-international-orange text-international-orange'
                    : 'text-muted-foreground'
                )}
              />
            </Button>
          </div>

          {/* Contact actions (paid only) */}
          {isPaid && (s.contact_email || s.contact_linkedin || s.contact_phone) && (
            <div className="flex items-center gap-2 pl-[52px]">
              {s.contact_email && (
                <Button variant="outline" size="sm" asChild className="text-xs gap-1.5">
                  <a href={`mailto:${s.contact_email}`}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    {ctaLabel(s.category)}
                  </a>
                </Button>
              )}
              {s.contact_linkedin && (
                <Button variant="ghost" size="sm" asChild className="text-xs gap-1">
                  <a href={s.contact_linkedin} target="_blank" rel="noopener noreferrer">
                    LinkedIn
                  </a>
                </Button>
              )}
              {s.contact_phone && (
                <Button variant="ghost" size="sm" asChild className="text-xs gap-1">
                  <a href={`tel:${s.contact_phone}`}>
                    <Phone className="h-3 w-3" />
                    Call
                  </a>
                </Button>
              )}
            </div>
          )}

          {/* Free users: generic CTA */}
          {!isPaid && (
            <div className="pl-[52px]">
              <Button variant="outline" size="sm" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {ctaLabel(s.category)}
              </Button>
            </div>
          )}
        </div>

        {/* Right column: Why they fit */}
        <div className="lg:w-[45%] p-4 lg:border-l border-t lg:border-t-0 border-border bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Why they fit your company
          </p>
          <p className="text-sm text-foreground leading-relaxed">{match.rationale}</p>

          {/* Top factors as tags */}
          <div className="flex items-center gap-1.5 flex-wrap mt-3">
            {match.topFactors.map(factor => (
              <Badge key={factor} variant="outline" className="text-xs text-muted-foreground">
                {factor}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SupplierMatchView() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [matches, setMatches] = useState<EnrichedSupplierMatch[]>([])
  const [nearMisses, setNearMisses] = useState<NearMiss[]>([])
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [progressText, setProgressText] = useState('')
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [saveLoading, setSaveLoading] = useState<Set<string>>(new Set())
  const [nearMissesOpen, setNearMissesOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const hasAutoRun = useRef(false)

  const isPaid = tierInfo ? tierInfo.tier !== 'free' : false
  const FREE_MATCH_LIMIT = 5

  const startMatching = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setPhase('scoring')
    setMatches([])
    setNearMisses([])
    setMissingFields([])
    setTierInfo(null)
    setProgressText('Connecting...')

    // INTENT: Force a session refresh before SSE to prevent stale token errors.
    try {
      const supabase = createBrowserClient()
      await supabase.auth.getSession()
    } catch (refreshErr) {
      console.warn('[SupplierMatch] Session refresh failed before SSE:', refreshErr)
    }

    try {
      const response = await fetch('/api/suppliers/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`Server returned ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
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
                setMissingFields(event.missing ?? [])
                break

              case 'scoring':
                setPhase('scoring')
                setProgressText('Scoring suppliers against your profile...')
                break

              case 'scored':
                setPhase('scored')
                setProgressText(
                  `Scored ${event.totalScored ?? 0} suppliers. Generating insights...`
                )
                if (event.nearMisses) setNearMisses(event.nearMisses)
                break

              case 'generating':
                setPhase('generating')
                setProgressText(
                  `Generating insights: batch ${event.batchNumber ?? '?'} of ${event.totalBatches ?? '?'}...`
                )
                break

              case 'batch': {
                setPhase('batch')
                const incoming = (event.matches ?? []) as EnrichedSupplierMatch[]
                setMatches(prev => [...prev, ...incoming])
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
            // Partial JSON from chunk boundary — skip
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

  // Auto-run on mount
  useEffect(() => {
    if (hasAutoRun.current) return
    hasAutoRun.current = true
    startMatching()
  }, [startMatching])

  const handleToggleSave = useCallback(async (supplierId: string) => {
    setSaveLoading(prev => new Set(prev).add(supplierId))

    try {
      const isCurrentlySaved = saved.has(supplierId)

      if (isCurrentlySaved) {
        const result = await unsaveMarketplaceListing(supplierId)
        if (result.error) {
          toast.error(result.error)
          return
        }
        setSaved(prev => {
          const next = new Set(prev)
          next.delete(supplierId)
          return next
        })
        toast('Removed from saved', { duration: 3000 })
      } else {
        const result = await saveMarketplaceListing(supplierId)
        if (result.error) {
          toast.error(result.error)
          return
        }
        setSaved(prev => {
          const next = new Set(prev)
          next.add(supplierId)
          return next
        })
        toast.success('Saved supplier', { duration: 3000 })
      }
    } catch {
      toast.error('Failed to update saved suppliers')
    } finally {
      setSaveLoading(prev => {
        const next = new Set(prev)
        next.delete(supplierId)
        return next
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  const handleExportCsv = useCallback(() => {
    if (matches.length === 0) return
    const csv = generateCsv(matches)
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `supplier-matches-${date}.csv`)
    toast.success(`Exported ${matches.length} matches to CSV`)
  }, [matches])

  const visibleMatches = isPaid ? matches : matches.slice(0, FREE_MATCH_LIMIT)
  const hiddenMatches = !isPaid && matches.length > FREE_MATCH_LIMIT ? matches.slice(FREE_MATCH_LIMIT) : []
  const isLoading = phase === 'scoring' || phase === 'scored' || phase === 'generating'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Supplier Matches</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {phase === 'complete' && tierInfo
              ? `${matches.length} matches from ${tierInfo.totalScored} suppliers scored`
              : 'Matched suppliers based on your company profile, projects, and gaps'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {matches.length > 0 && (
            <Button variant="secondary" size="sm" onClick={handleExportCsv}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          )}

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

      {/* Profile incomplete gate */}
      {phase === 'incomplete_profile' && (
        <ProfileIncompleteCard missingFields={missingFields} />
      )}

      {/* Match results */}
      {visibleMatches.length > 0 && (
        <div className="space-y-3">
          {visibleMatches.map(match => (
            <SupplierMatchRow
              key={match.supplier.id}
              match={match}
              isSaved={saved.has(match.supplier.id)}
              saveLoading={saveLoading.has(match.supplier.id)}
              onToggleSave={handleToggleSave}
              isPaid={isPaid}
            />
          ))}
        </div>
      )}

      {/* Blurred upgrade section for free users */}
      {hiddenMatches.length > 0 && (
        <LockedSection
          title={`${hiddenMatches.length} more matches`}
          requiredTier="starter"
          featureDescription="Unlock all supplier matches, contact details, and direct outreach."
        >
          <div className="space-y-3">
            {hiddenMatches.slice(0, 3).map(match => (
              <div key={match.supplier.id} className="border border-border rounded-lg p-4">
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
              suppliers.{' '}
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
                    {nearMisses.map(miss => (
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
                          {miss.subcategory}
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
