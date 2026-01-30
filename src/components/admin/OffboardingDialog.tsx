'use client'

import { useState, useEffect, useTransition } from 'react'
import { 
    AlertTriangle, 
    Loader2, 
    CheckCircle2,
    ArrowRight,
    UserMinus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    RadioGroup,
    RadioGroupItem
} from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { offboardMember, getOffboardingTasks, type OffboardingTask } from '@/actions/offboarding'
import { getNonAdminMembers } from '@/actions/admin-permissions'

interface Member {
    id: string
    full_name: string | null
    email: string
    role: string
}

interface OffboardingDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    member: Member
    foundryId: string
    onComplete: () => void
}

type OffboardingAction = 'reassign_delete' | 'soft_delete' | 'anonymize'

export function OffboardingDialog({
    open,
    onOpenChange,
    member,
    foundryId,
    onComplete
}: OffboardingDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [step, setStep] = useState<'review' | 'reassign' | 'confirm' | 'complete'>('review')
    const [action, setAction] = useState<OffboardingAction>('reassign_delete')
    const [tasks, setTasks] = useState<OffboardingTask[]>([])
    const [reassignments, setReassignments] = useState<Record<string, string>>({})
    const [availableAssignees, setAvailableAssignees] = useState<Member[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    useEffect(() => {
        if (open) {
            loadData()
        }
    }, [open, member.id])
    
    async function loadData() {
        setLoading(true)
        setError(null)
        try {
            const [tasksResult, membersResult] = await Promise.all([
                getOffboardingTasks(member.id),
                getNonAdminMembers()
            ])
            
            if (tasksResult.error) {
                setError(tasksResult.error)
            } else {
                setTasks(tasksResult.tasks)
            }
            
            if (!membersResult.error) {
                setAvailableAssignees(
                    membersResult.members.filter(m => m.id !== member.id)
                )
            }
        } catch (err) {
            setError('Failed to load offboarding data')
        } finally {
            setLoading(false)
        }
    }
    
    const handleReassignAll = (assigneeId: string) => {
        const newReassignments: Record<string, string> = {}
        tasks.forEach(task => {
            newReassignments[`${task.task_id}-${task.relationship_type}`] = assigneeId
        })
        setReassignments(newReassignments)
    }
    
    const handleReassignTask = (taskId: string, relationshipType: string, assigneeId: string) => {
        setReassignments(prev => ({
            ...prev,
            [`${taskId}-${relationshipType}`]: assigneeId
        }))
    }
    
    const handleProceed = () => {
        if (step === 'review') {
            if (tasks.length > 0 && action === 'reassign_delete') {
                setStep('reassign')
            } else {
                setStep('confirm')
            }
        } else if (step === 'reassign') {
            setStep('confirm')
        }
    }
    
    const handleOffboard = async () => {
        setError(null)
        startTransition(async () => {
            const result = await offboardMember(member.id, action, reassignments)
            
            if (result.error) {
                setError(result.error)
            } else {
                setStep('complete')
                setTimeout(() => {
                    onComplete()
                    onOpenChange(false)
                }, 2000)
            }
        })
    }
    
    const resetDialog = () => {
        setStep('review')
        setAction('reassign_delete')
        setTasks([])
        setReassignments({})
        setError(null)
    }
    
    const handleClose = (isOpen: boolean) => {
        if (!isOpen) {
            resetDialog()
        }
        onOpenChange(isOpen)
    }
    
    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserMinus className="h-5 w-5 text-red-500" />
                        Offboard {member.full_name || member.email}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'review' && 'Choose how to handle this user\'s departure'}
                        {step === 'reassign' && 'Reassign tasks before removing the user'}
                        {step === 'confirm' && 'Review and confirm offboarding'}
                        {step === 'complete' && 'Offboarding complete'}
                    </DialogDescription>
                </DialogHeader>
                
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-foundry-400" />
                    </div>
                ) : step === 'review' ? (
                    <div className="space-y-4 py-4">
                        {tasks.length > 0 && (
                            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                                <div className="flex items-center gap-2 text-amber-700 mb-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="text-sm font-medium">Tasks to handle</span>
                                </div>
                                <p className="text-xs text-amber-600">
                                    This user has {tasks.length} task{tasks.length !== 1 ? 's' : ''} that will need attention.
                                </p>
                            </div>
                        )}
                        
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">Offboarding action</Label>
                            <RadioGroup
                                value={action}
                                onValueChange={(v) => setAction(v as OffboardingAction)}
                                className="space-y-2"
                            >
                                <div className="flex items-start space-x-3 p-3 rounded-lg border border-foundry-200 hover:bg-foundry-50 transition-colors">
                                    <RadioGroupItem value="reassign_delete" id="reassign_delete" className="mt-0.5" />
                                    <div className="space-y-1">
                                        <Label htmlFor="reassign_delete" className="text-sm font-medium cursor-pointer">
                                            Reassign and Delete
                                        </Label>
                                        <p className="text-xs text-foundry-500">
                                            Reassign their tasks to others, then remove their profile completely.
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex items-start space-x-3 p-3 rounded-lg border border-foundry-200 hover:bg-foundry-50 transition-colors">
                                    <RadioGroupItem value="soft_delete" id="soft_delete" className="mt-0.5" />
                                    <div className="space-y-1">
                                        <Label htmlFor="soft_delete" className="text-sm font-medium cursor-pointer">
                                            Deactivate (Soft Delete)
                                        </Label>
                                        <p className="text-xs text-foundry-500">
                                            Keep their profile but revoke access. Their history remains visible.
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex items-start space-x-3 p-3 rounded-lg border border-foundry-200 hover:bg-foundry-50 transition-colors">
                                    <RadioGroupItem value="anonymize" id="anonymize" className="mt-0.5" />
                                    <div className="space-y-1">
                                        <Label htmlFor="anonymize" className="text-sm font-medium cursor-pointer">
                                            Anonymize
                                        </Label>
                                        <p className="text-xs text-foundry-500">
                                            Replace their name with &quot;Former Employee&quot; and clear personal data.
                                        </p>
                                    </div>
                                </div>
                            </RadioGroup>
                        </div>
                    </div>
                ) : step === 'reassign' ? (
                    <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
                        {availableAssignees.length > 0 && (
                            <div className="flex items-center gap-2 pb-3 border-b border-foundry-100">
                                <span className="text-xs text-foundry-500">Assign all to:</span>
                                <Select onValueChange={handleReassignAll}>
                                    <SelectTrigger className="w-[180px] h-8 text-xs">
                                        <SelectValue placeholder="Select person..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableAssignees.map((assignee) => (
                                            <SelectItem key={assignee.id} value={assignee.id}>
                                                {assignee.full_name || assignee.email}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        
                        <div className="space-y-2">
                            {tasks.map((task) => (
                                <div 
                                    key={`${task.task_id}-${task.relationship_type}`}
                                    className="flex items-center justify-between p-2 rounded-lg bg-foundry-50"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-foundry-900 truncate">
                                            {task.task_title}
                                        </p>
                                        <Badge variant="secondary" className="text-xs bg-foundry-100 border-0">
                                            {task.relationship_type === 'creator' ? 'Creator' : 'Assignee'}
                                        </Badge>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 ml-2">
                                        <ArrowRight className="h-4 w-4 text-foundry-400" />
                                        <Select
                                            value={reassignments[`${task.task_id}-${task.relationship_type}`] || ''}
                                            onValueChange={(v) => handleReassignTask(task.task_id, task.relationship_type, v)}
                                        >
                                            <SelectTrigger className="w-[140px] h-8 text-xs">
                                                <SelectValue placeholder="Reassign to..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="unassign">Leave unassigned</SelectItem>
                                                {availableAssignees.map((assignee) => (
                                                    <SelectItem key={assignee.id} value={assignee.id}>
                                                        {assignee.full_name || assignee.email}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : step === 'confirm' ? (
                    <div className="space-y-4 py-4">
                        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-2 text-red-700 mb-2">
                                <AlertTriangle className="h-5 w-5" />
                                <span className="font-medium">Confirm Offboarding</span>
                            </div>
                            <p className="text-sm text-red-600">
                                You are about to {action === 'reassign_delete' ? 'permanently remove' : action === 'soft_delete' ? 'deactivate' : 'anonymize'}{' '}
                                <strong>{member.full_name || member.email}</strong>.
                            </p>
                            {action === 'reassign_delete' && (
                                <p className="text-sm text-red-600 mt-2">
                                    This action cannot be undone.
                                </p>
                            )}
                        </div>
                        
                        {error && (
                            <div className="p-3 text-sm bg-red-50 text-red-700 rounded-md">
                                {error}
                            </div>
                        )}
                    </div>
                ) : step === 'complete' ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                        <p className="text-lg font-medium text-foundry-900">Offboarding Complete</p>
                        <p className="text-sm text-foundry-500 mt-1">
                            {member.full_name || member.email} has been removed.
                        </p>
                    </div>
                ) : null}
                
                {step !== 'complete' && (
                    <DialogFooter>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                if (step === 'reassign') {
                                    setStep('review')
                                } else if (step === 'confirm') {
                                    setStep(tasks.length > 0 && action === 'reassign_delete' ? 'reassign' : 'review')
                                } else {
                                    handleClose(false)
                                }
                            }}
                        >
                            {step === 'review' ? 'Cancel' : 'Back'}
                        </Button>
                        
                        {step === 'confirm' ? (
                            <Button
                                variant="destructive"
                                onClick={handleOffboard}
                                disabled={isPending}
                            >
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <UserMinus className="h-4 w-4 mr-2" />
                                )}
                                Confirm Offboarding
                            </Button>
                        ) : (
                            <Button onClick={handleProceed}>
                                Continue
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        )}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}
