"use client"

import { useState, useTransition } from "react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { 
    MoreHorizontal, 
    Mail, 
    Archive, 
    UserPlus,
    Loader2,
    ExternalLink,
    Package
} from "lucide-react"
import { MigrationRecordWithListing, MigrationStatus } from "@/types/migration"
import { 
    resendMigrationInvite, 
    archiveUnmigratedListing 
} from "@/actions/migration"
import { cn } from "@/lib/utils"

type ActionType = 'send_invite' | 'resend_invite' | 'force_migrate' | 'archive'

interface MigrationTableProps {
    records: MigrationRecordWithListing[]
    showActions?: ActionType[]
}

export function MigrationTable({ records, showActions = [] }: MigrationTableProps) {
    const [isPending, startTransition] = useTransition()
    const [actionTarget, setActionTarget] = useState<string | null>(null)
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean
        action: ActionType | null
        listingId: string | null
        title: string
    }>({
        open: false,
        action: null,
        listingId: null,
        title: ''
    })
    
    if (records.length === 0) {
        return (
            <EmptyState
                icon={<Package className="h-8 w-8" />}
                title="No records found"
                description="No migration records match the current filter."
            />
        )
    }
    
    const handleAction = async (action: ActionType, listingId: string) => {
        setActionTarget(listingId)
        
        startTransition(async () => {
            try {
                switch (action) {
                    case 'send_invite':
                    case 'resend_invite':
                        await resendMigrationInvite(listingId)
                        break
                    case 'archive':
                        await archiveUnmigratedListing(listingId)
                        break
                    case 'force_migrate':
                        // This would open a modal to select provider
                        break
                }
            } catch (error) {
                console.error('Action failed:', error)
            } finally {
                setActionTarget(null)
                setConfirmDialog({ open: false, action: null, listingId: null, title: '' })
            }
        })
    }
    
    const statusBadge = (status: MigrationStatus) => {
        const variants: Record<MigrationStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
            pending: { label: 'Pending', variant: 'secondary' },
            invited: { label: 'Invited', variant: 'default' },
            in_progress: { label: 'In Progress', variant: 'default' },
            completed: { label: 'Completed', variant: 'default' },
            declined: { label: 'Declined', variant: 'destructive' }
        }
        
        const config = variants[status] || { label: status, variant: 'secondary' }
        
        return (
            <Badge 
                variant={config.variant}
                className={cn(
                    status === 'completed' && 'bg-green-100 text-green-800',
                    status === 'invited' && 'bg-amber-100 text-amber-800',
                    status === 'in_progress' && 'bg-blue-100 text-blue-800'
                )}
            >
                {config.label}
            </Badge>
        )
    }
    
    return (
        <>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Listing</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Contact Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Updated</TableHead>
                        {showActions.length > 0 && (
                            <TableHead className="w-[70px]">Actions</TableHead>
                        )}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {records.map((record) => (
                        <TableRow key={record.id}>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium truncate max-w-[200px]">
                                        {record.listing?.title || 'Unknown Listing'}
                                    </span>
                                    {record.listing && (
                                        <a 
                                            href={`/marketplace/${record.listing_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-muted-foreground hover:text-foreground"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <span className="text-sm text-muted-foreground">
                                    {record.listing?.category} / {record.listing?.subcategory}
                                </span>
                            </TableCell>
                            <TableCell>
                                {record.contact_email ? (
                                    <span className="text-sm font-mono">
                                        {record.contact_email}
                                    </span>
                                ) : (
                                    <span className="text-sm text-muted-foreground italic">
                                        No email
                                    </span>
                                )}
                            </TableCell>
                            <TableCell>
                                {statusBadge(record.status as MigrationStatus)}
                            </TableCell>
                            <TableCell>
                                <span className="text-sm text-muted-foreground">
                                    {record.invitation_sent_at
                                        ? formatDistanceToNow(new Date(record.invitation_sent_at), { addSuffix: true })
                                        : record.migration_completed_at
                                        ? formatDistanceToNow(new Date(record.migration_completed_at), { addSuffix: true })
                                        : '-'}
                                </span>
                            </TableCell>
                            {showActions.length > 0 && (
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                disabled={isPending && actionTarget === record.listing_id}
                                            >
                                                {isPending && actionTarget === record.listing_id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <MoreHorizontal className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {(showActions.includes('send_invite') || showActions.includes('resend_invite')) && (
                                                <DropdownMenuItem
                                                    onClick={() => handleAction(
                                                        record.status === 'pending' ? 'send_invite' : 'resend_invite',
                                                        record.listing_id
                                                    )}
                                                    disabled={!record.contact_email}
                                                >
                                                    <Mail className="h-4 w-4 mr-2" />
                                                    {record.status === 'pending' ? 'Send Invite' : 'Resend Invite'}
                                                </DropdownMenuItem>
                                            )}
                                            
                                            {showActions.includes('force_migrate') && (
                                                <DropdownMenuItem
                                                    onClick={() => setConfirmDialog({
                                                        open: true,
                                                        action: 'force_migrate',
                                                        listingId: record.listing_id,
                                                        title: record.listing?.title || ''
                                                    })}
                                                >
                                                    <UserPlus className="h-4 w-4 mr-2" />
                                                    Force Migrate
                                                </DropdownMenuItem>
                                            )}
                                            
                                            {showActions.includes('archive') && (
                                                <>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => setConfirmDialog({
                                                            open: true,
                                                            action: 'archive',
                                                            listingId: record.listing_id,
                                                            title: record.listing?.title || ''
                                                        })}
                                                        className="text-red-600"
                                                    >
                                                        <Archive className="h-4 w-4 mr-2" />
                                                        Archive
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            
            {/* Confirmation Dialog */}
            <AlertDialog 
                open={confirmDialog.open} 
                onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmDialog.action === 'archive' 
                                ? 'Archive Listing?' 
                                : 'Force Migrate Listing?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDialog.action === 'archive' ? (
                                <>
                                    This will archive &quot;{confirmDialog.title}&quot; and remove it from 
                                    the active marketplace. The listing data will be preserved.
                                </>
                            ) : (
                                <>
                                    This will manually link &quot;{confirmDialog.title}&quot; to a provider account.
                                    Use this when you need to complete migration without the standard flow.
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (confirmDialog.action && confirmDialog.listingId) {
                                    handleAction(confirmDialog.action, confirmDialog.listingId)
                                }
                            }}
                            className={confirmDialog.action === 'archive' ? 'bg-red-600 hover:bg-red-700' : ''}
                        >
                            {confirmDialog.action === 'archive' ? 'Archive' : 'Continue'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
