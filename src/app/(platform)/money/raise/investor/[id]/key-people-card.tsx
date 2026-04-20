'use client'

/**
 * @file key-people-card.tsx
 *
 * Renders partners / key people for an investor firm. Click a row to open
 * the ContactDetailDialog. Data comes from `listInvestorContactsByFirm`
 * in the server action layer — passed down from the page as a prop.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Mail, Linkedin, ChevronRight } from 'lucide-react'
import { ContactDetailDialog, type FirmContact } from './contact-detail-dialog'

export function KeyPeopleCard({ contacts }: { contacts: FirmContact[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = contacts.find((c) => c.id === selectedId) ?? null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            Key people {contacts.length > 0 && `(${contacts.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No partners found — check the firm website for the team page.
            </p>
          ) : (
            <ul className="space-y-2">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <article
                    className="w-full rounded-md border bg-card p-3 transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-international-orange/40"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(contact.id)}
                      className="flex w-full items-start gap-3 text-left"
                      aria-label={`View details for ${contact.name}`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {contact.name}
                          </h3>
                          {contact.seniority && (
                            <Badge variant="outline" className="text-[10px]">
                              {contact.seniority}
                            </Badge>
                          )}
                        </div>
                        {contact.title && (
                          <p className="text-xs text-muted-foreground truncate">
                            {contact.title}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          {contact.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" aria-hidden /> Email
                            </span>
                          )}
                          {contact.linkedin_url && (
                            <span className="inline-flex items-center gap-1">
                              <Linkedin className="h-3 w-3" aria-hidden /> LinkedIn
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ContactDetailDialog
        contact={selected}
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      />
    </>
  )
}
