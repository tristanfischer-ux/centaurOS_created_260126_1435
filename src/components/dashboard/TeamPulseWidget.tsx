'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Users, Activity, Focus } from 'lucide-react'
import { usePresenceContext } from '@/components/PresenceProvider'
import { PresenceIndicator, getPresenceColor, getPresenceLabel } from '@/components/PresenceIndicator'
import { cn } from '@/lib/utils'

function getInitials(name: string | null) {
    if (!name) return '??'
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

interface TeamPulseWidgetProps {
    members: {
        id: string
        full_name: string | null
        role: string
    }[]
}

export function TeamPulseWidget({ members }: TeamPulseWidgetProps) {
    const { teamPresence, getPresenceForUser } = usePresenceContext()

    // Group members by status
    const onlineMembers = members.filter(m => {
        const status = getPresenceForUser(m.id)?.status
        return status === 'online'
    })
    
    const focusMembers = members.filter(m => {
        const status = getPresenceForUser(m.id)?.status
        return status === 'focus'
    })
    
    const awayMembers = members.filter(m => {
        const status = getPresenceForUser(m.id)?.status
        return status === 'away'
    })

    const onlineCount = onlineMembers.length
    const focusCount = focusMembers.length
    const awayCount = awayMembers.length
    const offlineCount = members.length - onlineCount - focusCount - awayCount

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Activity className="h-4 w-4 text-slate-600" />
                            Team Pulse
                        </CardTitle>
                        <CardDescription>Real-time team availability</CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                        {onlineCount + focusCount} active
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Status summary */}
                <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-slate-600">{onlineCount} online</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-purple-500" />
                        <span className="text-slate-600">{focusCount} focus</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-yellow-500" />
                        <span className="text-slate-600">{awayCount} away</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-gray-400" />
                        <span className="text-slate-600">{offlineCount} offline</span>
                    </div>
                </div>

                {/* Active members (online + focus) */}
                {(onlineMembers.length > 0 || focusMembers.length > 0) && (
                    <div className="space-y-2">
                        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                            Active Now
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {[...onlineMembers, ...focusMembers].slice(0, 8).map(member => {
                                const presence = getPresenceForUser(member.id)
                                const status = presence?.status || 'offline'
                                
                                return (
                                    <div 
                                        key={member.id} 
                                        className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                                    >
                                        <div className="relative">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="text-xs bg-slate-200 text-slate-600">
                                                    {getInitials(member.full_name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <PresenceIndicator 
                                                status={status} 
                                                presence={presence}
                                                size="sm"
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <span className="text-xs font-medium text-slate-700 truncate block">
                                                {member.full_name?.split(' ')[0]}
                                            </span>
                                            {status === 'focus' && (
                                                <span className="text-[10px] text-purple-600 flex items-center gap-0.5">
                                                    <Focus className="h-2.5 w-2.5" />
                                                    Focus
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        {(onlineMembers.length + focusMembers.length) > 8 && (
                            <p className="text-xs text-slate-400">
                                +{(onlineMembers.length + focusMembers.length) - 8} more
                            </p>
                        )}
                    </div>
                )}

                {/* Empty state */}
                {onlineMembers.length === 0 && focusMembers.length === 0 && (
                    <div className="text-center py-4">
                        <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                        <p className="text-sm text-slate-500">No team members active right now</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
