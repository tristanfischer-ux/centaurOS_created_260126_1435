'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    CheckCircle2,
    Clock,
    ExternalLink,
    AlertTriangle,
    MoreHorizontal,
    Pencil,
    Trash2,
    ShieldCheck,
} from 'lucide-react'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import { CertificationForm } from './CertificationForm'
import type { Certification } from '@/actions/trust-signals'
import { sanitizeHref } from '@/lib/security/url-validation'

interface CertificationCardProps {
    certification: Certification
    onEdit?: () => void
    onDelete?: () => void
    onRequestVerification?: () => void
    showActions?: boolean
    className?: string
}

export const CertificationCard = memo(function CertificationCard({
    certification,
    onEdit,
    onDelete,
    onRequestVerification,
    showActions = true,
    className,
}: CertificationCardProps) {
    const isExpired = certification.expiry_date && new Date(certification.expiry_date) < new Date()
    const isExpiringSoon = certification.expiry_date && 
        !isExpired && 
        differenceInDays(new Date(certification.expiry_date), new Date()) <= 90

    return (
        <Card className={cn(
            'transition-colors',
            isExpired && 'border-destructive bg-status-error-light/50',
            isExpiringSoon && !isExpired && 'border-status-warning bg-status-warning-light/50',
            className
        )}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-start gap-2 mb-1">
                            <h3 className="font-semibold text-foreground truncate">
                                {certification.certification_name}
                            </h3>
                            {/* Verification Status */}
                            {certification.is_verified ? (
                                <Badge variant="secondary" className="bg-status-success-light text-status-success-dark border-status-success shrink-0">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Verified
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="bg-muted text-muted-foreground border shrink-0">
                                    <Clock className="w-3 h-3 mr-1" />
                                    Pending
                                </Badge>
                            )}
                        </div>

                        {/* Issuing Body */}
                        <p className="text-sm text-muted-foreground mb-2">
                            {certification.issuing_body}
                        </p>

                        {/* Details Row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {certification.credential_id && (
                                <span>
                                    ID: {certification.credential_id}
                                </span>
                            )}
                            {certification.issued_date && (
                                <span>
                                    Issued: {format(new Date(certification.issued_date), 'MMM yyyy')}
                                </span>
                            )}
                            {certification.expiry_date && (
                                <span className={cn(
                                    isExpired && 'text-destructive font-medium',
                                    isExpiringSoon && !isExpired && 'text-status-warning font-medium'
                                )}>
                                    {isExpired ? (
                                        <>Expired {formatDistanceToNow(new Date(certification.expiry_date))} ago</>
                                    ) : isExpiringSoon ? (
                                        <>Expires in {differenceInDays(new Date(certification.expiry_date), new Date())} days</>
                                    ) : (
                                        <>Expires: {format(new Date(certification.expiry_date), 'MMM yyyy')}</>
                                    )}
                                </span>
                            )}
                        </div>

                        {/* Expiry Warning */}
                        {isExpiringSoon && !isExpired && (
                            <div className="flex items-center gap-1.5 mt-2 text-status-warning-dark text-sm">
                                <AlertTriangle className="w-4 h-4" />
                                <span>Expiring soon - consider renewing</span>
                            </div>
                        )}

                        {isExpired && (
                            <div className="flex items-center gap-1.5 mt-2 text-destructive text-sm">
                                <AlertTriangle className="w-4 h-4" />
                                <span>This certification has expired</span>
                            </div>
                        )}

                        {/* Verification URL */}
                        {certification.verification_url && sanitizeHref(certification.verification_url) !== '#' && (
                            <a
                                href={sanitizeHref(certification.verification_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-2 text-sm text-status-info hover:underline"
                            >
                                <ExternalLink className="w-3 h-3" />
                                Verify
                            </a>
                        )}
                    </div>

                    {/* Actions */}
                    {showActions && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <CertificationForm
                                    certification={certification}
                                    trigger={
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                            <Pencil className="w-4 h-4 mr-2" />
                                            Edit
                                        </DropdownMenuItem>
                                    }
                                    onSuccess={onEdit}
                                />
                                {!certification.is_verified && certification.verification_url && onRequestVerification && (
                                    <DropdownMenuItem onClick={onRequestVerification}>
                                        <ShieldCheck className="w-4 h-4 mr-2" />
                                        Request Verification
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    onClick={onDelete}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </CardContent>
        </Card>
    )
})

// Compact version for marketplace/profile display
interface CertificationBadgeProps {
    certification: Certification
    className?: string
}

export const CertificationBadge = memo(function CertificationBadge({
    certification,
    className,
}: CertificationBadgeProps) {
    const isExpired = certification.expiry_date && new Date(certification.expiry_date) < new Date()

    if (isExpired) return null

    return (
        <Badge 
            variant="secondary" 
            className={cn(
                certification.is_verified 
                    ? 'bg-status-success-light text-status-success-dark border-status-success'
                    : 'bg-muted text-muted-foreground border',
                className
            )}
        >
            {certification.is_verified && (
                <CheckCircle2 className="w-3 h-3 mr-1" />
            )}
            {certification.certification_name}
        </Badge>
    )
})
