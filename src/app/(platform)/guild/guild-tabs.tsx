"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { UserAvatar } from "@/components/ui/user-avatar"
import { 
    MapPin, 
    Lock, 
    Calendar, 
    Users
} from "lucide-react"
interface GuildEvent {
    id: string
    title: string
    description: string | null
    event_date: string
    location_geo: string | null
    is_executive_only: boolean
}

interface Member {
    id: string
    full_name: string | null
    role: string | null
    email: string | null
    foundry_name?: string
}

interface GuildTabsProps {
    events: GuildEvent[]
    members: Member[]
    /** @deprecated No longer needed -- events are pre-filtered server-side */
    isExecutive?: boolean
}

export function GuildTabs({ events, members }: GuildTabsProps) {
    const getRoleBadgeClass = (role: string | null) => {
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

    return (
        <Tabs defaultValue="events" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
                <TabsTrigger value="events" className="gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="hidden sm:inline">Events</span>
                </TabsTrigger>
                <TabsTrigger value="network" className="gap-2">
                    <Users className="h-4 w-4" />
                    <span className="hidden sm:inline">Members</span>
                </TabsTrigger>
            </TabsList>

            {/* Events Tab */}
            <TabsContent value="events" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Networking events and workshops for the Guild community.
                </p>

                {/* Events are pre-filtered server-side -- executive-only events
                    are removed before reaching the client for non-executives */}
                <div className="grid gap-4">
                    {events.length === 0 ? (
                        <EmptyState
                            icon={<Calendar className="h-8 w-8" />}
                            title="No Upcoming Events"
                            description="Check back soon for new networking opportunities."
                            className="border-2 border-dashed border-muted"
                        />
                    ) : (
                        events.map(event => (
                            <Card key={event.id} className="bg-card flex flex-col md:flex-row overflow-hidden">
                                <div className="bg-muted p-6 flex flex-col items-center justify-center min-w-[120px]">
                                    <span className="text-2xl font-bold text-foreground">
                                        {new Date(event.event_date).getDate()}
                                    </span>
                                    <span className="text-sm text-muted-foreground uppercase">
                                        {new Date(event.event_date).toLocaleString('default', { month: 'short' })}
                                    </span>
                                </div>
                                <div className="flex-1 p-6">
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        <Badge variant="secondary" className="text-muted-foreground">
                                            <MapPin className="mr-1 h-3 w-3" /> {event.location_geo || "TBD"}
                                        </Badge>
                                        {event.is_executive_only && (
                                            <Badge className="bg-status-warning-light text-status-warning-dark border border-status-warning/30">
                                                <Lock className="mr-1 h-3 w-3" /> Executive Only
                                            </Badge>
                                        )}
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground mb-2">{event.title}</h3>
                                    <p className="text-muted-foreground text-sm">{event.description}</p>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="network" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Guild community members.
                </p>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {members.length === 0 ? (
                        <div className="col-span-full">
                            <EmptyState
                                icon={<Users className="h-8 w-8" />}
                                title="No Members Yet"
                                description="Be the first to join the Guild network."
                                className="border-2 border-dashed border-muted"
                            />
                        </div>
                    ) : (
                        members.map(member => (
                            <Card key={member.id} className="p-4 bg-card">
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
            </TabsContent>
        </Tabs>
    )
}
