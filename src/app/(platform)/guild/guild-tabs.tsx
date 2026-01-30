"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
    isExecutive: boolean
}

export function GuildTabs({ events, members, isExecutive }: GuildTabsProps) {
    const getRoleBadgeClass = (role: string | null) => {
        switch (role) {
            case 'Founder':
                return 'bg-purple-100 text-purple-700 border-purple-200'
            case 'Executive':
                return 'bg-amber-100 text-amber-700 border-amber-200'
            case 'Apprentice':
                return 'bg-blue-100 text-blue-700 border'
            case 'AI_Agent':
                return 'bg-indigo-100 text-indigo-700 border-indigo-200'
            default:
                return 'bg-muted text-muted-foreground border-slate-200'
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
                    <span className="hidden sm:inline">Network</span>
                </TabsTrigger>
            </TabsList>

            {/* Events Tab */}
            <TabsContent value="events" className="space-y-4">
                <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                        Offline-to-Online (O2O) networking events and workshops.
                    </p>
                    <div className="text-xs text-international-orange border border-orange-200 bg-orange-50 px-3 py-1 rounded-full flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Showing events near you
                    </div>
                </div>

                <div className="grid gap-4">
                    {events.length === 0 ? (
                        <EmptyState
                            icon={<Calendar className="h-8 w-8" />}
                            title="No Upcoming Events"
                            description="There are no events visible to your tier at this time. Check back soon for new networking opportunities."
                            className="border-2 border-dashed border-slate-200"
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
                                            <Badge className="bg-amber-100 text-amber-700 border border-amber-200">
                                                <Lock className="mr-1 h-3 w-3" /> Executive Only
                                            </Badge>
                                        )}
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground mb-2">{event.title}</h3>
                                    <p className="text-muted-foreground text-sm mb-4">{event.description}</p>
                                    <Button size="sm" variant="default">
                                        RSVP
                                    </Button>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            </TabsContent>

            {/* Network Tab */}
            <TabsContent value="network" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Connect with other members of the Centaur community.
                </p>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {members.length === 0 ? (
                        <div className="col-span-full">
                            <EmptyState
                                icon={<Users className="h-8 w-8" />}
                                title="No Members Yet"
                                description="Be the first to join the Guild network."
                                className="border-2 border-dashed border-slate-200"
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
                                                className={`text-[10px] ${getRoleBadgeClass(member.role)}`}
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
