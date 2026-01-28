'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
    UserCheck, 
    Plus, 
    Trash2, 
    Loader2, 
    Calendar, 
    ArrowRight,
    Shield,
    Clock
} from 'lucide-react'
import { 
    getMyDelegations, 
    getDelegationsToMe,
    createDelegation, 
    revokeDelegation,
    type ApprovalDelegation 
} from '@/actions/approvals'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'

function getInitials(name: string | null) {
    if (!name) return '??'
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

interface DelegationManagerProps {
    members: { id: string; full_name: string | null; role: string }[]
    currentUserId: string
    userRole?: string
}

export function DelegationManager({ members, currentUserId, userRole }: DelegationManagerProps) {
    const [myDelegations, setMyDelegations] = useState<ApprovalDelegation[]>([])
    const [delegationsToMe, setDelegationsToMe] = useState<ApprovalDelegation[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isPending, startTransition] = useTransition()
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    
    // Create form state
    const [delegateId, setDelegateId] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [reason, setReason] = useState('')

    const isExecutive = userRole === 'Executive' || userRole === 'Founder'

    useEffect(() => {
        loadDelegations()
    }, [])

    const loadDelegations = async () => {
        setIsLoading(true)
        
        if (isExecutive) {
            const myResult = await getMyDelegations()
            if (!myResult.error) {
                setMyDelegations(myResult.data)
            }
        }
        
        const toMeResult = await getDelegationsToMe()
        if (!toMeResult.error) {
            setDelegationsToMe(toMeResult.data)
        }
        
        setIsLoading(false)
    }

    const handleCreate = async () => {
        if (!delegateId) {
            toast.error('Please select someone to delegate to')
            return
        }

        startTransition(async () => {
            const result = await createDelegation({
                delegateId,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                reason: reason || undefined
            })

            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Delegation created!')
                setShowCreateDialog(false)
                resetForm()
                loadDelegations()
            }
        })
    }

    const handleRevoke = async (delegationId: string) => {
        startTransition(async () => {
            const result = await revokeDelegation(delegationId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Delegation revoked')
                loadDelegations()
            }
        })
    }

    const resetForm = () => {
        setDelegateId('')
        setStartDate('')
        setEndDate('')
        setReason('')
    }

    // Filter out already delegated members and self
    const availableDelegates = members.filter(m => 
        m.id !== currentUserId && 
        !myDelegations.some(d => d.delegate_id === m.id)
    )

    if (isLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {/* Delegations I've Granted */}
            {isExecutive && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <UserCheck className="h-5 w-5 text-slate-600" />
                                    My Approval Delegations
                                </CardTitle>
                                <CardDescription>
                                    People who can approve on your behalf when you're away
                                </CardDescription>
                            </div>
                            <Button onClick={() => setShowCreateDialog(true)} size="sm">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Delegate
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {myDelegations.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                <UserCheck className="h-12 w-12 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No delegations set up</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    Delegate approval authority when you'll be unavailable
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {myDelegations.map((delegation) => {
                                    const delegate = delegation.delegate as { full_name: string | null; role: string } | undefined
                                    const isExpired = delegation.end_date && new Date(delegation.end_date) < new Date()
                                    
                                    return (
                                        <div 
                                            key={delegation.id}
                                            className={cn(
                                                'flex items-center justify-between p-3 rounded-lg border',
                                                isExpired 
                                                    ? 'bg-slate-50 border-slate-200 opacity-60'
                                                    : 'bg-white border-slate-200'
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-10 w-10">
                                                    <AvatarFallback className="bg-blue-100 text-blue-700">
                                                        {getInitials(delegate?.full_name || null)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-slate-900">
                                                            {delegate?.full_name || 'Unknown'}
                                                        </span>
                                                        <Badge variant="outline" className="text-xs">
                                                            {delegate?.role}
                                                        </Badge>
                                                        {isExpired && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                Expired
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                                        <Calendar className="h-3 w-3" />
                                                        {delegation.end_date ? (
                                                            <span>
                                                                Until {format(new Date(delegation.end_date), 'MMM d, yyyy')}
                                                            </span>
                                                        ) : (
                                                            <span>Indefinite</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRevoke(delegation.id)}
                                                disabled={isPending}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Delegations I've Received */}
            {delegationsToMe.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-green-600" />
                            Delegated Authority
                        </CardTitle>
                        <CardDescription>
                            You can approve tasks on behalf of these executives
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {delegationsToMe.map((delegation) => {
                                const delegator = delegation.delegator as { full_name: string | null; role: string } | undefined
                                
                                return (
                                    <div 
                                        key={delegation.id}
                                        className="flex items-center gap-3 p-3 rounded-lg border border-green-200 bg-green-50"
                                    >
                                        <Avatar className="h-10 w-10">
                                            <AvatarFallback className="bg-green-200 text-green-700">
                                                {getInitials(delegator?.full_name || null)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-900">
                                                    {delegator?.full_name || 'Unknown'}
                                                </span>
                                                <ArrowRight className="h-3 w-3 text-slate-400" />
                                                <span className="text-green-700 font-medium">You</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                                <Clock className="h-3 w-3" />
                                                {delegation.end_date ? (
                                                    <span>
                                                        Valid until {format(new Date(delegation.end_date), 'MMM d, yyyy')}
                                                    </span>
                                                ) : (
                                                    <span>No expiration</span>
                                                )}
                                            </div>
                                        </div>
                                        <Badge className="bg-green-100 text-green-700 border-green-200">
                                            Active
                                        </Badge>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Create Delegation Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="sm:max-w-[425px] bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Create Delegation</DialogTitle>
                        <DialogDescription>
                            Delegate your approval authority to another team member
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Delegate To</Label>
                            <Select value={delegateId} onValueChange={setDelegateId}>
                                <SelectTrigger className="bg-white">
                                    <SelectValue placeholder="Select a team member..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableDelegates.map((member) => (
                                        <SelectItem key={member.id} value={member.id}>
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-5 w-5">
                                                    <AvatarFallback className="text-[8px]">
                                                        {getInitials(member.full_name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span>{member.full_name}</span>
                                                <Badge variant="outline" className="text-xs ml-1">
                                                    {member.role}
                                                </Badge>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date (optional)</Label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-white"
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <Label>Reason (optional)</Label>
                            <Textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="e.g., On vacation, conference attendance..."
                                className="bg-white"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowCreateDialog(false)
                            resetForm()
                        }}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={isPending || !delegateId}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Create Delegation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
