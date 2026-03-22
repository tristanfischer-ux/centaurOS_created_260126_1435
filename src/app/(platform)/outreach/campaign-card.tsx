'use client'

/**
 * @file campaign-card.tsx — Campaign card for the outreach hub grid.
 */

import Link from 'next/link'
import { MoreHorizontal, Trash2, Users, Mail } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CAMPAIGN_STATUS_MAP } from '@/types/outreach'
import type { Campaign } from '@/types/outreach'

interface CampaignCardProps {
    campaign: Campaign
    onDelete: () => void
}

export function CampaignCard({ campaign, onDelete }: CampaignCardProps) {
    const statusMeta = CAMPAIGN_STATUS_MAP[campaign.status]
    const contactCount = campaign.contact_count ?? 0
    const sequencedCount = campaign.sequenced_count ?? 0
    const progressPct = contactCount > 0 ? Math.round((sequencedCount / contactCount) * 100) : 0

    return (
        <Link href={`/outreach/${campaign.id}`}>
            <Card className="group hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="space-y-1 min-w-0 flex-1">
                        <h3 className="font-medium text-foreground truncate pr-2">
                            {campaign.name}
                        </h3>
                        <StatusBadge status={statusMeta.variant} dot>
                            {statusMeta.label}
                        </StatusBadge>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.preventDefault()}
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => {
                                    e.preventDefault()
                                    onDelete()
                                }}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </CardHeader>
                <CardContent className="space-y-3">
                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {contactCount} contacts
                        </span>
                        <span className="flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {sequencedCount} sequenced
                        </span>
                    </div>

                    {/* Progress bar */}
                    {contactCount > 0 && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Sequenced</span>
                                <span>{progressPct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-international-orange transition-all duration-500"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Tone + last updated */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="capitalize">{campaign.tone} tone</span>
                        <span>{new Date(campaign.updated_at).toLocaleDateString()}</span>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
