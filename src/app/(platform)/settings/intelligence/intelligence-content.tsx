'use client'

/**
 * @file intelligence-content.tsx
 *
 * @description Client component for the Company Intelligence settings page.
 * Displays what the AI specialists know about the company with sections for
 * company identity, founder profile, website intelligence, competitive landscape,
 * and strategic context. Provides controls for manual enrichment triggers.
 *
 * @component IntelligenceContent
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Building2,
  User,
  Globe,
  Swords,
  Target,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  BookOpen,
  GraduationCap,
  Briefcase,
  Link2,
  MapPin,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { enrichCompanyWebsite, enrichCompetitors } from '@/actions/enrichment'
import { SECTOR_LABELS } from '@/types/foundry'
import type {
  CompanyProfile,
  CompanyIntelligence,
  FoundryPurposeData,
  Sector,
} from '@/types/foundry'

// ─── Types ──────────────────────────────────────────────────────────

interface IntelligenceContentProps {
  foundryId: string
  foundryName: string
  sector: string | null
  industry: string | null
  stage: string | null
  companyProfile: CompanyProfile | null
  purposeData: FoundryPurposeData | null
  companyIntel: CompanyIntelligence | null
  founderProfile: {
    full_name: string | null
    headline: string | null
    bio: string | null
    expertise_areas: string[] | null
    skills: string[] | null
    years_experience: number | null
    linkedin_url: string | null
    professional_background: {
      summary?: string | null
      previous_companies?: string | null
      education?: string | null
    } | null
  }
  teamCount: number
}

// ─── Component ──────────────────────────────────────────────────────

export function IntelligenceContent({
  foundryId,
  foundryName,
  sector,
  industry,
  stage,
  companyProfile,
  purposeData,
  companyIntel,
  founderProfile,
  teamCount,
}: IntelligenceContentProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeRefresh, setActiveRefresh] = useState<'website' | 'competitors' | null>(null)

  function handleRefreshWebsite(): void {
    setActiveRefresh('website')
    startTransition(async () => {
      const result = await enrichCompanyWebsite(foundryId)
      setActiveRefresh(null)

      if (result.success) {
        toast.success(`Website intelligence updated — ${result.data.fieldsEnriched.length} fields enriched`)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleRefreshCompetitors(): void {
    setActiveRefresh('competitors')
    startTransition(async () => {
      const result = await enrichCompetitors(foundryId)
      setActiveRefresh(null)

      if (result.success) {
        toast.success('Competitive intelligence updated')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const sectorLabel = sector ? SECTOR_LABELS[sector as Sector] ?? sector : null
  const hasWebsite = Boolean(companyProfile?.website)
  const hasCompetitors = Boolean(companyProfile?.competitors?.length)
  const lastEnriched = companyIntel?.last_enriched_at
    ? new Date(companyIntel.last_enriched_at)
    : null

  return (
    <div className="space-y-8">
      {/* Page intro */}
      <div>
        <p className="text-muted-foreground text-sm">
          This is what your specialists know about {foundryName}. The more complete this is,
          the more personalized and useful their advice becomes.
        </p>
      </div>

      {/* Last enriched timestamp */}
      {lastEnriched && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Last enriched: {lastEnriched.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          {' at '}
          {lastEnriched.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Company Identity ────────────────────────────────── */}
        <IntelCard
          icon={Building2}
          title="Company Identity"
          accentColor="text-international-orange"
        >
          <DataRow label="Company" value={foundryName} />
          {sectorLabel && <DataRow label="Sector" value={sectorLabel} />}
          {industry && <DataRow label="Industry" value={industry} />}
          {stage && <DataRow label="Stage" value={stage} />}
          {companyProfile?.website && (
            <DataRow label="Website" value={companyProfile.website} isLink />
          )}
          {companyProfile?.location && (
            <DataRow label="Location" value={companyProfile.location} icon={MapPin} />
          )}
          {companyProfile?.founded_year && (
            <DataRow label="Founded" value={String(companyProfile.founded_year)} />
          )}
          <DataRow label="Team size" value={`${teamCount} member${teamCount !== 1 ? 's' : ''}`} icon={Users} />
        </IntelCard>

        {/* ─── Founder Profile ─────────────────────────────────── */}
        <IntelCard
          icon={User}
          title="Founder Profile"
          accentColor="text-electric-blue"
        >
          {founderProfile.full_name && <DataRow label="Name" value={founderProfile.full_name} />}
          {founderProfile.headline && <DataRow label="Title" value={founderProfile.headline} />}
          {founderProfile.bio && <DataRow label="Bio" value={founderProfile.bio} />}
          {founderProfile.years_experience && (
            <DataRow label="Experience" value={`${founderProfile.years_experience} years`} />
          )}
          {founderProfile.expertise_areas && founderProfile.expertise_areas.length > 0 && (
            <DataRow label="Expertise" value={founderProfile.expertise_areas.join(', ')} />
          )}
          {founderProfile.skills && founderProfile.skills.length > 0 && (
            <DataRow label="Skills" value={founderProfile.skills.join(', ')} />
          )}
          {founderProfile.linkedin_url && (
            <DataRow label="LinkedIn" value={founderProfile.linkedin_url} isLink icon={Link2} />
          )}
          {founderProfile.professional_background?.summary && (
            <DataRow label="Career summary" value={founderProfile.professional_background.summary} icon={Briefcase} />
          )}
          {founderProfile.professional_background?.previous_companies && (
            <DataRow label="Previous companies" value={founderProfile.professional_background.previous_companies} icon={Building2} />
          )}
          {founderProfile.professional_background?.education && (
            <DataRow label="Education" value={founderProfile.professional_background.education} icon={GraduationCap} />
          )}
          {!founderProfile.full_name && !founderProfile.bio && (
            <EmptyFieldHint>
              Add your name and bio in <strong>My Profile</strong> to help specialists understand who you are.
            </EmptyFieldHint>
          )}
        </IntelCard>

        {/* ─── Strategic Context ───────────────────────────────── */}
        <IntelCard
          icon={Target}
          title="Strategic Context"
          accentColor="text-status-success"
        >
          {purposeData?.purpose && <DataRow label="Purpose" value={purposeData.purpose} />}
          {purposeData?.mission && <DataRow label="Mission" value={purposeData.mission} />}
          {purposeData?.vision && <DataRow label="Vision" value={purposeData.vision} />}
          {purposeData?.questionnaire?.problemSolved && (
            <DataRow label="Problem we solve" value={purposeData.questionnaire.problemSolved} />
          )}
          {purposeData?.questionnaire?.whoServed && (
            <DataRow label="Who we serve" value={purposeData.questionnaire.whoServed} />
          )}
          {purposeData?.questionnaire?.uniqueValue && (
            <DataRow label="What makes us unique" value={purposeData.questionnaire.uniqueValue} />
          )}
          {purposeData?.questionnaire?.fiveYearVision && (
            <DataRow label="5-year vision" value={purposeData.questionnaire.fiveYearVision} />
          )}
          {!purposeData && (
            <EmptyFieldHint>
              Define your company purpose in <strong>Company Settings</strong> to give specialists strategic context.
            </EmptyFieldHint>
          )}
        </IntelCard>

        {/* ─── Website Intelligence ────────────────────────────── */}
        <IntelCard
          icon={Globe}
          title="Website Intelligence"
          accentColor="text-electric-blue"
          action={
            hasWebsite ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshWebsite}
                disabled={isPending}
                className="text-xs"
              >
                {activeRefresh === 'website' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                {activeRefresh === 'website' ? 'Scanning...' : 'Refresh'}
              </Button>
            ) : undefined
          }
        >
          {companyIntel?.website_summary ? (
            <>
              <DataRow label="Summary" value={companyIntel.website_summary} />
              {companyIntel.value_proposition && (
                <DataRow label="Value proposition" value={companyIntel.value_proposition} />
              )}
              {companyIntel.target_customers && (
                <DataRow label="Target customers" value={companyIntel.target_customers} />
              )}
              {companyIntel.products_services && companyIntel.products_services.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Products/Services</span>
                  <div className="flex flex-wrap gap-1.5">
                    {companyIntel.products_services.map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {p.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {companyIntel.pricing_model && (
                <DataRow label="Pricing model" value={companyIntel.pricing_model} />
              )}
              {companyIntel.team_bios && companyIntel.team_bios.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Team found on website ({companyIntel.team_bios.length})
                  </span>
                  {companyIntel.team_bios.map((t, i) => (
                    <p key={i} className="text-sm text-foreground">
                      <strong>{t.name}</strong> — {t.role}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : hasWebsite ? (
            <div className="space-y-3">
              <EmptyFieldHint>
                Your website hasn&apos;t been analyzed yet. Click <strong>Refresh</strong> to scan it and
                give your specialists deeper understanding of your products and positioning.
              </EmptyFieldHint>
              <Button
                onClick={handleRefreshWebsite}
                disabled={isPending}
                size="sm"
              >
                {activeRefresh === 'website' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scanning website...
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    Scan Website
                  </>
                )}
              </Button>
            </div>
          ) : (
            <EmptyFieldHint>
              Add your website URL in <strong>Settings &gt; Company</strong> to enable website intelligence.
            </EmptyFieldHint>
          )}
        </IntelCard>

        {/* ─── Competitive Landscape ───────────────────────────── */}
        <IntelCard
          icon={Swords}
          title="Competitive Landscape"
          accentColor="text-status-warning"
          action={
            hasCompetitors ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshCompetitors}
                disabled={isPending}
                className="text-xs"
              >
                {activeRefresh === 'competitors' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                {activeRefresh === 'competitors' ? 'Analyzing...' : 'Refresh'}
              </Button>
            ) : undefined
          }
        >
          {companyIntel?.competitors && companyIntel.competitors.length > 0 ? (
            <div className="space-y-3">
              {companyIntel.competitors.map((c, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-foreground">{c.name}</span>
                    {c.website !== 'unknown' && (
                      <a
                        href={c.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-electric-blue hover:underline truncate max-w-[180px]"
                      >
                        {c.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                  <p className="text-xs">
                    <span className="text-muted-foreground">Differentiator:</span>{' '}
                    <span className="text-foreground">{c.differentiator}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : hasCompetitors ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You&apos;ve listed {companyProfile?.competitors?.length} competitor{(companyProfile?.competitors?.length ?? 0) > 1 ? 's' : ''}:
                {' '}{companyProfile?.competitors?.join(', ')}
              </p>
              <Button
                onClick={handleRefreshCompetitors}
                disabled={isPending}
                size="sm"
              >
                {activeRefresh === 'competitors' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing competitors...
                  </>
                ) : (
                  <>
                    <Swords className="h-4 w-4 mr-2" />
                    Analyze Competitors
                  </>
                )}
              </Button>
            </div>
          ) : (
            <EmptyFieldHint>
              Add your competitors in <strong>Settings &gt; Company &gt; Business Model</strong> to
              get competitive intelligence from your specialists.
            </EmptyFieldHint>
          )}
        </IntelCard>

        {/* ─── Data Completeness ───────────────────────────────── */}
        <IntelCard
          icon={BookOpen}
          title="Data Completeness"
          accentColor="text-chart-5"
          className="lg:col-span-2"
        >
          <DataCompletenessGrid
            companyProfile={companyProfile}
            purposeData={purposeData}
            companyIntel={companyIntel}
            founderProfile={founderProfile}
            hasTeam={teamCount > 1}
          />
        </IntelCard>
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────

function IntelCard({
  icon: Icon,
  title,
  accentColor,
  action,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  accentColor: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className={`h-4 w-4 ${accentColor}`} />
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
      </CardContent>
    </Card>
  )
}

function DataRow({
  label,
  value,
  icon: Icon,
  isLink,
}: {
  label: string
  value: string
  icon?: LucideIcon
  isLink?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-electric-blue hover:underline break-all"
        >
          {value}
        </a>
      ) : (
        <p className="text-sm text-foreground leading-relaxed">{value}</p>
      )}
    </div>
  )
}

function EmptyFieldHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3">
      <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  )
}

function DataCompletenessGrid({
  companyProfile,
  purposeData,
  companyIntel,
  founderProfile,
  hasTeam,
}: {
  companyProfile: CompanyProfile | null
  purposeData: FoundryPurposeData | null
  companyIntel: CompanyIntelligence | null
  founderProfile: IntelligenceContentProps['founderProfile']
  hasTeam: boolean
}) {
  const checks: Array<{
    label: string
    status: 'complete' | 'partial' | 'missing'
    hint?: string
  }> = [
    {
      label: 'Company name & sector',
      status: companyProfile ? 'complete' : 'missing',
      hint: 'Settings > Company',
    },
    {
      label: 'Company website',
      status: companyProfile?.website ? 'complete' : 'missing',
      hint: 'Settings > Company',
    },
    {
      label: 'Purpose / Mission / Vision',
      status: purposeData?.purpose ? (purposeData.questionnaire ? 'complete' : 'partial') : 'missing',
      hint: 'Company Settings',
    },
    {
      label: 'Founder profile',
      status: founderProfile.full_name && founderProfile.bio ? 'complete'
        : founderProfile.full_name ? 'partial' : 'missing',
      hint: 'My Profile',
    },
    {
      label: 'Professional background',
      status: founderProfile.professional_background?.summary ? 'complete' : 'missing',
      hint: 'My Profile > Background step',
    },
    {
      label: 'Website intelligence',
      status: companyIntel?.website_summary ? 'complete' : 'missing',
      hint: 'Click Refresh above',
    },
    {
      label: 'Competitors',
      status: companyIntel?.competitors?.length
        ? 'complete'
        : companyProfile?.competitors?.length
        ? 'partial'
        : 'missing',
      hint: 'Settings > Company > Business Model',
    },
    {
      label: 'Team members',
      status: hasTeam ? 'complete' : 'missing',
      hint: 'Invite team members',
    },
  ]

  const completeCount = checks.filter(c => c.status === 'complete').length
  const totalCount = checks.length
  const pct = Math.round((completeCount / totalCount) * 100)

  return (
    <div className="space-y-4">
      {/* Progress summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground font-medium">
          {completeCount} of {totalCount} data sources complete ({pct}%)
        </p>
        <StatusBadge
          status={pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error'}
          size="sm"
        >
          {pct >= 80 ? 'Excellent' : pct >= 50 ? 'Good start' : 'Needs data'}
        </StatusBadge>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-international-orange transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-2 text-sm">
            {check.status === 'complete' ? (
              <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
            ) : check.status === 'partial' ? (
              <Clock className="h-4 w-4 text-status-warning flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
            )}
            <span className={check.status === 'complete' ? 'text-foreground' : 'text-muted-foreground'}>
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
