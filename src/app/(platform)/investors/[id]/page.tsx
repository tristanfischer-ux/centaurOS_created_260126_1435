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

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  getInvestorById,
  computeMatchScores,
  getInvestorContacts,
  getSimilarInvestors,
  getCoInvestors,
  getShortlistIds,
  type ShortlistStage,
} from '@/actions/investors'
import { createClient } from '@/lib/supabase/server'
import { formatFundSize } from '@/lib/format'
import type { InvestorTierAccess } from '@/actions/investors'
import { KeyPeopleSection } from '../components/KeyPeopleSection'
import { PortfolioSection } from '../components/PortfolioSection'
import { FundPerformanceSection } from '../components/FundPerformanceSection'
import { LockedSection } from '../components/LockedSection'
import { InvestorNoteTimeline } from '../components/InvestorNoteTimeline'
import { SimilarInvestorsSection } from '../components/SimilarInvestorsSection'
import { CoInvestmentNetworkSection } from '../components/CoInvestmentNetworkSection'
import { InvestorBreadcrumb } from '../components/InvestorBreadcrumb'
import { InvestorDataPanorama } from '../components/InvestorDataPanorama'
import { InvestorDetailActions } from '../components/InvestorDetailActions'
import { ViewCapOverlay } from '../components/ViewCapOverlay'
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Circle,
  Database,
  Eye,
  Globe,
  Lightbulb,
  Link2,
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
// Types
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>
}

// Dynamic page <title> per investor so browser tabs / bookmarks / SEO snippets
// reflect the actual investor firm instead of the generic site tagline.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('marketplace_listings')
    .select('title, description')
    .eq('id', id)
    .single()
  if (!data) return { title: 'Investor not found' }
  const desc = (data.description ?? '').slice(0, 155)
  return {
    title: data.title,
    description: desc || `${data.title} on the Fractional Forge investor directory.`,
  }
}

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
  } catch (err) {
    console.error('[getUserSector] Failed:', err)
    return null
  }
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

/**
 * Label + container classes for each shortlist pipeline stage. Mirrors the
 * columns on InvestorShortlistBoard (STAGES const) but rendered inline as a
 * compact chip near the firm header so founders see pipeline position
 * without bouncing back to the board.
 */
const SHORTLIST_STAGE_CONFIG: Record<ShortlistStage, { label: string; classes: string }> = {
  researching: { label: 'Researching', classes: 'bg-muted text-foreground border-border' },
  contacted: { label: 'Contacted', classes: 'bg-status-info-light text-status-info-dark border-status-info/30' },
  meeting: { label: 'Meeting', classes: 'bg-status-warning-light text-status-warning-dark border-status-warning/30' },
  in_discussion: { label: 'In Discussion', classes: 'bg-international-orange/10 text-international-orange border-international-orange/30' },
  closed_won: { label: 'Closed Won', classes: 'bg-status-success-light text-status-success-dark border-status-success/30' },
  closed_lost: { label: 'Closed Lost', classes: 'bg-status-error-light text-status-error-dark border-status-error/30' },
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
              and investment thesis details.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button asChild className="bg-international-orange hover:bg-international-orange-hover">
                <Link href="/pricing">View Plans — from £19/mo</Link>
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

export default async function InvestorDetailPage({ params }: PageProps) {
  const { id } = await params
  const [{ firm, access, gated, viewCapHit, viewCap }, matchScoresMap] = await Promise.all([
    getInvestorById(id),
    // computeMatchScores returns {} when no foundry profile — Scorecard
    // renders only when pillars come back. Tristan 2026-04-27.
    computeMatchScores([id]).catch(() => ({} as Awaited<ReturnType<typeof computeMatchScores>>)),
  ])
  const matchResult = matchScoresMap[id]

  if (!firm) {
    notFound()
  }

  // Not logged in / no foundry: show generic upgrade prompt
  if (gated) {
    return (
      <FreeUpgradeOverlay
        firmName={firm.title}
        firmType={firm.attributes.firm_type}
        hqCity={firm.attributes.hq_city}
      />
    )
  }

  // View cap exceeded: show teaser with cap-specific upgrade CTA
  if (viewCapHit && viewCap) {
    return (
      <ViewCapOverlay
        firmName={firm.title}
        firmType={firm.attributes.firm_type}
        hqCity={firm.attributes.hq_city}
        tier={access.tier}
        viewCap={viewCap}
      />
    )
  }

  const attrs = firm.attributes
  const [contactResult, similarResult, userSectorResult, coInvestorResult, shortlistResult] = await Promise.allSettled([
    getInvestorContacts(id, access),
    getSimilarInvestors(id, 5, access),
    access.intelligenceAccess ? getUserSector() : Promise.resolve(null),
    access.contactsVisible ? getCoInvestors(id, access) : Promise.resolve({ coInvestors: [] }),
    getShortlistIds(),
  ])

  const { contacts, access: contactAccess } = contactResult.status === 'fulfilled'
    ? contactResult.value
    : { contacts: [], access }
  const similarFirms = similarResult.status === 'fulfilled'
    ? similarResult.value.firms
    : []
  const similarScores = similarResult.status === 'fulfilled'
    ? similarResult.value.similarityScores
    : {}
  const userSector = userSectorResult.status === 'fulfilled' ? userSectorResult.value : null
  const coInvestors = coInvestorResult.status === 'fulfilled' ? coInvestorResult.value.coInvestors : []
  const shortlistStage: ShortlistStage | null = shortlistResult.status === 'fulfilled'
    ? (shortlistResult.value[id] ?? null)
    : null
  const stageConfig = shortlistStage ? SHORTLIST_STAGE_CONFIG[shortlistStage] : null

  const fundSizeLabel = formatFundSize(attrs.fund_size_gbp)
  const aumLabel = formatFundSize(attrs.aum_gbp)

  return (
    <TooltipProvider>
      <div className="space-y-8 max-w-5xl">
        {/* Breadcrumb trail — tracks navigation through investor network */}
        <InvestorBreadcrumb investorId={id} investorName={firm.title} />

        {/* Views remaining banner — soft nudge for capped tiers */}
        {viewCap && viewCap.isRevisit && (
          <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-4 py-2.5 text-sm">
            <Eye className="h-4 w-4 text-success shrink-0" />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">In your library</span>
              {' '}&mdash; free to revisit
            </span>
          </div>
        )}
        {viewCap && !viewCap.isRevisit && viewCap.cap !== null && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
            <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {viewCap.viewsRemaining ?? 0} new investor {(viewCap.viewsRemaining ?? 0) === 1 ? 'view' : 'views'}
              </span>
              {' '}remaining this month
              {viewCap.librarySize > 0 && (
                <>{' · Library: '}<span className="font-medium text-foreground">{viewCap.librarySize}</span>{' profiles'}</>
              )}
              {(viewCap.viewsRemaining ?? 0) <= 3 && (
                <>{' · '}<Link href="/pricing" className="text-international-orange hover:underline">Upgrade for more</Link></>
              )}
            </span>
          </div>
        )}

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
              {stageConfig && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={`cursor-help ${stageConfig.classes}`}
                    >
                      <Briefcase className="h-3 w-3 mr-1" />
                      {stageConfig.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Your pipeline stage for this investor. Change on the Shortlist board.</p>
                  </TooltipContent>
                </Tooltip>
              )}
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
              <InvestorDetailActions
                listingId={id}
                access={access}
                firmName={firm.title}
                contactStatus={firm.contact_status}
                linkedinCompanyUrl={firm.attributes.linkedin_company_url}
              />
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
              </CardContent>
            </Card>

            {/* Match Scorecard — Forge Capital 6-pillar breakdown of how
                this investor matches the foundry's profile. Renders only
                when match data is available (foundry profile exists). */}
            {matchResult && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    Match Scorecard
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                    {(['thesis', 'stage', 'geo', 'cheque', 'activity', 'confidence'] as const).map((key) => {
                      const value = matchResult.pillars[key]
                      const isNA = value == null
                      let fillColor = '#d1d5db'
                      if (!isNA) {
                        if (value >= 70) fillColor = '#16a34a'
                        else if (value >= 40) fillColor = '#f59e0b'
                        else fillColor = '#dc2626'
                      }
                      return (
                        <div key={key} className="text-center">
                          <div
                            className="font-medium uppercase mb-1 truncate"
                            style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.3px' }}
                          >
                            {key}
                          </div>
                          <div
                            className="w-full overflow-hidden"
                            style={{ height: '5px', borderRadius: '3px', background: '#e5e7eb' }}
                          >
                            {!isNA && (
                              <div
                                style={{
                                  height: '100%',
                                  borderRadius: '3px',
                                  width: `${Math.min(100, Math.max(0, value))}%`,
                                  background: fillColor,
                                }}
                              />
                            )}
                          </div>
                          <div
                            className="font-semibold mt-0.5 tabular-nums"
                            style={{ fontSize: '10px', color: isNA ? '#9ca3af' : 'hsl(var(--foreground))' }}
                          >
                            {isNA ? 'N/A' : value}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Investment Thesis — Prominent section */}
            {attrs.investment_thesis && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    Investment Thesis
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground leading-relaxed">{attrs.investment_thesis}</p>
                </CardContent>
              </Card>
            )}

            {/* Key Details Card */}
            {(attrs.fund_size_gbp || attrs.cheque_range_gbp || attrs.stage_focus?.length || attrs.sectors?.length || attrs.geo_focus?.length || attrs.firm_type) && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    Key Details
                  </h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Fund Size and Cheque Range */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {attrs.fund_size_gbp && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Fund Size</p>
                        <p className="text-sm font-semibold text-foreground">{fundSizeLabel}</p>
                      </div>
                    )}
                    {attrs.cheque_range_gbp && (attrs.cheque_range_gbp.min != null || attrs.cheque_range_gbp.max != null) && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Cheque Range</p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatFundSize(attrs.cheque_range_gbp.min) ?? '?'} — {formatFundSize(attrs.cheque_range_gbp.max) ?? '?'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Stage Focus */}
                  {attrs.stage_focus && attrs.stage_focus.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Stage Focus</p>
                      <div className="flex flex-wrap gap-2">
                        {attrs.stage_focus.map(s => (
                          <Badge key={s} variant="outline">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sector Focus */}
                  {Array.isArray(attrs.sectors) && attrs.sectors.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Sector Focus</p>
                      <div className="flex flex-wrap gap-2">
                        {attrs.sectors.slice(0, 6).map(s => (
                          <Badge key={s} variant="secondary">{s}</Badge>
                        ))}
                        {attrs.sectors.length > 6 && (
                          <Badge variant="outline">+{attrs.sectors.length - 6}</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Geographic Focus */}
                  {attrs.geo_focus && attrs.geo_focus.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Geographic Focus</p>
                      <div className="flex flex-wrap gap-2">
                        {attrs.geo_focus.map(g => (
                          <Badge key={g} variant="outline">{g}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Entity Type */}
                  {attrs.firm_type && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Entity Type</p>
                      <p className="text-sm text-foreground">{attrs.firm_type}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Ideal Company Profile */}
            {attrs.ideal_company_profile && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    Ideal Company Profile
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground leading-relaxed">{attrs.ideal_company_profile}</p>
                </CardContent>
              </Card>
            )}

            {/* Investment Pattern (professional+) — moved up per Forge Capital
                order: Investment Thesis → Ideal Company Profile → Investment
                Pattern → Team Expertise → Connection Brief → Value Add. */}
            {access.intelligenceAccess && attrs.investment_pattern ? (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Investment Pattern
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground leading-relaxed">{attrs.investment_pattern}</p>
                </CardContent>
              </Card>
            ) : !access.intelligenceAccess && (
              <LockedSection
                title="Investment Pattern"
                requiredTier="professional"
                featureDescription="Synthesized investment behavior analysis from portfolio data."
              >
                <div className="h-16 bg-muted/50 rounded" />
              </LockedSection>
            )}

            {/* Team Expertise (professional+) */}
            {access.intelligenceAccess && attrs.team_expertise ? (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Team Expertise
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground leading-relaxed">{attrs.team_expertise}</p>
                </CardContent>
              </Card>
            ) : !access.intelligenceAccess && (
              <LockedSection
                title="Team Expertise"
                requiredTier="professional"
                featureDescription="Analysis of the team's domain expertise and track record."
              >
                <div className="h-16 bg-muted/50 rounded" />
              </LockedSection>
            )}

            {/* Connection Brief (professional+) */}
            {access.intelligenceAccess && attrs.connection_brief ? (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    Connection Brief
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground leading-relaxed">{attrs.connection_brief}</p>
                </CardContent>
              </Card>
            ) : !access.intelligenceAccess && (
              <LockedSection
                title="Connection Brief"
                requiredTier="professional"
                featureDescription="Outreach intelligence — warm intro paths, networking context, and approach strategy."
              >
                <div className="h-16 bg-muted/50 rounded" />
              </LockedSection>
            )}

            {/* Value-Add — moved here after Connection Brief per Forge Capital
                order. */}
            {attrs.value_add && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-muted-foreground" />
                    Value-Add
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground leading-relaxed">{attrs.value_add}</p>
                </CardContent>
              </Card>
            )}

            {/* Synthesis Dossier (professional+) */}
            {/*
             * INTENT: Surface the deep-profile synthesis (signals, contradictions, recent
             * moves, theses) once the Forge Capital pipeline lands its dossier table on
             * ForgeOS Supabase. Until then, render a clean forward-looking placeholder so
             * the slot exists on the page and design can be reasoned about.
             *
             * GOTCHA: investor_deep_profiles does NOT exist on the ForgeOS Supabase project
             * (jyarhvinengfyrwgtskq) yet — confirmed via Supabase MCP execute_sql on
             * 2026-04-23. When it lands, swap the placeholder body for the actual JOIN
             * payload (add the JOIN to getInvestorById and pass attrs.deep_profile here).
             */}
            {access.intelligenceAccess ? (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-muted-foreground" />
                    Synthesis Dossier
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    No dossier yet — this firm hasn&apos;t been through the deep-profile
                    synthesis pipeline. Signals, contradictions, recent moves, and active
                    theses will appear here once the next research cycle completes.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <LockedSection
                title="Synthesis Dossier"
                requiredTier="professional"
                featureDescription="Cross-source synthesis: stated thesis vs actual investments, recent partner moves, contradictions, and active theses."
              >
                <div className="h-16 bg-muted/50 rounded" />
              </LockedSection>
            )}

            {/* Recent Activity */}
            {attrs.recent_deals_summary && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Recent Activity
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground leading-relaxed">{attrs.recent_deals_summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Key People — click a partner to see full detail + link to firm */}
            {contacts.length > 0 ? (
              <KeyPeopleSection contacts={contacts} access={contactAccess} />
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
                userSector={userSector ?? undefined}
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

            {/* Co-Investment Network (starter+, syndication for professional+) */}
            {coInvestors.length > 0 ? (
              <CoInvestmentNetworkSection
                coInvestors={coInvestors}
                investorSectors={attrs.sectors}
                hasIntelligenceAccess={access.intelligenceAccess}
              />
            ) : !access.contactsVisible ? (
              <LockedSection
                title="Co-Investment Network"
                requiredTier="starter"
                featureDescription="See which investors co-invest together, discover syndication partners, and find warm intro paths."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                      <div className="h-3 w-32 bg-muted rounded" />
                      <div className="h-2 w-20 bg-muted rounded" />
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

            {/* Investor data panorama — surfaces every populated attribute the
                prior cards don't already show. Tristan's call 2026-04-26:
                "the database on investors is enormous, no point having lots of
                fields if they're not being revealed to the user." */}
            <InvestorDataPanorama firm={firm} />

            {/* Notes & Activity (starter+) */}
            {access.detailAccess && <InvestorNoteTimeline listingId={id} />}

            {/* Similar Investors */}
            {similarFirms.length > 0 && (
              <SimilarInvestorsSection firms={similarFirms} similarityScores={similarScores} />
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
                {fundSizeLabel && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Fund Size</p>
                    <p className="text-sm font-semibold text-foreground">{fundSizeLabel}</p>
                  </div>
                )}
                {attrs.cheque_range_gbp && (attrs.cheque_range_gbp.min != null || attrs.cheque_range_gbp.max != null) && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Cheque Size</p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatFundSize(attrs.cheque_range_gbp.min) ?? '?'}
                      {' – '}
                      {formatFundSize(attrs.cheque_range_gbp.max) ?? '?'}
                    </p>
                  </div>
                )}
                {aumLabel && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">AUM</p>
                    <p className="text-sm font-semibold text-foreground">{aumLabel}</p>
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
                    <p className="text-sm font-semibold text-foreground">{Number(attrs.hardware_fit_score).toFixed(1)}/10</p>
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

            {/* Verification footer — Tristan 2026-04-27: skip Data Quality
                (quality_score, data_source) — internal-only fields. Keep the
                website-verified + intel-synthesised dates per Forge Capital
                external view. */}
            {(attrs.last_synced || attrs.last_verified) && (
              <div className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
                {attrs.last_verified && !isNaN(new Date(attrs.last_verified).getTime()) && (
                  <span>Website verified: {new Date(attrs.last_verified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                )}
                {attrs.last_verified && attrs.last_synced && <span> · </span>}
                {attrs.last_synced && !isNaN(new Date(attrs.last_synced).getTime()) && (
                  <span>Intel synthesised: {new Date(attrs.last_synced).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                )}
              </div>
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
