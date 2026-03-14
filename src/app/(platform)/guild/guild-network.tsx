"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/ui/empty-state"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Users,
    Search,
    MessageCircle,
    Award,
    ChevronDown,
    ChevronUp,
    Loader2,
} from "lucide-react"
import { startDirectMessage } from "@/actions/messaging"
import { createEndorsement } from "@/actions/endorsements"
import { toast } from "sonner"

// ==========================================
// TYPES
// ==========================================

interface Member {
    id: string
    full_name: string | null
    role: string | null
    email: string | null
    foundry_name?: string
    bio?: string | null
    skills?: string[]
    endorsement_count?: number
}

interface GuildNetworkProps {
    /** Guild community members */
    members: Member[]
    /** Current user's ID (to hide actions on self) */
    currentUserId?: string
    /** Whether current user is Executive/Founder (can endorse) */
    isExecutive?: boolean
}

// ==========================================
// HELPERS
// ==========================================

function getRoleBadgeClass(role: string | null): string {
    switch (role) {
        case 'Founder':
            return 'bg-chart-5/20 text-chart-5 border-chart-5/30'
        case 'Executive':
            return 'bg-status-warning-light text-status-warning-dark border-status-warning/30'
        case 'Supplier':
            return 'bg-blue-50 text-blue-600 border-blue-200'
        case 'Apprentice':
            return 'bg-status-info-light text-status-info border-status-info/30'
        case 'AI_Agent':
            return 'bg-chart-5/20 text-chart-5 border-chart-5/30'
        default:
            return 'bg-muted text-muted-foreground border'
    }
}

const ROLE_FILTERS = ['All', 'Founder', 'Executive', 'Apprentice', 'Supplier'] as const

// ==========================================
// COMPONENT
// ==========================================

/**
 * Guild Network member directory with search, role filters,
 * message/endorse actions, and expandable cards.
 */
export function GuildNetwork({ members, currentUserId, isExecutive }: GuildNetworkProps) {
    const router = useRouter()
    const [searchQuery, setSearchQuery] = useState("")
    const [roleFilter, setRoleFilter] = useState<string>("All")
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [endorseTarget, setEndorseTarget] = useState<Member | null>(null)
    const [endorseText, setEndorseText] = useState("")
    const [endorseRelationship, setEndorseRelationship] = useState("")
    const [isPending, startTransition] = useTransition()
    const [messagingId, setMessagingId] = useState<string | null>(null)

    const filteredMembers = members.filter(m => {
        // Role filter
        if (roleFilter !== 'All' && m.role !== roleFilter) return false
        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            return (
                m.full_name?.toLowerCase().includes(q) ||
                m.role?.toLowerCase().includes(q) ||
                m.foundry_name?.toLowerCase().includes(q)
            )
        }
        return true
    })

    const handleMessage = async (memberId: string) => {
        setMessagingId(memberId)
        try {
            const result = await startDirectMessage(memberId)
            if ('error' in result) {
                toast.error(result.error)
                return
            }
            router.push('/updates')
        } catch {
            toast.error('Failed to start conversation')
        } finally {
            setMessagingId(null)
        }
    }

    const handleEndorse = () => {
        if (!endorseTarget || !endorseText.trim()) return
        startTransition(async () => {
            const result = await createEndorsement(
                endorseTarget.id,
                endorseText.trim(),
                endorseRelationship.trim() || undefined
            )
            if (result.success) {
                toast.success(`Endorsement sent to ${endorseTarget.full_name}`)
                setEndorseTarget(null)
                setEndorseText("")
                setEndorseRelationship("")
            } else {
                toast.error(result.error || 'Failed to endorse')
            }
        })
    }

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

            {/* Role Filter Pills */}
            <div className="flex flex-wrap gap-2">
                {ROLE_FILTERS.map(role => (
                    <Button
                        key={role}
                        variant={roleFilter === role ? "default" : "outline"}
                        size="sm"
                        onClick={() => setRoleFilter(role)}
                        className="text-xs"
                    >
                        {role === 'All' ? 'All Roles' : `${role}s`}
                    </Button>
                ))}
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
                    filteredMembers.map(member => {
                        const isExpanded = expandedId === member.id
                        const isSelf = member.id === currentUserId

                        return (
                            <Card
                                key={member.id}
                                className="p-4 bg-card hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => setExpandedId(isExpanded ? null : member.id)}
                            >
                                <div className="flex items-start gap-3">
                                    <UserAvatar
                                        name={member.full_name}
                                        role={member.role}
                                        size="lg"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-foreground truncate">
                                                {member.full_name || "Unknown"}
                                            </p>
                                            {isExpanded ? (
                                                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                            )}
                                        </div>
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

                                {/* Expanded Content */}
                                {isExpanded && (
                                    <div className="mt-4 pt-4 border-t border-muted space-y-3" onClick={e => e.stopPropagation()}>
                                        {member.bio && (
                                            <p className="text-sm text-muted-foreground">{member.bio}</p>
                                        )}
                                        {member.skills && member.skills.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {member.skills.map((skill, idx) => (
                                                    <Badge key={idx} variant="secondary" className="text-xs bg-muted">
                                                        {skill}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                        {!isSelf && (
                                            <div className="flex items-center gap-2 pt-1">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleMessage(member.id)}
                                                    disabled={messagingId === member.id}
                                                    className="gap-1.5"
                                                >
                                                    {messagingId === member.id ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                    )}
                                                    Message
                                                </Button>
                                                {isExecutive && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setEndorseTarget(member)}
                                                        className="gap-1.5"
                                                    >
                                                        <Award className="h-3.5 w-3.5" /> Endorse
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        )
                    })
                )}
            </div>

            {/* Endorse Dialog */}
            <Dialog open={!!endorseTarget} onOpenChange={(open) => {
                if (!open) {
                    setEndorseTarget(null)
                    setEndorseText("")
                    setEndorseRelationship("")
                }
            }}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle>Endorse {endorseTarget?.full_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="endorse-text">
                                Testimonial <span className="text-destructive" aria-label="required">*</span>
                            </Label>
                            <Textarea
                                id="endorse-text"
                                placeholder="What makes this person stand out?"
                                value={endorseText}
                                onChange={e => setEndorseText(e.target.value)}
                                rows={3}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="endorse-relationship">
                                Relationship <span className="text-muted-foreground text-xs">(optional)</span>
                            </Label>
                            <Input
                                id="endorse-relationship"
                                placeholder="e.g., Mentor, Project Lead, Colleague"
                                value={endorseRelationship}
                                onChange={e => setEndorseRelationship(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setEndorseTarget(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleEndorse}
                            disabled={!endorseText.trim() || isPending}
                        >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send Endorsement
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
