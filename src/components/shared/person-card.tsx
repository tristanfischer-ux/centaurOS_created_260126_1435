"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Briefcase, Award } from "lucide-react"

interface PersonCardProps {
    id: string
    full_name: string | null
    email: string | null
    role: string | null
    tasksCount?: number
    completedCount?: number
    compact?: boolean
}

export function PersonCard({
    id,
    full_name,
    email,
    role,
    tasksCount = 0,
    completedCount = 0,
    compact = false
}: PersonCardProps) {
    const isAI = role === 'AI_Agent'
    const initials = full_name?.substring(0, 2).toUpperCase() || '?'

    if (compact) {
        return (
            <Link href={`/team/${id}`} className="block group">
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <Avatar className="h-8 w-8">
                        <AvatarFallback className={`text-xs ${isAI ? 'bg-purple-100 text-purple-600' : 'bg-slate-100'}`}>
                            {isAI ? '🤖' : initials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate group-hover:text-amber-600">
                            {full_name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">{role}</div>
                    </div>
                </div>
            </Link>
        )
    }

    return (
        <Link href={`/team/${id}`} className="block group">
            <Card className="bg-white border-slate-200 hover:border-amber-300 hover:shadow-md transition-all">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <Avatar className="h-14 w-14">
                            <AvatarFallback className={`text-xl ${isAI ? 'bg-purple-100 text-purple-600' : 'bg-slate-100'}`}>
                                {isAI ? '🤖' : initials}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-slate-900 truncate group-hover:text-amber-600">
                                    {full_name}
                                </h3>
                                {isAI && (
                                    <Badge variant="secondary" className="bg-purple-50 text-purple-600 shrink-0">
                                        AI
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-slate-500 truncate">{email}</p>
                            <Badge variant="outline" className="mt-2 text-xs">
                                {role}
                            </Badge>
                        </div>
                    </div>

                    <div className="flex gap-4 mt-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2 text-sm">
                            <Briefcase className="h-4 w-4 text-blue-500" />
                            <span className="text-slate-600">{tasksCount} active</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Award className="h-4 w-4 text-green-500" />
                            <span className="text-slate-600">{completedCount} done</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
