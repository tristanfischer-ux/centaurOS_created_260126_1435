"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
    Users,
    Search,
} from "lucide-react"

// ==========================================
// TYPES
// ==========================================

interface Member {
    id: string
    full_name: string | null
    role: string | null
    email: string | null
    foundry_name?: string
}

interface GuildNetworkProps {
    /** Guild community members */
    members: Member[]
}

// ==========================================
// HELPERS
// ==========================================

/**
 * Returns semantic badge classes based on user role.
 *
 * @param role - The user's Guild role
 * @returns Tailwind class string for the Badge component
 */
function getRoleBadgeClass(role: string | null): string {
    switch (role) {
        case 'Founder':
            return 'bg-chart-5/20 text-chart-5 border-chart-5/30'
        case 'Executive':
            return 'bg-status-warning-light text-status-warning-dark border-status-warning/30'
        case 'Apprentice':
            return 'bg-status-info-light text-status-info border-status-info/30'
        case 'AI_Agent':
            return 'bg-chart-5/20 text-chart-5 border-chart-5/30'
        default:
            return 'bg-muted text-muted-foreground border'
    }
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Guild Network member directory with search and filtering.
 *
 * @description Displays Guild members in a responsive grid with search
 * by name, role, or foundry. Each member card shows their avatar,
 * name, role badge, and foundry affiliation.
 *
 * @component
 *
 * @example
 * <GuildNetwork members={members} />
 */
export function GuildNetwork({ members }: GuildNetworkProps) {
    const [searchQuery, setSearchQuery] = useState("")

    const filteredMembers = searchQuery.trim()
        ? members.filter(m =>
            m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.role?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.foundry_name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : members

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Connect with other members of The Guild community.
                </p>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="guild-member-search"
                        placeholder="Search members..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                        aria-label="Search Guild members"
                    />
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredMembers.length === 0 ? (
                    <div className="col-span-full">
                        <EmptyState
                            icon={<Users className="h-8 w-8" />}
                            title={searchQuery ? "No Members Found" : "No Members Yet"}
                            description={searchQuery
                                ? `No members match "${searchQuery}". Try a different search.`
                                : "Be the first to join the Guild network."
                            }
                            className="border-2 border-dashed border-muted"
                        />
                    </div>
                ) : (
                    filteredMembers.map(member => (
                        <Card key={member.id} className="p-4 bg-card hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-3">
                                <UserAvatar
                                    name={member.full_name}
                                    role={member.role}
                                    size="lg"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">
                                        {member.full_name || "Unknown"}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge
                                            variant="secondary"
                                            className={`text-xs ${getRoleBadgeClass(member.role)}`}
                                        >
                                            {member.role || "Member"}
                                        </Badge>
                                    </div>
                                    {member.foundry_name && (
                                        <p className="text-xs text-muted-foreground mt-1 truncate">
                                            {member.foundry_name}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
