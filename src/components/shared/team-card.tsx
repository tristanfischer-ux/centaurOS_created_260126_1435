"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Users, Briefcase } from "lucide-react"

interface TeamMember {
    id: string
    full_name: string | null
    role: string | null
    email: string | null
}

interface TeamCardProps {
    id: string
    name: string
    is_auto_generated?: boolean
    members: TeamMember[]
    tasksCount?: number
    compact?: boolean
}

export function TeamCard({
    id,
    name,
    is_auto_generated = false,
    members,
    tasksCount = 0,
    compact = false
}: TeamCardProps) {
    const displayMembers = members.slice(0, 4)
    const remainingCount = members.length - 4

    if (compact) {
        return (
            <Link href={`/team?teamId=${id}`} className="block group">
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="relative flex -space-x-2">
                        {displayMembers.slice(0, 3).map((member, i) => (
                            <Avatar key={member.id} className="h-6 w-6 border-2 border-white" style={{ zIndex: 3 - i }}>
                                <AvatarFallback className="text-[10px] bg-slate-100">
                                    {member.full_name?.substring(0, 2).toUpperCase() || '?'}
                                </AvatarFallback>
                            </Avatar>
                        ))}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate group-hover:text-amber-600">
                            {name}
                        </div>
                        <div className="text-xs text-slate-500">{members.length} members</div>
                    </div>
                    {is_auto_generated && (
                        <Badge variant="secondary" className="text-[9px] bg-slate-100 shrink-0">
                            Auto
                        </Badge>
                    )}
                </div>
            </Link>
        )
    }

    return (
        <Link href={`/team?teamId=${id}`} className="block group">
            <Card className="bg-white border-slate-200 hover:border-amber-300 hover:shadow-md transition-all">
                <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                                <Users className="h-6 w-6 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 group-hover:text-amber-600">
                                    {name}
                                </h3>
                                <p className="text-sm text-slate-500">{members.length} members</p>
                            </div>
                        </div>
                        {is_auto_generated && (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
                                Auto-generated
                            </Badge>
                        )}
                    </div>

                    {/* Stacked member avatars */}
                    <div className="flex items-center gap-4 mb-4">
                        <div className="flex -space-x-3">
                            {displayMembers.map((member, i) => (
                                <Avatar
                                    key={member.id}
                                    className="h-10 w-10 border-2 border-white shadow-sm"
                                    style={{ zIndex: displayMembers.length - i }}
                                >
                                    <AvatarFallback className={`text-sm ${member.role === 'AI_Agent' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100'}`}>
                                        {member.role === 'AI_Agent' ? '🤖' : member.full_name?.substring(0, 2).toUpperCase() || '?'}
                                    </AvatarFallback>
                                </Avatar>
                            ))}
                            {remainingCount > 0 && (
                                <div
                                    className="h-10 w-10 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-sm font-medium text-slate-600"
                                    style={{ zIndex: 0 }}
                                >
                                    +{remainingCount}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2 text-sm">
                            <Briefcase className="h-4 w-4 text-blue-500" />
                            <span className="text-slate-600">{tasksCount} active tasks</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
