/**
 * @file PartnerCard.tsx
 *
 * @description Individual partner display with conditional email/bio rendering
 * based on tier access.
 */

import { Badge } from '@/components/ui/badge'
import { Lock, Linkedin, Link2, Mail, User } from 'lucide-react'
import type { InvestorContact, InvestorTierAccess } from '@/actions/investors'

interface PartnerCardProps {
  contact: InvestorContact
  access: InvestorTierAccess
  onViewDetails?: () => void
}

function formatSeniority(s: string): string {
  return s.trim().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  // SECURITY: Block non-http(s) schemes (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''
  return `https://${url}`
}

// INTENT: Tier-aware email verification badge. The `email_tier` column tells us how an
// email was verified (corresponded > Hunter > NeverBounce-valid > NeverBounce-catchall =
// sendable; unknown/unverified/generic = uncertain; invalid/disposable/bounced = bad).
// DECISION: Inlined here rather than extracted to a shared util because both call sites
// (PartnerCard, ContactDetailDialog) want slightly different copy and sizing.
function renderTierBadge(tier: string | null, verified: boolean | null): React.ReactElement | null {
  // Sendable
  if (tier === 'corresponded' || tier === 'hunter_verified' || tier === 'neverbounce_valid') {
    return <Badge variant="success" className="text-[10px] ml-1 py-0">Verified</Badge>
  }
  if (tier === 'neverbounce_catchall') {
    return <Badge variant="warning" className="text-[10px] ml-1 py-0">Catchall</Badge>
  }
  // Uncertain
  if (tier === 'neverbounce_unknown') {
    return <Badge variant="warning" className="text-[10px] ml-1 py-0">Unknown</Badge>
  }
  if (tier === 'unverified' || tier === 'generic_blocked') {
    return <Badge variant="warning" className="text-[10px] ml-1 py-0">Unverified</Badge>
  }
  // Bad
  if (tier === 'neverbounce_invalid' || tier === 'bounced') {
    return <Badge variant="destructive" className="text-[10px] ml-1 py-0">Invalid</Badge>
  }
  if (tier === 'neverbounce_disposable') {
    return <Badge variant="destructive" className="text-[10px] ml-1 py-0">Disposable</Badge>
  }
  // Fallback: legacy verified flag without a tier classification
  if (!tier && verified) {
    return <Badge variant="success" className="text-[10px] ml-1 py-0">Verified</Badge>
  }
  // No tier and no verification — render nothing
  return null
}

export function PartnerCard({ contact, access, onViewDetails }: PartnerCardProps) {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg bg-muted/50 ${onViewDetails ? 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 hover:bg-muted' : ''}`}
      onClick={onViewDetails}
      role={onViewDetails ? 'button' : undefined}
      tabIndex={onViewDetails ? 0 : undefined}
      onKeyDown={onViewDetails ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewDetails() } } : undefined}
    >
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

        {/* Focus areas from notes */}
        {contact.notes && (
          <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{contact.notes}</p>
        )}

        <div className="flex items-center gap-3 mt-1.5">
          {contact.linkedin_url && ensureProtocol(contact.linkedin_url) && (
            <a
              href={ensureProtocol(contact.linkedin_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-international-orange hover:underline text-xs flex items-center gap-1"
            >
              <Linkedin className="h-3 w-3" />
              LinkedIn
            </a>
          )}

          {/* Warm intro path (starter+) */}
          {contact.warm_intro_path && access.contactsVisible && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3 text-success" />
              Warm intro: {contact.warm_intro_path}
            </span>
          )}

          {/* Email — visible or locked (only show lock if contact actually has an email) */}
          {access.deepAccess && contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="text-international-orange hover:underline text-xs flex items-center gap-1"
            >
              <Mail className="h-3 w-3" />
              {contact.email}
              {renderTierBadge(contact.email_tier, contact.email_verified)}
            </a>
          ) : !access.deepAccess && contact.has_email ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />
              <Lock className="h-2.5 w-2.5" />
              <span>Pro</span>
            </span>
          ) : null}
        </div>

        {/* Deep bio — visible or locked indicator (only show lock if bio actually exists) */}
        {access.deepAccess && contact.deep_bio ? (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-3">
            {contact.deep_bio}
          </p>
        ) : !access.deepAccess && contact.has_deep_bio ? (
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
            <Lock className="h-2.5 w-2.5" />
            Deep bio available on Professional plan
          </p>
        ) : null}
      </div>
    </div>
  )
}
