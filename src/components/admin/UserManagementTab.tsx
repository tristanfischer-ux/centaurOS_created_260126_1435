'use client'

import { useState, useEffect, useTransition } from 'react'
import { 
    UserPlus, 
    Shield, 
    ShieldOff,
    MoreHorizontal,
    Mail,
    Loader2,
    Crown,
    UserMinus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { createInvitation } from '@/actions/invitations'
import { 
    grantAdminPermission, 
    revokeAdminPermission, 
    listAdminUsers,
    getNonAdminMembers,
    type FoundryAdminPermission
} from '@/actions/admin-permissions'
import { OffboardingDialog } from './OffboardingDialog'

interface UserManagementTabProps {
    foundryId: string
    isFounder: boolean
}

interface Member {
    id: string
    full_name: string | null
    email: string
    role: string
    is_active?: boolean
}

export function UserManagementTab({ foundryId, isFounder }: UserManagementTabProps) {
    const [isPending, startTransition] = useTransition()
    const [showInviteDialog, setShowInviteDialog] = useState(false)
    const [showOffboardingDialog, setShowOffboardingDialog] = useState(false)
    const [selectedMember, setSelectedMember] = useState<Member | null>(null)
    
    // Form state
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<'Executive' | 'Apprentice'>('Apprentice')
    const [inviteMessage, setInviteMessage] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    
    // Data state
    const [members, setMembers] = useState<Member[]>([])
    const [adminUsers, setAdminUsers] = useState<FoundryAdminPermission[]>([])
    const [founders, setFounders] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
    const [loading, setLoading] = useState(true)
    
    // Load members and admin users
    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const adminResult = await listAdminUsers()
                if (!adminResult.error) {
                    setAdminUsers(adminResult.users)
                    setFounders(adminResult.founders)
                }
                
                const nonAdminResult = await getNonAdminMembers()
                if (!nonAdminResult.error) {
                    const allMembers: Member[] = [
                        ...adminResult.founders.map(f => ({ ...f, role: 'Founder', is_active: true })),
                        ...adminResult.users.map(u => ({
                            id: u.profile?.id || '',
                            full_name: u.profile?.full_name || null,
                            email: u.profile?.email || '',
                            role: u.profile?.role || 'Unknown',
                            is_active: true
                        })),
                        ...nonAdminResult.members.map(m => ({ ...m, is_active: true }))
                    ]
                    
                    // Deduplicate by id
                    const uniqueMembers = allMembers.reduce((acc, member) => {
                        if (member.id && !acc.find(m => m.id === member.id)) {
                            acc.push(member)
                        }
                        return acc
                    }, [] as Member[])
                    
                    setMembers(uniqueMembers)
                }
            } catch (err) {
                console.error('Failed to load data:', err)
            } finally {
                setLoading(false)
            }
        }
        
        loadData()
    }, [])
    
    const handleInvite = async () => {
        setError(null)
        setSuccess(null)
        
        startTransition(async () => {
            const result = await createInvitation(inviteEmail, inviteRole, inviteMessage || undefined)
            
            if (result.success) {
                setSuccess(`Invitation sent to ${inviteEmail}`)
                setInviteEmail('')
                setInviteMessage('')
                setShowInviteDialog(false)
            } else {
                setError(result.error || 'Failed to send invitation')
            }
        })
    }
    
    const handleGrantAdmin = async (profileId: string) => {
        setError(null)
        startTransition(async () => {
            const result = await grantAdminPermission(profileId)
            if (result.error) {
                setError(result.error)
            } else {
                const adminResult = await listAdminUsers()
                if (!adminResult.error) {
                    setAdminUsers(adminResult.users)
                }
            }
        })
    }
    
    const handleRevokeAdmin = async (profileId: string) => {
        setError(null)
        startTransition(async () => {
            const result = await revokeAdminPermission(profileId)
            if (result.error) {
                setError(result.error)
            } else {
                const adminResult = await listAdminUsers()
                if (!adminResult.error) {
                    setAdminUsers(adminResult.users)
                }
            }
        })
    }
    
    const handleOffboard = (member: Member) => {
        setSelectedMember(member)
        setShowOffboardingDialog(true)
    }
    
    const isAdminUser = (profileId: string) => {
        return adminUsers.some(u => u.profile_id === profileId)
    }
    
    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'Founder':
                return 'bg-international-orange/10 text-international-orange border-0'
            case 'Executive':
                return 'bg-electric-blue/10 text-electric-blue border-0'
            case 'AI_Agent':
                return 'bg-purple-100 text-purple-700 border-0'
            default:
                return 'bg-foundry-100 text-foundry-600 border-0'
        }
    }
    
    return (
        <div className="space-y-4">
            {/* Header with invite button */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foundry-900">Team Members</h3>
                <Button
                    size="sm"
                    onClick={() => setShowInviteDialog(true)}
                    className="h-8 text-xs"
                >
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Invite
                </Button>
            </div>
            
            {/* Error/Success messages */}
            {error && (
                <div className="p-2 text-xs bg-red-50 text-red-700 rounded-md">
                    {error}
                </div>
            )}
            {success && (
                <div className="p-2 text-xs bg-green-50 text-green-700 rounded-md">
                    {success}
                </div>
            )}
            
            {/* Members list */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-foundry-400" />
                    </div>
                ) : members.length === 0 ? (
                    <div className="text-center py-8 text-sm text-foundry-500">
                        No team members found
                    </div>
                ) : (
                    members.map((member) => (
                        <div
                            key={member.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-foundry-50 hover:bg-foundry-100 transition-colors"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-foundry-200 flex items-center justify-center text-xs font-medium text-foundry-700">
                                    {member.full_name?.charAt(0)?.toUpperCase() || member.email.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-sm font-medium text-foundry-900 truncate">
                                            {member.full_name || 'Unnamed'}
                                        </p>
                                        {member.role === 'Founder' && (
                                            <Crown className="h-3 w-3 text-international-orange" />
                                        )}
                                        {isAdminUser(member.id) && member.role !== 'Founder' && (
                                            <Shield className="h-3 w-3 text-electric-blue" />
                                        )}
                                    </div>
                                    <p className="text-xs text-foundry-500 truncate">
                                        {member.email}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className={`text-xs ${getRoleBadgeColor(member.role)}`}>
                                    {member.role}
                                </Badge>
                                
                                {isFounder && member.role !== 'Founder' && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            {isAdminUser(member.id) ? (
                                                <DropdownMenuItem
                                                    onClick={() => handleRevokeAdmin(member.id)}
                                                    className="text-amber-600"
                                                >
                                                    <ShieldOff className="h-4 w-4 mr-2" />
                                                    Revoke Admin
                                                </DropdownMenuItem>
                                            ) : (
                                                <DropdownMenuItem
                                                    onClick={() => handleGrantAdmin(member.id)}
                                                >
                                                    <Shield className="h-4 w-4 mr-2" />
                                                    Grant Admin Access
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => handleOffboard(member)}
                                                className="text-red-600"
                                            >
                                                <UserMinus className="h-4 w-4 mr-2" />
                                                Offboard User
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            {/* Invite Dialog */}
            <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle>Invite Team Member</DialogTitle>
                        <DialogDescription>
                            Send an invitation to join your company
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="colleague@example.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="role">Role</Label>
                            <Select
                                value={inviteRole}
                                onValueChange={(v) => setInviteRole(v as 'Executive' | 'Apprentice')}
                            >
                                <SelectTrigger id="role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Executive">Executive</SelectItem>
                                    <SelectItem value="Apprentice">Apprentice</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="message">Personal message (optional)</Label>
                            <Input
                                id="message"
                                placeholder="Looking forward to working with you!"
                                value={inviteMessage}
                                onChange={(e) => setInviteMessage(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <DialogFooter>
                        <Button
                            variant="secondary"
                            onClick={() => setShowInviteDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleInvite}
                            disabled={isPending || !inviteEmail}
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Mail className="h-4 w-4 mr-2" />
                            )}
                            Send Invitation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            {/* Offboarding Dialog */}
            {selectedMember && (
                <OffboardingDialog
                    open={showOffboardingDialog}
                    onOpenChange={setShowOffboardingDialog}
                    member={selectedMember}
                    foundryId={foundryId}
                    onComplete={() => {
                        setSelectedMember(null)
                        window.location.reload()
                    }}
                />
            )}
        </div>
    )
}
