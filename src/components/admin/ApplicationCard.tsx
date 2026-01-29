"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"
import { Building2, ChevronRight, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

type ApplicationStatus = 'pending' | 'under_review' | 'approved' | 'rejected'

interface ApplicationCardProps {
    id: string
    companyName: string | null
    category: string
    status: ApplicationStatus
    submittedAt: string
    applicantName?: string | null
    className?: string
}

const statusConfig: Record<ApplicationStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'secondary' },
    under_review: { label: 'Under Review', variant: 'default' },
    approved: { label: 'Approved', variant: 'secondary' },
    rejected: { label: 'Rejected', variant: 'destructive' }
}

export function ApplicationCard({
    id,
    companyName,
    category,
    status,
    submittedAt,
    applicantName,
    className
}: ApplicationCardProps) {
    const statusInfo = statusConfig[status]
    
    return (
        <Card className={cn("hover:bg-muted/50 transition-colors", className)}>
            <CardContent className="p-4">
                <Link href={`/admin/applications/${id}`} className="block">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-muted shrink-0">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-medium text-foreground truncate">
                                        {companyName || 'Unnamed Company'}
                                    </h3>
                                    <Badge variant={statusInfo.variant} className="shrink-0">
                                        {statusInfo.label}
                                    </Badge>
                                </div>
                                {applicantName && (
                                    <p className="text-sm text-muted-foreground truncate">
                                        {applicantName}
                                    </p>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                    <span className="capitalize">{category}</span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {formatDistanceToNow(new Date(submittedAt), { addSuffix: true })}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" className="shrink-0">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </Link>
            </CardContent>
        </Card>
    )
}
