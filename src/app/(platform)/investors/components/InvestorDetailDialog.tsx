/**
 * @file InvestorDetailDialog.tsx
 *
 * @description Modal overlay for viewing investor firm details with drill-down
 * navigation to partners and portfolio companies (matching Forge Capital
 * dashboard's modal pattern with breadcrumb navigation).
 *
 * Views: Investor → Partner detail | Portfolio company detail
 * Breadcrumbs: FirmName > PartnerName | FirmName > CompanyName
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
import { getInvestorIntel, generateInvestorIntel } from '@/actions/investor-intel'
import type { InvestorIntel } from '@/actions/investor-intel'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  ExternalLink,
  Globe,
  Linkedin,
  Mail,
  Newspaper,
  RefreshCw,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvestorDetailDialogProps {
  firmId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type DialogView =
  | { type: 'investor' }
  | { type: 'partner'; contact: InvestorContact }
  | { type: 'portfolio'; company: NonNullable<InvestorFirm['attributes']['portfolio_companies']>[number] }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qualityDotClass(score: number | undefined): string {
  if (score == null) return 'bg-muted-foreground'
  if (score >= 7) return 'bg-success'
  if (score >= 4) return 'bg-warning'
  return 'bg-muted-foreground'
}

function formatChequeRange(range: { min: number | null; max: number | null } | undefined): string | null {
  if (!range) return null
  const min = range.min ? formatFundSize(range.min) : null
  const max = range.max ? formatFundSize(range.max) : null
  if (!min && !max) return null
  return `${min ?? '?'} – ${max ?? '?'}`
}

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''
  return `https://${url}`
}

function formatDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return null }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-sm font-semibold text-international-orange border-b border-border pb-1 mb-2", className)}>
      {children}
    </h3>
  )
}

function TextSection({ title, content }: { title: string; content: string | undefined }) {
  if (!content) return null
  return (
    <div>
      <SectionHeading>{title}</SectionHeading>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{content}</p>
    </div>
  )
}

function Breadcrumb({ firmName, current, onBack }: { firmName: string; current: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-1 text-xs mb-3 flex-wrap">
      <button onClick={onBack} className="text-international-orange hover:underline cursor-pointer">
        {firmName}
      </button>
      <span className="text-muted-foreground">›</span>
      <span className="text-foreground font-medium">{current}</span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Partner Detail View
// ---------------------------------------------------------------------------

function PartnerDetailView({
  contact,
  firmName,
  allContacts,
  portfolioCompanies,
  onBack,
  onSelectPartner,
  onSelectCompany,
}: {
  contact: InvestorContact
  firmName: string
  allContacts: InvestorContact[]
  portfolioCompanies: NonNullable<InvestorFirm['attributes']['portfolio_companies']>
  onBack: () => void
  onSelectPartner: (c: InvestorContact) => void
  onSelectCompany: (c: NonNullable<InvestorFirm['attributes']['portfolio_companies']>[number]) => void
}) {
  const linkedinUrl = contact.linkedin_url ? ensureProtocol(contact.linkedin_url) : null
  const otherPartners = allContacts.filter(c => c.id !== contact.id)

  return (
    <div className="space-y-5">
      <Breadcrumb firmName={firmName} current={contact.full_name} onBack={onBack} />

      <div>
        <div className="flex items-center gap-2">
          <span className={cn('inline-block h-2.5 w-2.5 rounded-full', contact.email_verified ? 'bg-success' : 'bg-muted-foreground')} />
          <h2 className="text-xl font-bold text-foreground">{contact.full_name}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {contact.title && <span>{contact.title}</span>}
          {contact.seniority && <span> ({contact.seniority})</span>}
        </p>
      </div>

      {/* Biography */}
      {contact.deep_bio && (
        <div>
          <SectionHeading>Biography</SectionHeading>
          <p className="text-sm text-foreground leading-relaxed">{contact.deep_bio}</p>
        </div>
      )}

      {/* Contact Info */}
      {(contact.email || linkedinUrl) && (
        <div>
          <SectionHeading>Contact</SectionHeading>
          <div className="space-y-1">
            {contact.email && (
              <p className="text-sm">
                <span className="text-muted-foreground">Email:</span>{' '}
                <a href={`mailto:${contact.email}`} className="text-international-orange hover:underline">{contact.email}</a>
              </p>
            )}
            {linkedinUrl && (
              <p className="text-sm">
                <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-international-orange hover:underline">
                  <Linkedin className="h-3.5 w-3.5" /> LinkedIn <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Other Partners at this firm */}
      {otherPartners.length > 0 && (
        <div>
          <SectionHeading>Other Partners at {firmName} ({otherPartners.length})</SectionHeading>
          {otherPartners.map(p => (
            <div key={p.id} className="bg-muted rounded-lg p-3 mb-2">
              <button onClick={() => onSelectPartner(p)} className="text-sm font-semibold text-international-orange hover:underline text-left">
                {p.full_name}
              </button>
              {p.title && <p className="text-xs text-muted-foreground">{p.title}</p>}
              {p.deep_bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.deep_bio}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Investor's Portfolio */}
      {portfolioCompanies.length > 0 && (
        <div>
          <SectionHeading>Investor&apos;s Portfolio ({portfolioCompanies.length})</SectionHeading>
          <ul className="space-y-1">
            {portfolioCompanies.map((pc, i) => (
              <li key={i} className="text-sm">
                <button onClick={() => onSelectCompany(pc)} className="text-international-orange hover:underline font-medium text-left">
                  {pc.company_name}
                </button>
                {pc.sector && <span className="text-muted-foreground"> ({pc.sector})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Portfolio Company Detail View
// ---------------------------------------------------------------------------

function PortfolioCompanyDetailView({
  company,
  firmName,
  allPortfolio,
  onBack,
  onSelectCompany,
}: {
  company: NonNullable<InvestorFirm['attributes']['portfolio_companies']>[number]
  firmName: string
  allPortfolio: NonNullable<InvestorFirm['attributes']['portfolio_companies']>
  onBack: () => void
  onSelectCompany: (c: NonNullable<InvestorFirm['attributes']['portfolio_companies']>[number]) => void
}) {
  const others = allPortfolio.filter(p => p.company_name !== company.company_name)

  return (
    <div className="space-y-5">
      <Breadcrumb firmName={firmName} current={company.company_name} onBack={onBack} />

      <div>
        <h2 className="text-xl font-bold text-foreground">{company.company_name}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {firmName}
          {company.sector && <span> · Sector: {company.sector}</span>}
          {company.stage && <span> · Stage: {company.stage}</span>}
        </p>
      </div>

      {/* Overview */}
      {(company.description || company.why_appealing) && (
        <div>
          <SectionHeading>Overview</SectionHeading>
          {company.description && <p className="text-sm text-foreground leading-relaxed">{company.description}</p>}
          {company.why_appealing && (
            <p className="text-sm text-foreground leading-relaxed mt-2 italic">{company.why_appealing}</p>
          )}
        </div>
      )}

      {/* Investment Details */}
      <div>
        <SectionHeading>Investment Details</SectionHeading>
        <ul className="text-sm space-y-1">
          <li><span className="font-medium">Amount:</span> {company.amount_usd ? `$${company.amount_usd.toLocaleString()}` : 'Not disclosed'}</li>
          <li><span className="font-medium">Sector:</span> {company.sector || 'Unknown'}</li>
          <li><span className="font-medium">Stage:</span> {company.stage || 'N/A'}</li>
        </ul>
      </div>

      {/* Other Investments by this firm */}
      {others.length > 0 && (
        <div>
          <SectionHeading>Other Investments by {firmName} ({others.length})</SectionHeading>
          <ul className="space-y-1">
            {others.map((pc, i) => (
              <li key={i} className="text-sm">
                <button onClick={() => onSelectCompany(pc)} className="text-international-orange hover:underline font-medium text-left">
                  {pc.company_name}
                </button>
                {pc.sector && <span className="text-muted-foreground"> ({pc.sector})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Investor View
// ---------------------------------------------------------------------------

function InvestorMainView({
  firm,
  contacts,
  onSelectPartner,
  onSelectCompany,
}: {
  firm: InvestorFirm
  contacts: InvestorContact[]
  onSelectPartner: (c: InvestorContact) => void
  onSelectCompany: (c: NonNullable<InvestorFirm['attributes']['portfolio_companies']>[number]) => void
}) {
  const attrs = firm.attributes
  const fundSizeLabel = formatFundSize(attrs.fund_size_gbp)
  const chequeLabel = formatChequeRange(attrs.cheque_range_gbp)
  const portfolioCompanies = attrs.portfolio_companies ?? []
  const stages = attrs.stage_focus ?? []
  const sectors = attrs.sectors ?? []
  const geoFocus = attrs.geo_focus ?? []
  const websiteUrl = attrs.website_url ? ensureProtocol(attrs.website_url) : null
  const linkedinUrl = attrs.linkedin_company_url ? ensureProtocol(attrs.linkedin_company_url) : null
  const lastVerified = formatDate(attrs.last_verified)
  const lastSynced = formatDate(attrs.last_synced)

  return (
    <div className="space-y-5">
      {/* News Intelligence section — live web-searched data */}
      <InvestorIntelSection firmId={firm.id} />

      <TextSection title="Thesis" content={attrs.investment_thesis} />
      <TextSection title="Investment Pattern" content={attrs.investment_pattern} />
      <TextSection title="Team Expertise" content={attrs.team_expertise} />
      <TextSection title="Connection Brief" content={attrs.connection_brief} />
      <TextSection title="Value Add" content={attrs.value_add} />
      <TextSection title="Ideal Company Profile" content={attrs.ideal_company_profile} />

      {/* Partners — clickable for drill-down */}
      {contacts.length > 0 && (
        <div>
          <SectionHeading>Partners ({contacts.length})</SectionHeading>
          {contacts.map((contact) => (
            <div key={contact.id} className="bg-muted rounded-lg p-3 mb-2">
              <div className="flex items-start gap-2">
                <span className={cn('inline-block h-2 w-2 rounded-full shrink-0 mt-1.5', contact.email_verified ? 'bg-success' : 'bg-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => onSelectPartner(contact)} className="text-sm font-semibold text-international-orange hover:underline text-left">
                      {contact.full_name}
                    </button>
                    {contact.is_decision_maker && <Badge variant="outline" className="text-[10px] px-1.5 py-0">DM</Badge>}
                  </div>
                  {contact.title && <p className="text-xs text-muted-foreground mt-0.5">{contact.title}</p>}
                  {contact.deep_bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{contact.deep_bio}</p>}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-xs text-international-orange hover:underline mt-1">
                      <Mail className="h-3 w-3" /> {contact.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Portfolio — clickable for drill-down */}
      {portfolioCompanies.length > 0 && (
        <div>
          <SectionHeading>Portfolio ({portfolioCompanies.length})</SectionHeading>
          <ul className="space-y-1">
            {portfolioCompanies.map((pc, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
                <span>
                  <button onClick={() => onSelectCompany(pc)} className="text-international-orange hover:underline font-semibold text-left">
                    {pc.company_name}
                  </button>
                  {pc.sector && <span className="text-muted-foreground"> ({pc.sector})</span>}
                  {pc.description && <span className="text-muted-foreground"> — {pc.description}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fund Details */}
      {(fundSizeLabel || chequeLabel || stages.length > 0 || sectors.length > 0 || geoFocus.length > 0 || attrs.firm_type) && (
        <div>
          <SectionHeading>Fund Details</SectionHeading>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {fundSizeLabel && <div><span className="text-muted-foreground">Size:</span> <span className="font-medium">{fundSizeLabel}</span></div>}
            {chequeLabel && <div><span className="text-muted-foreground">Cheque Size:</span> <span className="font-medium">{chequeLabel}</span></div>}
            {stages.length > 0 && <div><span className="text-muted-foreground">Stage:</span> <span className="font-medium">{stages.join(', ')}</span></div>}
            {sectors.length > 0 && <div className="col-span-2"><span className="text-muted-foreground">Sectors:</span> <span className="font-medium">{sectors.join(', ')}</span></div>}
            {geoFocus.length > 0 && <div><span className="text-muted-foreground">Geography:</span> <span className="font-medium">{geoFocus.join(', ')}</span></div>}
            {attrs.firm_type && <div><span className="text-muted-foreground">Entity Type:</span> <span className="font-medium">{attrs.firm_type}</span></div>}
          </div>
        </div>
      )}

      {/* Links */}
      {(websiteUrl || linkedinUrl) && (
        <div>
          <SectionHeading>Links</SectionHeading>
          <div className="flex items-center gap-4">
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-international-orange hover:underline">
                <Globe className="h-4 w-4" /> Website <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {linkedinUrl && (
              <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-international-orange hover:underline">
                <Linkedin className="h-4 w-4" /> LinkedIn <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      {(lastVerified || lastSynced) && (
        <div className="border-t border-border pt-3 mt-4">
          <p className="text-xs text-muted-foreground">
            {lastVerified && <span>Website verified: {lastVerified}</span>}
            {lastVerified && lastSynced && <span> · </span>}
            {lastSynced && <span>Intel synthesised: {lastSynced}</span>}
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InvestorDetailDialog({ firmId, open, onOpenChange }: InvestorDetailDialogProps) {
  const [firm, setFirm] = useState<InvestorFirm | null>(null)
  const [contacts, setContacts] = useState<InvestorContact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<DialogView>({ type: 'investor' })

  const fetchData = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    setFirm(null)
    setContacts([])
    setView({ type: 'investor' })

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
      console.error('[InvestorDetailDialog] Failed to fetch:', err)
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
      setFirm(null)
      setContacts([])
      setError(null)
      setView({ type: 'investor' })
    }
  }, [open, firmId, fetchData])

  const attrs = firm?.attributes
  const portfolioCompanies = attrs?.portfolio_companies ?? []

  // Derive the dialog title from current view
  let dialogTitle = ''
  if (view.type === 'investor' && firm) {
    dialogTitle = firm.title
  } else if (view.type === 'partner') {
    dialogTitle = view.contact.full_name
  } else if (view.type === 'portfolio') {
    dialogTitle = view.company.company_name
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          {loading ? (
            <Skeleton className="h-7 w-2/3" />
          ) : error ? (
            <DialogTitle className="text-destructive">{error}</DialogTitle>
          ) : firm && view.type === 'investor' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', qualityDotClass(attrs?.data_quality_score))} />
                <DialogTitle className="text-xl font-bold text-foreground">{firm.title}</DialogTitle>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {attrs?.firm_type && <Badge variant="outline">{attrs.firm_type}</Badge>}
                {attrs?.fund_size_gbp && <Badge variant="secondary">{formatFundSize(attrs.fund_size_gbp)}</Badge>}
                {attrs?.data_quality_score != null && (
                  <span className="text-xs text-muted-foreground">Quality: {attrs.data_quality_score.toFixed(1)}/10</span>
                )}
              </div>
            </div>
          ) : (view.type === 'partner' || view.type === 'portfolio') ? (
            <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
          ) : null}
        </DialogHeader>

        {loading && <LoadingSkeleton />}

        {error && !loading && (
          <p className="text-sm text-muted-foreground py-8 text-center">{error}</p>
        )}

        {firm && !loading && view.type === 'investor' && (
          <InvestorMainView
            firm={firm}
            contacts={contacts}
            onSelectPartner={(c) => setView({ type: 'partner', contact: c })}
            onSelectCompany={(c) => setView({ type: 'portfolio', company: c })}
          />
        )}

        {firm && !loading && view.type === 'partner' && (
          <PartnerDetailView
            contact={view.contact}
            firmName={firm.title}
            allContacts={contacts}
            portfolioCompanies={portfolioCompanies}
            onBack={() => setView({ type: 'investor' })}
            onSelectPartner={(c) => setView({ type: 'partner', contact: c })}
            onSelectCompany={(c) => setView({ type: 'portfolio', company: c })}
          />
        )}

        {firm && !loading && view.type === 'portfolio' && (
          <PortfolioCompanyDetailView
            company={view.company}
            firmName={firm.title}
            allPortfolio={portfolioCompanies}
            onBack={() => setView({ type: 'investor' })}
            onSelectCompany={(c) => setView({ type: 'portfolio', company: c })}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// News Intel Section
// ---------------------------------------------------------------------------

function InvestorIntelSection({ firmId }: { firmId: string }) {
  const [intel, setIntel] = useState<InvestorIntel | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getInvestorIntel(firmId)
      .then(data => { if (!cancelled) setIntel(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [firmId])

  const handleGenerate = async (forceRefresh = false) => {
    setGenerating(true)
    try {
      const result = await generateInvestorIntel(firmId, forceRefresh)
      if (result) {
        setIntel(result)
      } else {
        toast.error('Could not generate intelligence — try again later')
      }
    } catch {
      toast.error('Failed to generate intelligence')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <SectionHeading>News Intelligence</SectionHeading>
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  if (!intel) {
    return (
      <div className="bg-muted/50 rounded-lg p-4 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">No recent intelligence</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleGenerate()}
            disabled={generating}
            className="gap-1.5"
          >
            {generating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Newspaper className="h-3 w-3" />}
            {generating ? 'Searching...' : 'Search Web'}
          </Button>
        </div>
      </div>
    )
  }

  const daysAgo = Math.floor((Date.now() - new Date(intel.generated_at).getTime()) / (24 * 60 * 60 * 1000))

  return (
    <div className="bg-muted/30 rounded-lg p-4 border border-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-international-orange" />
          <SectionHeading className="!mb-0">News Intelligence</SectionHeading>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleGenerate(true)}
            disabled={generating}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={cn('h-3 w-3', generating && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{intel.intel_summary}</p>

      {/* Key Signals */}
      {intel.key_signals.length > 0 && (
        <div className="space-y-1.5">
          {intel.key_signals.slice(0, 3).map((signal, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={cn(
                'inline-block h-1.5 w-1.5 rounded-full mt-1.5 shrink-0',
                signal.sentiment === 'positive' && 'bg-success',
                signal.sentiment === 'negative' && 'bg-destructive',
                signal.sentiment === 'neutral' && 'bg-muted-foreground',
              )} />
              <span className="text-xs text-muted-foreground">{signal.signal}</span>
            </div>
          ))}
        </div>
      )}

      {/* Social Activity */}
      {intel.social_activity && (
        <TextSection title="Social Activity" content={intel.social_activity} />
      )}

      {/* Current Focus */}
      {intel.current_focus && (
        <TextSection title="Current Focus" content={intel.current_focus} />
      )}

      {/* Recent Deals */}
      {intel.recent_deals && (
        <TextSection title="Recent Deals" content={intel.recent_deals} />
      )}

      {/* Sources */}
      {intel.sources.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground mb-1">Sources:</p>
          <div className="flex flex-wrap gap-1">
            {intel.sources.slice(0, 5).map((source, i) => {
              // SECURITY H-3: Only allow http/https URLs to prevent javascript: XSS
              const safeUrl = /^https?:\/\//i.test(source.url) ? source.url : null
              if (!safeUrl) return null
              // SECURITY H-2: Safe hostname extraction (new URL() can throw on malformed URLs)
              let displayLabel = source.title
              if (!displayLabel) {
                try { displayLabel = new URL(safeUrl).hostname } catch { displayLabel = safeUrl }
              }
              return (
                <a
                  key={i}
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[10px] text-international-orange hover:underline"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  {displayLabel}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
