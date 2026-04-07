"use client"

/**
 * @file KeyPeopleSection.tsx
 *
 * @description Client wrapper for Key People section on investor detail page.
 * Manages ContactDetailDialog state so clicking a PartnerCard opens the detail modal.
 */

import { useState } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Users } from 'lucide-react'
import { PartnerCard } from './PartnerCard'
import { ContactDetailDialog } from './ContactDetailDialog'
import type { InvestorContact, InvestorTierAccess } from '@/actions/investors'

interface KeyPeopleSectionProps {
  contacts: InvestorContact[]
  access: InvestorTierAccess
}

export function KeyPeopleSection({ contacts, access }: KeyPeopleSectionProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  return (
    <>
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
              <PartnerCard
                key={contact.id}
                contact={contact}
                access={access}
                onViewDetails={() => setSelectedContactId(contact.id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <ContactDetailDialog
        contactId={selectedContactId}
        open={!!selectedContactId}
        onOpenChange={(open) => { if (!open) setSelectedContactId(null) }}
      />
    </>
  )
}
