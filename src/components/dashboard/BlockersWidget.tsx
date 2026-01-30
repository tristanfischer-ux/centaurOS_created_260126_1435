'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { AlertTriangle, CheckCircle, Loader2, HelpCircle } from 'lucide-react'
import { getStandupsWithBlockers, type Standup } from '@/actions/standups'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn, getInitials } from '@/lib/utils'

interface BlockersWidgetProps {
    userRole: string
}

export function BlockersWidget({ userRole }: BlockersWidgetProps) {
    const [standups, setStandups] = useState<Standup[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const isExecutive = userRole === 'Executive' || userRole === 'Founder'

    useEffect(() => {
        if (isExecutive) {
            loadBlockers()
        } else {
            setIsLoading(false)
        }
    }, [isExecutive])

    const loadBlockers = async () => {
        setIsLoading(true)
        const result = await getStandupsWithBlockers()
        if (!result.error) {
            setStandups(result.data)
        }
        setIsLoading(false)
    }

    if (!isExecutive) {
        return null
    }

    const criticalBlockers = standups.filter(s => s.blocker_severity === 'critical' || s.blocker_severity === 'high')
    const needsHelp = standups.filter(s => s.needs_help)

    return (
        <Card className={cn(
            criticalBlockers.length > 0 && 'border-amber-200'
        )}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className={cn(
                                "h-4 w-4",
                                criticalBlockers.length > 0 ? "text-amber-500" : "text-muted-foreground"
                            )} />
                            Team Blockers
                        </CardTitle>
                        <CardDescription>Issues that need attention</CardDescription>
                    </div>
                    {standups.length > 0 && (
                        <Badge 
                            variant="secondary" 
                            className={cn(
                                criticalBlockers.length > 0 
                                    ? "bg-amber-100 text-amber-700" 
                                    : "bg-muted text-muted-foreground"
                            )}
                        >
                            {standups.length}
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : standups.length === 0 ? (
                    <div className="text-center py-6">
                        <CheckCircle className="h-10 w-10 mx-auto text-green-500 mb-2" />
                        <p className="text-sm text-muted-foreground font-medium">No blockers reported</p>
                        <p className="text-xs text-muted-foreground">Team is running smoothly</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {standups.slice(0, 4).map(standup => {
                            const user = standup.user as { full_name: string | null; role: string | null } | undefined
                            const isCritical = standup.blocker_severity === 'critical' || standup.blocker_severity === 'high'
                            
                            return (
                                <div 
                                    key={standup.id}
                                    className={cn(
                                        'p-3 rounded-lg border transition-colors',
                                        isCritical 
                                            ? 'border-amber-200 bg-amber-50' 
                                            : 'border bg-white'
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <Avatar className="h-8 w-8 shrink-0">
                                            <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                                                {getInitials(user?.full_name || null)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-foreground">
                                                    {user?.full_name || 'Unknown'}
                                                </span>
                                                {standup.needs_help && (
                                                    <Badge variant="destructive" className="text-[10px] py-0">
                                                        <HelpCircle className="h-2.5 w-2.5 mr-0.5" />
                                                        Needs Help
                                                    </Badge>
                                                )}
                                                {isCritical && (
                                                    <Badge variant="secondary" className="text-[10px] py-0 bg-amber-100 text-amber-700">
                                                        {standup.blocker_severity}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground line-clamp-2">
                                                {standup.blockers}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {formatDistanceToNow(new Date(standup.standup_date), { addSuffix: true })}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        
                        {standups.length > 4 && (
                            <p className="text-xs text-center text-muted-foreground pt-2">
                                +{standups.length - 4} more blockers reported
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
