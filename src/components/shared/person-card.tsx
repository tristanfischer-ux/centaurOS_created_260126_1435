"use client"

import { memo } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
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

export const PersonCard = memo(function PersonCard({
    id,
    full_name,
    email,
    role,
    tasksCount = 0,
    completedCount = 0,
    compact = false
}: PersonCardProps) {
    const isAI = role === 'AI_Agent'

    if (compact) {
        return (
            <Link href={`/team/${id}`} className="block group">
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                    <UserAvatar name={full_name} role={role} size="md" />
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate group-hover:text-primary">
                            {full_name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{role}</div>
                    </div>
                </div>
            </Link>
        )
    }

    return (
        <Link href={`/team/${id}`} className="block group">
            <Card className="hover:border-primary hover:shadow-md transition-all">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <UserAvatar name={full_name} role={role} size="xl" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-foreground truncate group-hover:text-primary">
                                    {full_name}
                                </h3>
                                {isAI && (
                                    <Badge variant="secondary" className="bg-purple-50 text-purple-600 shrink-0">
                                        AI
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{email}</p>
                            <Badge variant="secondary" className="mt-2 text-xs">
                                {role}
                            </Badge>
                        </div>
                    </div>

                    <div className="flex gap-4 mt-4 pt-4 border-t border-border">
                        <div className="flex items-center gap-2 text-sm">
                            <Briefcase className="h-4 w-4 text-blue-500" />
                            <span className="text-muted-foreground">{tasksCount} active</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Award className="h-4 w-4 text-green-500" />
                            <span className="text-muted-foreground">{completedCount} done</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
})
