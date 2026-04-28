'use client'

/**
 * @file contact-detail-dialog.tsx
 *
 * Modal for viewing the full detail of a firm partner / key person. Reads
 * the already-loaded contact object (passed in from KeyPeopleCard) so no
 * extra server round-trip is needed for the fields we already have.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Linkedin, Mail, User } from 'lucide-react'

export type FirmContact = {
  id: string
  name: string
  title: string | null
  email: string | null
  linkedin_url: string | null
  seniority?: string | null
}

export function ContactDetailDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: FirmContact | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="default"
        aria-label={contact ? `${contact.name} contact details` : 'Contact details'}
      >
        {contact && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-muted p-2">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg">{contact.name}</DialogTitle>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {contact.title && (
                      <span className="text-sm text-muted-foreground">{contact.title}</span>
                    )}
                    {contact.seniority && (
                      <Badge variant="outline" className="text-[10px]">
                        {contact.seniority}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              {contact.email ? (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-sm text-international-orange hover:underline"
                  >
                    {contact.email}
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>No email on file</span>
                </div>
              )}

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

              {!contact.email && !contact.linkedin_url && (
                <p className="text-xs text-muted-foreground italic">
                  No contact channels recorded — check the firm website for this person's page.
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
