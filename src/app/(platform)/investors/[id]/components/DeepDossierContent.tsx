/**
 * @file DeepDossierContent.tsx
 *
 * @description Renders the deep-dossier profile_json from apex-outreach's
 * investor_deep_profiles table. Server-rendered — the parent page fetches
 * the profile and passes it as a prop.
 *
 * Sections: verification badge, investment thesis (deep version),
 * fund & team, recent investments, fact checks, generation timestamp.
 */

import { Badge } from '@/components/ui/badge'
import type { ApexInvestorDeepProfile } from '@/lib/supabase/apex-client'

type DeepProfile = ApexInvestorDeepProfile['profile_json']

interface DeepDossierContentProps {
  profile: DeepProfile | null
  updatedAt?: string
}

export function DeepDossierContent({ profile, updatedAt }: DeepDossierContentProps) {
  if (!profile) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No deep dossier generated yet — the synthesiser writes this once the
        investor has been through the research pipeline.
      </p>
    )
  }

  const thesis = profile.investment_thesis
  const fundDetails = profile.fund_details as Record<string, string | number | null> | undefined
  const team = profile.team
  const recentInv = profile.recent_investments
  const factChecks = profile.fact_checks
  const qualityAssessment = profile.quality_assessment as Record<string, string> | undefined
  const sources = profile.sources

  const hasAnything =
    Boolean(thesis) ||
    Boolean(fundDetails && Object.keys(fundDetails).length > 0) ||
    Boolean(team && team.length > 0) ||
    Boolean(recentInv && recentInv.length > 0) ||
    Boolean(factChecks && factChecks.length > 0) ||
    Boolean(qualityAssessment && Object.keys(qualityAssessment).length > 0)

  if (!hasAnything) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Dossier exists but contains no structured sections yet.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {/* Verification badge */}
      {qualityAssessment?.verification_level && (
        <div>
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {qualityAssessment.verification_level}
            {qualityAssessment.source_reliability
              ? ` · ${qualityAssessment.source_reliability}`
              : ''}
          </span>
        </div>
      )}

      {/* Investment thesis (deep version) */}
      {thesis && (
        <div>
          <DossierLabel>Investment thesis</DossierLabel>
          <p className="text-sm text-foreground leading-relaxed">{thesis}</p>
        </div>
      )}

      {/* Fund details */}
      {fundDetails && Object.keys(fundDetails).length > 0 && (
        <div>
          <DossierLabel>Fund details</DossierLabel>
          <div className="space-y-1.5">
            {Object.entries(fundDetails).map(([key, value]) =>
              value != null ? (
                <div key={key} className="flex items-baseline gap-3 text-sm">
                  <span className="text-muted-foreground min-w-[120px] capitalize">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-foreground font-medium">{String(value)}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Team */}
      {team && team.length > 0 && (
        <div>
          <DossierLabel>Team · {team.length}</DossierLabel>
          <ul className="space-y-2">
            {team.map((member, idx) => (
              <li key={`${member.name}-${idx}`} className="text-sm">
                <span className="font-medium text-foreground">{member.name}</span>
                {member.title && (
                  <span className="text-muted-foreground"> · {member.title}</span>
                )}
                {member.bio && (
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    {member.bio}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent investments */}
      {recentInv && recentInv.length > 0 && (
        <div>
          <DossierLabel>Recent investments · {recentInv.length}</DossierLabel>
          <ul className="divide-y divide-border">
            {recentInv.map((inv, idx) => (
              <li
                key={`${inv.company}-${idx}`}
                className="flex items-center justify-between py-1.5 text-sm"
              >
                <span className="font-medium text-foreground">
                  {inv.company ?? 'Unnamed company'}
                </span>
                <span className="text-[11px] text-muted-foreground text-right">
                  {[inv.stage, inv.amount, inv.date].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fact checks */}
      {factChecks && factChecks.length > 0 && (
        <div>
          <DossierLabel>Fact checks</DossierLabel>
          <div className="flex flex-wrap gap-1.5">
            {factChecks.map((check, idx) => (
              <Badge
                key={`${check.claim}-${idx}`}
                variant={check.status === 'verified' ? 'success' : check.status === 'disputed' ? 'destructive' : 'outline'}
                className="text-[10px]"
              >
                {check.claim} · {check.status}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {sources && sources.length > 0 && (
        <div>
          <DossierLabel>Sources · {sources.length}</DossierLabel>
          <ul className="space-y-1">
            {sources.map((src, idx) => {
              const isUrl = src.startsWith('http')
              return (
                <li key={idx} className="text-xs text-muted-foreground">
                  {isUrl ? (
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-international-orange hover:underline"
                    >
                      {src.replace(/^https?:\/\//, '').split('/')[0]} ↗
                    </a>
                  ) : (
                    src
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Timestamp */}
      {updatedAt && (
        <p className="text-[11px] text-muted-foreground mt-3">
          Generated {new Date(updatedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })} by the deep-dossier synthesiser.
        </p>
      )}
    </div>
  )
}

function DossierLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
      {children}
    </p>
  )
}
