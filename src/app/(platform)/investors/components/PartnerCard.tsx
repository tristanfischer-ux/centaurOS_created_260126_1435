/**
 * @file PartnerCard.tsx
 *
 * @description Individual partner display with conditional email/bio rendering
 * based on tier access.
 */

import { Badge } from '@/components/ui/badge'
import { Lock, Linkedin, Mail, User } from 'lucide-react'
import type { InvestorContact, InvestorTierAccess } from '@/actions/investors'

interface PartnerCardProps {
  contact: InvestorContact
  access: InvestorTierAccess
}

function formatSeniority(s: string): string {
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function PartnerCard({ contact, access }: PartnerCardProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
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
          <p className="text-xs text-muted-foreground mt-1 italic">{contact.notes}</p>
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

          {/* Email — visible or locked */}
          {access.deepAccess && contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="text-international-orange hover:underline text-xs flex items-center gap-1"
            >
              <Mail className="h-3 w-3" />
              {contact.email}
              {contact.email_verified && (
                <Badge variant="outline" className="text-[10px] ml-1 py-0">Verified</Badge>
              )}
            </a>
          ) : !access.deepAccess ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />
              <Lock className="h-2.5 w-2.5" />
              <span>Pro</span>
            </span>
          ) : null}
        </div>

        {/* Deep bio — visible or locked indicator */}
        {access.deepAccess && contact.deep_bio ? (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-3">
            {contact.deep_bio}
          </p>
        ) : !access.deepAccess && contact.full_name ? (
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
            <Lock className="h-2.5 w-2.5" />
            Deep bio available on Professional plan
          </p>
        ) : null}
      </div>
    </div>
  )
}
