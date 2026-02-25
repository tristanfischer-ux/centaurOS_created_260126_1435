/**
 * @file investors/[id]/page.tsx
 *
 * @description Detail page for a single UK investor firm.
 * Two-column layout: main content (description, thesis, portfolio) on the left,
 * sidebar (fund details, links, status) on the right.
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
import { getInvestorById, getInvestorContacts } from '@/actions/investors'
import type { InvestorContact } from '@/actions/investors'
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Circle,
  Database,
  Globe,
  Linkedin,
  Mail,
  MapPin,
  Shield,
  TrendingUp,
  User,
  Users,
} from 'lucide-react'

export const revalidate = 60

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const PRIORITY_DESCRIPTIONS: Record<string, string> = {
  A: 'High priority — top-tier, actively deploying, most relevant firms',
  B: 'Medium priority — strong investors, good deployment history',
  C: 'Lower priority — secondary-tier or niche focus',
}

function formatSeniority(s: string): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Investor firm detail page.
 *
 * @description Fetches a single marketplace_listings record by ID and renders
 * a two-column detail layout. Returns a 404 if the record is not found or is
 * not in the Finance category.
 *
 * @param params - Route params containing the investor ID
 */
export default async function InvestorDetailPage({ params }: PageProps) {
  const { id } = await params
  const firm = await getInvestorById(id)

  if (!firm) {
    notFound()
  }

  const attrs = firm.attributes
  const contacts = await getInvestorContacts(id)

  return (
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
          {attrs.outreach_priority && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={priorityVariant(attrs.outreach_priority)} className="shrink-0 cursor-help">
                    Priority {attrs.outreach_priority}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{PRIORITY_DESCRIPTIONS[attrs.outreach_priority] ?? 'Outreach priority level'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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

              {/* Metadata row */}
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

              {/* Recent activity */}
              {attrs.recent_deals_summary && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Recent Activity</p>
                  <p className="text-sm text-foreground leading-relaxed">{attrs.recent_deals_summary}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Investment thesis */}
          {attrs.investment_thesis && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-foreground">Investment Thesis</h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{attrs.investment_thesis}</p>
              </CardContent>
            </Card>
          )}

          {/* Notable portfolio */}
          {attrs.notable_portfolio && attrs.notable_portfolio.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-foreground">Notable Portfolio</h2>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {attrs.notable_portfolio.map(company => (
                    <Badge key={company} variant="secondary">
                      {company}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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

          {/* Key People */}
          {contacts.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Key People
                </h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contacts.map((contact: InvestorContact) => (
                    <div key={contact.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted shrink-0">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{contact.full_name}</p>
                          {contact.is_decision_maker && (
                            <Badge variant="outline" className="text-xs">Decision Maker</Badge>
                          )}
                        </div>
                        {contact.title && (
                          <p className="text-xs text-muted-foreground mt-0.5">{contact.title}</p>
                        )}
                        {contact.seniority && (
                          <p className="text-xs text-muted-foreground">{formatSeniority(contact.seniority)}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {contact.linkedin_url && (
                            <a
                              href={contact.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-international-orange hover:underline text-xs flex items-center gap-1"
                            >
                              <Linkedin className="h-3 w-3" />
                              LinkedIn
                            </a>
                          )}
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="text-international-orange hover:underline text-xs flex items-center gap-1"
                            >
                              <Mail className="h-3 w-3" />
                              Email
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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
              {attrs.fund_size_gbp && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Fund Size</p>
                  <p className="text-sm font-semibold text-foreground">{formatFundSize(attrs.fund_size_gbp)}</p>
                </div>
              )}
              {attrs.aum_gbp && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">AUM</p>
                  <p className="text-sm font-semibold text-foreground">{formatFundSize(attrs.aum_gbp)}</p>
                </div>
              )}
              {attrs.fund_tier && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Fund Tier</p>
                  <Badge variant="outline" className="text-xs">{attrs.fund_tier}</Badge>
                </div>
              )}
              {attrs.hq_city && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">HQ</p>
                  <p className="text-sm text-foreground">{attrs.hq_city}</p>
                </div>
              )}
              {attrs.last_verified && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Last Verified</p>
                  <p className="text-xs text-muted-foreground">{attrs.last_verified}</p>
                </div>
              )}
            </CardContent>
          </Card>

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
                {attrs.outreach_status && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Status</p>
                    <p className="text-sm text-foreground">{attrs.outreach_status}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Contact & Data */}
          {(attrs.contact_email || attrs.data_source || attrs.last_fund_close_date) && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  Contact & Data
                </h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {attrs.contact_email && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Email</p>
                    <a
                      href={`mailto:${attrs.contact_email}`}
                      className="text-sm text-international-orange hover:underline flex items-center gap-1.5"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {attrs.contact_email}
                    </a>
                  </div>
                )}
                {attrs.last_fund_close_date && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Last Fund Close</p>
                    <p className="text-sm text-foreground">{attrs.last_fund_close_date}</p>
                  </div>
                )}
                {attrs.data_source && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Data Source</p>
                    <p className="text-sm text-foreground capitalize">{attrs.data_source.replace(/_/g, ' ')}</p>
                  </div>
                )}
                {attrs.data_confidence && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Confidence</p>
                    <Badge variant="outline" className="text-xs capitalize">{attrs.data_confidence}</Badge>
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
                {attrs.website_url && (
                  <a
                    href={attrs.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-international-orange hover:underline"
                  >
                    <Globe className="h-4 w-4 shrink-0" />
                    Website
                  </a>
                )}
                {attrs.linkedin_company_url && (
                  <a
                    href={attrs.linkedin_company_url}
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
  )
}
