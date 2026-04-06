/**
 * @file InvestorDetailDialog.tsx
 *
 * @description Modal overlay for viewing investor firm details without navigating
 * away from the directory. Fetches firm data and contacts on open, shows a
 * scrollable dialog with all available intelligence sections.
 *
 * @usage
 * ```tsx
 * <InvestorDetailDialog
 *   firmId={selectedFirmId}
 *   open={!!selectedFirmId}
 *   onOpenChange={(open) => !open && setSelectedFirmId(null)}
 * />
 * ```
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatFundSize } from '@/lib/format'
import {
  getInvestorById,
  getInvestorContacts,
} from '@/actions/investors'
import type { InvestorFirm, InvestorContact } from '@/actions/investors'
import {
  ExternalLink,
  Globe,
  Linkedin,
  Mail,
  X,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InvestorDetailDialogProps {
  /** The marketplace_listings ID of the investor firm to display */
  firmId: string | null
  /** Controls dialog visibility */
  open: boolean
  /** Called when the dialog requests to close */
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a semantic color class for the data quality dot indicator.
 *
 * @param score - Data quality score (0-10)
 * @returns Tailwind class for the dot background
 */
function qualityDotClass(score: number | undefined): string {
  if (score == null) return 'bg-muted-foreground'
  if (score >= 9) return 'bg-success'
  if (score >= 7) return 'bg-warning'
  return 'bg-muted-foreground'
}

/**
 * Formats a cheque range into a readable string.
 */
function formatChequeRange(range: { min: number | null; max: number | null } | undefined): string | null {
  if (!range) return null
  const min = formatFundSize(range.min)
  const max = formatFundSize(range.max)
  if (!min && !max) return null
  return `${min ?? '?'} - ${max ?? '?'}`
}

/**
 * Ensures a URL has a protocol prefix. Blocks non-http(s) schemes.
 *
 * @param url - Raw URL string
 * @returns Safe URL with https:// prefix, or empty string for unsafe schemes
 */
function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  // SECURITY: Block non-http(s) schemes (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''
  return `https://${url}`
}

/**
 * Formats a date string for display. Returns null if unparseable.
 */
function formatDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Section Components
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-international-orange border-b border-border pb-1 mb-2">
      {children}
    </h3>
  )
}

function TextSection({ title, content }: { title: string; content: string | undefined }) {
  if (!content) return null
  return (
    <div>
      <SectionHeading>{title}</SectionHeading>
      <p className="text-sm text-foreground whitespace-pre-line">{content}</p>
    </div>
  )
}

function ContactCard({ contact }: { contact: InvestorContact }) {
  const dotClass = contact.email_verified ? 'bg-success' : 'bg-muted-foreground'
  const linkedinUrl = contact.linkedin_url ? ensureProtocol(contact.linkedin_url) : null

  return (
    <div className="bg-muted rounded-lg p-3 mb-2">
      <div className="flex items-start gap-2">
        <span className={cn('inline-block h-2 w-2 rounded-full shrink-0 mt-1.5', dotClass)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {linkedinUrl ? (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-foreground hover:text-international-orange transition-colors"
              >
                {contact.full_name}
              </a>
            ) : (
              <span className="text-sm font-semibold text-foreground">{contact.full_name}</span>
            )}
            {contact.is_decision_maker && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">DM</Badge>
            )}
          </div>
          {contact.title && (
            <p className="text-xs text-muted-foreground mt-0.5">{contact.title}</p>
          )}
          {contact.deep_bio && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{contact.deep_bio}</p>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1 text-xs text-international-orange hover:underline mt-1"
            >
              <Mail className="h-3 w-3" />
              {contact.email}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
      {/* Section skeletons */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
      {/* Partner cards skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Modal dialog that displays full investor firm details. Fetches data on open
 * and shows a loading skeleton while requests are in flight.
 *
 * @param props.firmId - The investor firm ID to fetch and display
 * @param props.open - Whether the dialog is visible
 * @param props.onOpenChange - Callback when dialog open state changes
 */
export function InvestorDetailDialog({ firmId, open, onOpenChange }: InvestorDetailDialogProps) {
  const [firm, setFirm] = useState<InvestorFirm | null>(null)
  const [contacts, setContacts] = useState<InvestorContact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    setFirm(null)
    setContacts([])

    try {
      const [firmResult, contactsResult] = await Promise.all([
        getInvestorById(id),
        getInvestorContacts(id),
      ])

      if (!firmResult.firm) {
        setError('Investor not found.')
        return
      }

      setFirm(firmResult.firm)
      setContacts(contactsResult.contacts)
    } catch (err) {
      console.error('[InvestorDetailDialog] Failed to fetch investor:', err)
      setError('Failed to load investor details.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && firmId) {
      fetchData(firmId)
    }
    if (!open) {
      // INTENT: Reset state when dialog closes so stale data doesn't flash on next open
      setFirm(null)
      setContacts([])
      setError(null)
    }
  }, [open, firmId, fetchData])

  const attrs = firm?.attributes
  const fundSizeLabel = formatFundSize(attrs?.fund_size_gbp)
  const chequeLabel = formatChequeRange(attrs?.cheque_range_gbp)
  const portfolioCompanies = attrs?.portfolio_companies ?? []
  const stages = attrs?.stage_focus ?? []
  const sectors = attrs?.sectors ?? []
  const geoFocus = attrs?.geo_focus ?? []

  const websiteUrl = attrs?.website_url ? ensureProtocol(attrs.website_url) : null
  const linkedinUrl = attrs?.linkedin_company_url ? ensureProtocol(attrs.linkedin_company_url) : null

  const lastVerified = formatDate(attrs?.last_verified)
  const lastSynced = formatDate(attrs?.last_synced)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          {loading ? (
            <Skeleton className="h-7 w-2/3" />
          ) : error ? (
            <DialogTitle className="text-destructive">{error}</DialogTitle>
          ) : firm ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-block h-2.5 w-2.5 rounded-full shrink-0',
                    qualityDotClass(attrs?.data_quality_score)
                  )}
                />
                <DialogTitle className="text-xl font-bold text-foreground">
                  {firm.title}
                </DialogTitle>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {attrs?.firm_type && (
                  <Badge variant="outline">{attrs.firm_type}</Badge>
                )}
                {fundSizeLabel && (
                  <Badge variant="secondary">{fundSizeLabel}</Badge>
                )}
                {attrs?.data_quality_score != null && (
                  <span className="text-xs text-muted-foreground">
                    Quality: {attrs.data_quality_score.toFixed(1)}/10
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </DialogHeader>

        {loading && <LoadingSkeleton />}

        {error && !loading && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {error}
          </p>
        )}

        {firm && !loading && (
          <div className="space-y-6 mt-2">
            {/* Thesis */}
            <TextSection title="Thesis" content={attrs?.investment_thesis} />

            {/* Investment Pattern */}
            <TextSection title="Investment Pattern" content={attrs?.investment_pattern} />

            {/* Team Expertise */}
            <TextSection title="Team Expertise" content={attrs?.team_expertise} />

            {/* Connection Brief */}
            <TextSection title="Connection Brief" content={attrs?.connection_brief} />

            {/* Value Add */}
            <TextSection title="Value Add" content={attrs?.value_add} />

            {/* Ideal Company Profile */}
            <TextSection title="Ideal Company Profile" content={attrs?.ideal_company_profile} />

            {/* Partners */}
            {contacts.length > 0 && (
              <div>
                <SectionHeading>Partners ({contacts.length})</SectionHeading>
                {contacts.map((contact) => (
                  <ContactCard key={contact.id} contact={contact} />
                ))}
              </div>
            )}

            {/* Portfolio */}
            {portfolioCompanies.length > 0 && (
              <div>
                <SectionHeading>Portfolio ({portfolioCompanies.length})</SectionHeading>
                <ul className="space-y-1.5">
                  {portfolioCompanies.map((pc, idx) => (
                    <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                      <span className="text-muted-foreground mt-1.5 shrink-0">&#8226;</span>
                      <span>
                        <span className="font-semibold">{pc.company_name}</span>
                        {pc.sector && (
                          <span className="text-muted-foreground"> &mdash; {pc.sector}</span>
                        )}
                        {pc.description && (
                          <span className="text-muted-foreground"> &mdash; {pc.description}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fund Details */}
            {(fundSizeLabel || chequeLabel || stages.length > 0 || sectors.length > 0 || geoFocus.length > 0 || attrs?.firm_type) && (
              <div>
                <SectionHeading>Fund Details</SectionHeading>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {fundSizeLabel && (
                    <div>
                      <span className="text-muted-foreground">Size</span>
                      <p className="font-medium text-foreground">{fundSizeLabel}</p>
                    </div>
                  )}
                  {chequeLabel && (
                    <div>
                      <span className="text-muted-foreground">Cheque Size</span>
                      <p className="font-medium text-foreground">{chequeLabel}</p>
                    </div>
                  )}
                  {stages.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Stage</span>
                      <p className="font-medium text-foreground">{stages.join(', ')}</p>
                    </div>
                  )}
                  {sectors.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Sectors</span>
                      <p className="font-medium text-foreground">{sectors.join(', ')}</p>
                    </div>
                  )}
                  {geoFocus.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Geography</span>
                      <p className="font-medium text-foreground">{geoFocus.join(', ')}</p>
                    </div>
                  )}
                  {attrs?.firm_type && (
                    <div>
                      <span className="text-muted-foreground">Entity Type</span>
                      <p className="font-medium text-foreground">{attrs.firm_type}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Links */}
            {(websiteUrl || linkedinUrl) && (
              <div>
                <SectionHeading>Links</SectionHeading>
                <div className="flex items-center gap-3">
                  {websiteUrl && (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-international-orange hover:underline transition-colors"
                    >
                      <Globe className="h-4 w-4" />
                      Website
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {linkedinUrl && (
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-international-orange hover:underline transition-colors"
                    >
                      <Linkedin className="h-4 w-4" />
                      LinkedIn
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Footer metadata */}
            {(lastVerified || lastSynced) && (
              <div className="border-t border-border pt-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  {lastVerified && <span>Website verified: {lastVerified}</span>}
                  {lastVerified && lastSynced && <span> &middot; </span>}
                  {lastSynced && <span>Intel synthesised: {lastSynced}</span>}
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
