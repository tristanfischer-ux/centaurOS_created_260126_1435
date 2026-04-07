/**
 * @file ContactDetailDialog.tsx
 *
 * @description Modal overlay for viewing full contact details from the contacts
 * directory. Shows identity, firm link, contact info (tier-gated), bio, warm
 * intro path, outreach status, and notes.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getContactById } from '@/actions/investors'
import type { ContactDetail } from '@/actions/investors'
import {
  ExternalLink,
  Linkedin,
  Mail,
  Shield,
  Building2,
  User,
  FileText,
  Handshake,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ContactDetailDialogProps {
  contactId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContactDetailDialog({ contactId, open, onOpenChange }: ContactDetailDialogProps) {
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contactId || !open) return
    let cancelled = false
    setLoading(true)
    setContact(null)

    getContactById(contactId)
      .then(data => { if (!cancelled) setContact(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [contactId, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {loading && (
          <>
            <DialogHeader>
              <Skeleton className="h-6 w-48" />
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-4 w-48" />
            </div>
          </>
        )}

        {!loading && !contact && (
          <>
            <DialogHeader>
              <DialogTitle>Contact not found</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">This contact could not be loaded.</p>
          </>
        )}

        {!loading && contact && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-muted p-2">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg">{contact.full_name}</DialogTitle>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {contact.title && (
                      <span className="text-sm text-muted-foreground">{contact.title}</span>
                    )}
                    {contact.seniority && (
                      <Badge variant="outline" className="text-[10px]">{contact.seniority}</Badge>
                    )}
                    {contact.is_decision_maker && (
                      <Badge variant="success" className="text-[10px] gap-1">
                        <Shield className="h-2.5 w-2.5" /> Decision Maker
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Firm */}
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <Link
                  href={`/investors/${contact.listing_id}`}
                  className="text-sm text-international-orange hover:underline font-medium"
                  onClick={() => onOpenChange(false)}
                >
                  {contact.firm_name}
                </Link>
              </div>

              {/* Contact Info */}
              <div className="space-y-2">
                {contact.email ? (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-sm text-international-orange hover:underline"
                    >
                      {contact.email}
                    </a>
                    {contact.email_verified && (
                      <Badge variant="success" className="text-[10px]">Verified</Badge>
                    )}
                  </div>
                ) : contact.has_email ? (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground" style={{ filter: 'blur(4px)' }}>name@example.com</span>
                    <Badge variant="outline" className="text-[10px] border-international-orange text-international-orange">Pro</Badge>
                  </div>
                ) : null}

                {contact.linkedin_url && (
                  <div className="flex items-center gap-2">
                    <Linkedin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-international-orange hover:underline inline-flex items-center gap-1"
                    >
                      LinkedIn <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Bio */}
              {contact.deep_bio ? (
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Bio</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{contact.deep_bio}</p>
                </div>
              ) : contact.has_deep_bio ? (
                <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Bio available with</span>
                  <Badge variant="outline" className="text-[10px] border-international-orange text-international-orange">Pro</Badge>
                </div>
              ) : null}

              {/* Warm Intro Path */}
              {contact.warm_intro_path && (
                <div className="bg-success/5 rounded-lg p-3 border border-success/20">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Handshake className="h-3.5 w-3.5 text-success" />
                    <span className="text-xs font-medium text-success">Warm Introduction Path</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{contact.warm_intro_path}</p>
                </div>
              )}

              {/* Outreach Status */}
              {contact.outreach_status && contact.outreach_status !== 'not_started' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Outreach:</span>
                  <Badge variant={
                    contact.outreach_status === 'closed_won' ? 'success' :
                    contact.outreach_status === 'closed_lost' || contact.outreach_status === 'not_relevant' ? 'destructive' :
                    'outline'
                  } className="text-xs">
                    {contact.outreach_status.replace(/_/g, ' ')}
                  </Badge>
                  {contact.last_contacted_at && (
                    <span className="text-[10px] text-muted-foreground">
                      Last: {new Date(contact.last_contacted_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}

              {/* Notes */}
              {contact.notes && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Notes</span>
                  <p className="text-sm text-foreground mt-1 leading-relaxed">{contact.notes}</p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
