/**
 * @file investors/[id]/page.tsx
 *
 * @description Detail page for a single UK investor firm.
 * Two-column layout: main content on the left, sidebar on the right.
 * Tier-gated: free users see an upgrade prompt overlay, starter+ see the full page,
 * professional+ see deep intelligence (emails, bios, fund performance).
 *
 * Revalidates every 60 seconds (ISR).
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  getInvestorById,
  getInvestorContacts,
  getSimilarInvestors,
  computeMatchScores,
} from '@/actions/investors'
import { createClient } from '@/lib/supabase/server'
import type { InvestorTierAccess } from '@/actions/investors'
import { PartnerCard } from '../components/PartnerCard'
import { PortfolioSection } from '../components/PortfolioSection'
import { FundPerformanceSection } from '../components/FundPerformanceSection'
import { LockedSection } from '../components/LockedSection'
import { InvestorNoteTimeline } from '../components/InvestorNoteTimeline'
import { SimilarInvestorsSection } from '../components/SimilarInvestorsSection'
import { InvestorDetailActions } from '../components/InvestorDetailActions'
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Circle,
  Database,
  Globe,
  Linkedin,
  Lock,
  Mail,
  MapPin,
  Shield,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'

export const revalidate = 60

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUserSector(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()
    if (!profile?.foundry_id) return null
    const { data: foundry } = await supabase
      .from('foundries')
      .select('sector')
      .eq('id', profile.foundry_id)
      .single()
    return foundry?.sector ?? null
  } catch {
    return null
  }
}

function formatFundSize(gbp: number): string {
  if (gbp >= 1_000_000_000) {
    const b = gbp / 1_000_000_000
    return `£${b % 1 === 0 ? b : b.toFixed(1)}B`
  }
  if (gbp >= 1_000_000) {
    const m = gbp / 1_000_000
    return `£${m % 1 === 0 ? m : m.toFixed(0)}M`
  }
  return `£${gbp.toLocaleString()}`
}

function priorityVariant(priority: string | undefined): 'destructive' | 'warning' | 'secondary' | 'outline' {
  if (priority === 'A') return 'destructive'
  if (priority === 'B') return 'warning'
  if (priority === 'C') return 'secondary'
  return 'outline'
}

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  // SECURITY: Block non-http(s) schemes (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''
  return `https://${url}`
}

const PRIORITY_DESCRIPTIONS: Record<string, string> = {
  A: 'High priority — top-tier, actively deploying, most relevant firms',
  B: 'Medium priority — strong investors, good deployment history',
  C: 'Lower priority — secondary-tier or niche focus',
}

// ---------------------------------------------------------------------------
// Free tier upgrade prompt
// ---------------------------------------------------------------------------

function FreeUpgradeOverlay({ firmName, firmType, hqCity }: {
  firmName: string
  firmType?: string
  hqCity?: string
}) {
  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/investors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to directory
          </Link>
        </Button>
      </div>

      {/* Teaser header */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-foreground">{firmName}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {firmType && <Badge variant="secondary">{firmType}</Badge>}
          {hqCity && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {hqCity}
            </span>
          )}
        </div>
      </div>

      <Separator />

      {/* Full-page upgrade card */}
      <div className="flex items-center justify-center py-16">
        <Card className="max-w-md text-center border-international-orange/30">
          <CardContent className="py-10 px-8 space-y-4">
            <div className="h-12 w-12 rounded-full bg-international-orange/10 flex items-center justify-center mx-auto">
              <Lock className="h-6 w-6 text-international-orange" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Unlock Investor Intelligence
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Get full access to investor profiles, partner contacts, portfolio data,
              and investment thesis details. Start with the Startup Team plan.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button asChild className="bg-international-orange hover:bg-international-orange-hover">
                <Link href="/pricing">View Plans — from £49/mo</Link>
              </Button>
              <p className="text-xs text-muted-foreground">No contracts. Cancel anytime.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function InvestorDetailPage({ params }: PageProps) {
  const { id } = await params
  const { firm, access, gated } = await getInvestorById(id)

  if (!firm) {
    notFound()
  }

  // Free tier: show upgrade prompt
  if (gated) {
    return (
      <FreeUpgradeOverlay
        firmName={firm.title}
        firmType={firm.attributes.firm_type}
        hqCity={firm.attributes.hq_city}
      />
    )
  }

  const attrs = firm.attributes
  const [contactResult, similarResult] = await Promise.allSettled([
    getInvestorContacts(id),
    getSimilarInvestors(id, 5),
  ])

  const { contacts, access: contactAccess } = contactResult.status === 'fulfilled'
    ? contactResult.value
    : { contacts: [], access }
  const similarFirms = similarResult.status === 'fulfilled'
    ? similarResult.value.firms
    : []

  // Compute match scores for similar investors
  let similarScores: Record<string, number> = {}
  if (similarFirms.length > 0) {
    try {
      similarScores = await computeMatchScores(similarFirms.map(f => f.id))
    } catch { /* Non-critical */ }
  }

  return (
    <TooltipProvider>
      <div className="space-y-8 max-w-5xl">
        {/* Back button */}
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/investors">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to directory
            </Link>
          </Button>
        </div>

        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground">{firm.title}</h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {firm.subcategory && (
                  <Badge variant="secondary">{firm.subcategory}</Badge>
                )}
                {attrs.firm_type && (
                  <Badge variant="outline">{attrs.firm_type}</Badge>
                )}
                {attrs.fund_tier && (
                  <Badge variant="outline">{attrs.fund_tier}</Badge>
                )}
                {attrs.hq_city && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {attrs.hq_city}
                  </span>
                )}
                {attrs.is_active_deploying !== undefined && (
                  <span className="flex items-center gap-1 text-sm">
                    {attrs.is_active_deploying ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span className="text-success font-medium">Actively deploying</span>
                      </>
                    ) : (
                      <>
                        <Circle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Not deploying</span>
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {attrs.outreach_priority && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant={priorityVariant(attrs.outreach_priority)} className="cursor-help">
                      Priority {attrs.outreach_priority}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{PRIORITY_DESCRIPTIONS[attrs.outreach_priority] ?? 'Outreach priority level'}</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {/* Alert, shortlist, and outreach action buttons */}
              <InvestorDetailActions listingId={id} access={access} firmName={firm.title} />
            </div>
          </div>
        </div>

        <Separator />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content — 2/3 width */}
          <div className="lg:col-span-2 space-y-6">
            {/* About */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-foreground">About</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {firm.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{firm.description}</p>
                )}

                {(attrs.founding_year || attrs.location || attrs.bvca_member) && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    {attrs.founding_year && (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        Founded {attrs.founding_year}
                      </span>
                    )}
                    {attrs.location && (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {attrs.location}
                      </span>
                    )}
                    {attrs.bvca_member && (
                      <Badge variant="outline" className="text-xs">
                        <Shield className="h-3 w-3 mr-1" />
                        BVCA Member
                      </Badge>
                    )}
                  </div>
                )}

                {attrs.recent_deals_summary && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Recent Activity</p>
                    <p className="text-sm text-foreground leading-relaxed">{attrs.recent_deals_summary}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Investment Thesis */}
            {(attrs.investment_thesis || attrs.ideal_company_profile || attrs.value_add) && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    Investment Thesis
                  </h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  {attrs.investment_thesis && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{attrs.investment_thesis}</p>
                  )}

                  {attrs.ideal_company_profile && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ideal Company</p>
                      <p className="text-sm text-foreground leading-relaxed">{attrs.ideal_company_profile}</p>
                    </div>
                  )}

                  {attrs.value_add && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Value-Add</p>
                      <p className="text-sm text-foreground leading-relaxed">{attrs.value_add}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Key People */}
            {contacts.length > 0 ? (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Key People ({contacts.length})
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {contacts.map((contact) => (
                      <PartnerCard key={contact.id} contact={contact} access={contactAccess} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : access.contactsVisible ? null : (
              <LockedSection
                title="Key People"
                requiredTier="starter"
                featureDescription="See partner names, titles, LinkedIn profiles, and more."
              >
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="h-8 w-8 rounded-full bg-muted" />
                      <div className="space-y-1">
                        <div className="h-3 w-32 bg-muted rounded" />
                        <div className="h-2 w-20 bg-muted rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </LockedSection>
            )}

            {/* Portfolio companies (starter+, overlap highlights for professional+) */}
            {attrs.portfolio_companies && attrs.portfolio_companies.length > 0 ? (
              <PortfolioSection
                companies={attrs.portfolio_companies}
                userSector={access.intelligenceAccess ? (await getUserSector()) ?? undefined : undefined}
              />
            ) : !access.contactsVisible ? (
              <LockedSection
                title="Portfolio"
                requiredTier="starter"
                featureDescription="View portfolio companies, sectors, and investment amounts."
              >
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-1">
                      <div className="h-3 w-40 bg-muted rounded" />
                      <div className="h-2 w-24 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              </LockedSection>
            ) : null}

            {/* Fund performance (professional+) */}
            <FundPerformanceSection
              fundHistory={attrs.fund_history}
              exits={attrs.exits}
              fundPerformance={attrs.fund_performance}
              factCheckStatus={attrs.fact_check_status}
              hasAccess={access.intelligenceAccess}
            />

            {/* Stage focus */}
            {attrs.stage_focus && attrs.stage_focus.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Stage Focus
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {attrs.stage_focus.map(s => (
                      <Badge key={s} variant="outline">{s}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sectors */}
            {attrs.sectors && attrs.sectors.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground">Sectors</h2>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {attrs.sectors.map(s => (
                      <Badge key={s} variant="secondary">{s}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes & Activity (starter+) */}
            {access.detailAccess && <InvestorNoteTimeline listingId={id} />}

            {/* Similar Investors */}
            {similarFirms.length > 0 && (
              <SimilarInvestorsSection firms={similarFirms} matchScores={similarScores} />
            )}
          </div>

          {/* Sidebar — 1/3 width */}
          <div className="space-y-4">
            {/* Fund details */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Fund Details
                </h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {attrs.fund_size_gbp != null && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Fund Size</p>
                    <p className="text-sm font-semibold text-foreground">{formatFundSize(attrs.fund_size_gbp)}</p>
                  </div>
                )}
                {attrs.cheque_range_gbp && (attrs.cheque_range_gbp.min != null || attrs.cheque_range_gbp.max != null) && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Cheque Size</p>
                    <p className="text-sm font-semibold text-foreground">
                      {attrs.cheque_range_gbp.min ? formatFundSize(attrs.cheque_range_gbp.min) : '?'}
                      {' – '}
                      {attrs.cheque_range_gbp.max ? formatFundSize(attrs.cheque_range_gbp.max) : '?'}
                    </p>
                  </div>
                )}
                {attrs.aum_gbp != null && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">AUM</p>
                    <p className="text-sm font-semibold text-foreground">{formatFundSize(attrs.aum_gbp)}</p>
                  </div>
                )}
                {attrs.geo_focus && attrs.geo_focus.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Geo Focus</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {attrs.geo_focus.map(g => (
                        <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {attrs.hq_city && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">HQ</p>
                    <p className="text-sm text-foreground">{attrs.hq_city}</p>
                  </div>
                )}
                {/* Hardware fit — professional+ only */}
                {attrs.hardware_fit_score != null && access.intelligenceAccess && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Hardware Fit</p>
                    <p className="text-sm font-semibold text-foreground">{attrs.hardware_fit_score.toFixed(1)}/10</p>
                  </div>
                )}
                {attrs.hardware_fit_score != null && !access.intelligenceAccess && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5 flex items-center gap-1">
                      Hardware Fit <Lock className="h-2.5 w-2.5" />
                    </p>
                    <p className="text-xs text-muted-foreground">Professional plan</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Data quality */}
            {attrs.data_quality_score != null && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    Data Quality
                  </h2>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Score</p>
                    <p className="text-sm font-semibold text-foreground">{attrs.data_quality_score.toFixed(1)}/10</p>
                  </div>
                  {attrs.data_source && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Source</p>
                      <p className="text-sm text-foreground capitalize">{attrs.data_source.replace(/_/g, ' ')}</p>
                    </div>
                  )}
                  {attrs.last_synced && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Last Synced</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(attrs.last_synced).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Outreach status */}
            {(attrs.outreach_status || attrs.outreach_priority) && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground">Outreach</h2>
                </CardHeader>
                <CardContent className="space-y-3">
                  {attrs.outreach_priority && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Priority</p>
                      <Badge variant={priorityVariant(attrs.outreach_priority)}>
                        Priority {attrs.outreach_priority}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {PRIORITY_DESCRIPTIONS[attrs.outreach_priority]}
                      </p>
                    </div>
                  )}
                  {attrs.outreach_status && attrs.outreach_status !== 'not_started' && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Status</p>
                      <p className="text-sm text-foreground">
                        {attrs.outreach_status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Links */}
            {(attrs.website_url || attrs.linkedin_company_url) && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground">Links</h2>
                </CardHeader>
                <CardContent className="space-y-2">
                  {attrs.website_url && ensureProtocol(attrs.website_url) && (
                    <a
                      href={ensureProtocol(attrs.website_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-international-orange hover:underline"
                    >
                      <Globe className="h-4 w-4 shrink-0" />
                      Website
                    </a>
                  )}
                  {attrs.linkedin_company_url && ensureProtocol(attrs.linkedin_company_url) && (
                    <a
                      href={ensureProtocol(attrs.linkedin_company_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-international-orange hover:underline"
                    >
                      <Linkedin className="h-4 w-4 shrink-0" />
                      LinkedIn
                    </a>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
