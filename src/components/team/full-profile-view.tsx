"use client"

/**
 * @file full-profile-view.tsx
 * 
 * @description Full-screen modal for viewing and editing team member profiles.
 * Includes edit mode, team assignments, and task management.
 * 
 * @component FullProfileView
 */

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { formatDistanceToNow, format } from "date-fns"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Markdown } from "@/components/ui/markdown"
import { addMemberToTeam, removeMemberFromTeam, assignTaskToMember, unassignTaskFromMember } from "@/actions/team-assignments"
import { updateProfileDetails } from "@/actions/profiles"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
    Loader2,
    Edit2,
    X,
    Check,
    Mail,
    Briefcase,
    Shield,
    Award,
    Phone,
    Linkedin,
    Calendar,
    Plus,
    Users,
} from "lucide-react"

// ============================================================================
// TYPES
// ============================================================================

interface Profile {
    id: string
    full_name: string | null
    email: string
    role: string
    bio: string | null
    phone_number: string | null
    linkedin_url: string | null
    created_at: string
    foundry_id: string
}

interface Task {
    id: string
    title: string
    description: string | null
    status: string | null
    risk_level: string | null
    created_at: string
}

interface UnassignedTask {
    id: string
    title: string
    created_at: string
}

interface Team {
    id: string
    name: string
    created_at: string
}

interface TeamMembership {
    team_id: string
    created_at: string
    teams: Team
}

interface MemberMetrics {
    id: string
    full_name: string
    email: string
    role: string
    activeTasks: number
    completedTasks: number
    pendingTasks: number
    rejectedTasks: number
}

interface FullProfileViewProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    memberId: string
    currentUserId: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FullProfileView({ open, onOpenChange, memberId, currentUserId }: FullProfileViewProps) {
    // ========================================================================
    // STATE
    // ========================================================================
    
    // Data state
    const [profile, setProfile] = useState<Profile | null>(null)
    const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null)
    const [tasks, setTasks] = useState<Task[]>([])
    const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([])
    const [availableTeams, setAvailableTeams] = useState<Team[]>([])
    const [unassignedTasks, setUnassignedTasks] = useState<UnassignedTask[]>([])
    const [allMembers, setAllMembers] = useState<MemberMetrics[]>([])
    const [isLoading, setIsLoading] = useState(true)
    
    // Edit mode state
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [editedFullName, setEditedFullName] = useState("")
    const [editedEmail, setEditedEmail] = useState("")
    const [editedRole, setEditedRole] = useState("")
    const [editedBio, setEditedBio] = useState("")
    const [editedPhoneNumber, setEditedPhoneNumber] = useState("")
    const [editedLinkedinUrl, setEditedLinkedinUrl] = useState("")
    
    // Assignment state
    const [selectedTeamId, setSelectedTeamId] = useState("")
    const [selectedTaskId, setSelectedTaskId] = useState("")
    const [isAssigningTeam, setIsAssigningTeam] = useState(false)
    const [isAssigningTask, setIsAssigningTask] = useState(false)
    
    const supabase = useMemo(() => createClient(), [])
    
    // ========================================================================
    // COMPUTED VALUES
    // ========================================================================
    
    // Calculate metrics
    const activeTasks = useMemo(() => 
        tasks.filter(t => t.status === 'Pending' || t.status === 'Accepted'),
        [tasks]
    )
    
    const completedTasks = useMemo(() => 
        tasks.filter(t => t.status === 'Completed'),
        [tasks]
    )
    
    // Permission check: Can edit if own profile OR user is Founder/Executive
    const canEdit = useMemo(() => {
        if (!currentUserProfile || !profile) return false
        
        // Can edit own profile
        if (currentUserProfile.id === profile.id) return true
        
        // Founders and Executives can edit any profile in their foundry
        if (['Founder', 'Executive'].includes(currentUserProfile.role)) {
            return currentUserProfile.foundry_id === profile.foundry_id
        }
        
        return false
    }, [currentUserProfile, profile])
    
    // Permission check: Can manage assignments (Founders/Executives only)
    const canManageAssignments = useMemo(() => {
        if (!currentUserProfile) return false
        return ['Founder', 'Executive'].includes(currentUserProfile.role)
    }, [currentUserProfile])
    
    // Current member metrics for comparison dialog
    const currentMemberMetrics = useMemo(() => {
        return allMembers.find(m => m.id === memberId) || null
    }, [allMembers, memberId])
    
    // ========================================================================
    // DATA FETCHING
    // ========================================================================
    
    useEffect(() => {
        const fetchAllData = async () => {
            if (!open || !memberId) return
            
            setIsLoading(true)
            
            try {
                // Fetch current user's profile (for permissions)
                const { data: currentUser } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', currentUserId)
                    .single()
                
                if (currentUser) {
                    setCurrentUserProfile(currentUser)
                }
                
                // Fetch target profile
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', memberId)
                    .single()
                
                if (profileData) {
                    setProfile(profileData)
                    
                    // Initialize edit fields
                    setEditedFullName(profileData.full_name || '')
                    setEditedEmail(profileData.email || '')
                    setEditedRole(profileData.role || '')
                    setEditedBio(profileData.bio || '')
                    setEditedPhoneNumber(profileData.phone_number || '')
                    setEditedLinkedinUrl(profileData.linkedin_url || '')
                    
                    // Fetch tasks assigned to this profile
                    const { data: tasksData } = await supabase
                        .from('tasks')
                        .select('*')
                        .eq('assignee_id', memberId)
                        .eq('foundry_id', profileData.foundry_id)
                        .order('created_at', { ascending: false })
                    
                    if (tasksData) {
                        setTasks(tasksData)
                    }
                    
                    // Fetch team memberships
                    const { data: membershipsData } = await supabase
                        .from('team_members')
                        .select('team_id, created_at, teams(id, name, created_at)')
                        .eq('profile_id', memberId)
                    
                    if (membershipsData) {
                        setTeamMemberships(membershipsData as TeamMembership[])
                    }
                    
                    // Fetch available teams (for "Add to Team" dropdown)
                    const { data: teamsData } = await supabase
                        .from('teams')
                        .select('id, name, created_at')
                        .eq('foundry_id', profileData.foundry_id)
                        .order('name')
                    
                    if (teamsData) {
                        // Filter out teams already joined
                        const joinedTeamIds = membershipsData?.map(m => m.team_id) || []
                        const availableTeamsFiltered = teamsData.filter(t => !joinedTeamIds.includes(t.id))
                        setAvailableTeams(availableTeamsFiltered)
                    }
                    
                    // Fetch unassigned tasks (for "Assign Task" dropdown)
                    const { data: unassignedData } = await supabase
                        .from('tasks')
                        .select('id, title, created_at')
                        .eq('foundry_id', profileData.foundry_id)
                        .is('assignee_id', null)
                        .order('created_at', { ascending: false })
                        .limit(50)
                    
                    if (unassignedData) {
                        setUnassignedTasks(unassignedData)
                    }
                    
                    // Fetch all profiles and tasks for comparison metrics
                    const { data: allProfiles } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('foundry_id', profileData.foundry_id)
                    
                    const { data: allTasks } = await supabase
                        .from('tasks')
                        .select('assignee_id, status')
                        .eq('foundry_id', profileData.foundry_id)
                    
                    // Calculate metrics for all members
                    const allMembersWithMetrics = (allProfiles || []).map(p => {
                        const memberTasks = (allTasks || []).filter(t => t.assignee_id === p.id)
                        return {
                            id: p.id,
                            full_name: p.full_name || 'Unknown',
                            email: p.email || '',
                            role: p.role,
                            activeTasks: memberTasks.filter(t => t.status === 'Accepted').length,
                            completedTasks: memberTasks.filter(t => t.status === 'Completed').length,
                            pendingTasks: memberTasks.filter(t => t.status === 'Pending').length,
                            rejectedTasks: memberTasks.filter(t => t.status === 'Rejected').length,
                        }
                    })
                    
                    setAllMembers(allMembersWithMetrics)
                }
            } catch (error) {
                console.error('[FullProfileView] Error fetching data:', error)
                toast.error('Failed to load profile data')
            } finally {
                setIsLoading(false)
            }
        }
        
        fetchAllData()
    }, [open, memberId, currentUserId, supabase])
    
    // ========================================================================
    // EDIT MODE HANDLERS
    // ========================================================================
    
    const handleEditClick = () => {
        if (!profile) return
        
        // Reset fields to current values
        setEditedFullName(profile.full_name || '')
        setEditedEmail(profile.email || '')
        setEditedRole(profile.role || '')
        setEditedBio(profile.bio || '')
        setEditedPhoneNumber(profile.phone_number || '')
        setEditedLinkedinUrl(profile.linkedin_url || '')
        
        setIsEditing(true)
    }
    
    const handleCancelEdit = () => {
        setIsEditing(false)
    }
    
    const handleSaveEdit = async () => {
        if (!profile) return
        
        setIsSaving(true)
        
        try {
            const result = await updateProfileDetails(profile.id, {
                full_name: editedFullName,
                email: editedEmail,
                role: editedRole,
                bio: editedBio,
                phone_number: editedPhoneNumber,
                linkedin_url: editedLinkedinUrl,
            })
            
            if (result.success) {
                toast.success('Profile updated successfully')
                setIsEditing(false)
                
                // Refresh profile data
                const { data: updatedProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', profile.id)
                    .single()
                
                if (updatedProfile) {
                    setProfile(updatedProfile)
                }
            } else {
                toast.error(result.error || 'Failed to update profile')
            }
        } catch (error) {
            console.error('[FullProfileView] Error saving profile:', error)
            toast.error('An unexpected error occurred')
        } finally {
            setIsSaving(false)
        }
    }
    
    // ========================================================================
    // TEAM ASSIGNMENT HANDLERS
    // ========================================================================
    
    const handleAddToTeam = async () => {
        if (!selectedTeamId || !profile) return
        
        setIsAssigningTeam(true)
        
        try {
            const result = await addMemberToTeam(profile.id, selectedTeamId)
            
            if (result.success) {
                toast.success('Added to team successfully')
                setSelectedTeamId('')
                
                // Refresh data
                const { data: membershipsData } = await supabase
                    .from('team_members')
                    .select('team_id, created_at, teams(id, name, created_at)')
                    .eq('profile_id', profile.id)
                
                if (membershipsData) {
                    setTeamMemberships(membershipsData as TeamMembership[])
                    
                    // Update available teams
                    const { data: teamsData } = await supabase
                        .from('teams')
                        .select('id, name, created_at')
                        .eq('foundry_id', profile.foundry_id)
                        .order('name')
                    
                    if (teamsData) {
                        const joinedTeamIds = membershipsData.map(m => m.team_id)
                        setAvailableTeams(teamsData.filter(t => !joinedTeamIds.includes(t.id)))
                    }
                }
            } else {
                toast.error(result.error || 'Failed to add to team')
            }
        } catch (error) {
            console.error('[FullProfileView] Error adding to team:', error)
            toast.error('An unexpected error occurred')
        } finally {
            setIsAssigningTeam(false)
        }
    }
    
    const handleRemoveFromTeam = async (teamId: string) => {
        if (!profile) return
        
        try {
            const result = await removeMemberFromTeam(profile.id, teamId)
            
            if (result.success) {
                toast.success('Removed from team successfully')
                
                // Refresh data
                const { data: membershipsData } = await supabase
                    .from('team_members')
                    .select('team_id, created_at, teams(id, name, created_at)')
                    .eq('profile_id', profile.id)
                
                if (membershipsData) {
                    setTeamMemberships(membershipsData as TeamMembership[])
                    
                    // Update available teams
                    const { data: teamsData } = await supabase
                        .from('teams')
                        .select('id, name, created_at')
                        .eq('foundry_id', profile.foundry_id)
                        .order('name')
                    
                    if (teamsData) {
                        const joinedTeamIds = membershipsData.map(m => m.team_id)
                        setAvailableTeams(teamsData.filter(t => !joinedTeamIds.includes(t.id)))
                    }
                }
            } else {
                toast.error(result.error || 'Failed to remove from team')
            }
        } catch (error) {
            console.error('[FullProfileView] Error removing from team:', error)
            toast.error('An unexpected error occurred')
        }
    }
    
    // ========================================================================
    // TASK ASSIGNMENT HANDLERS
    // ========================================================================
    
    const handleAssignTask = async () => {
        if (!selectedTaskId || !profile) return
        
        setIsAssigningTask(true)
        
        try {
            const result = await assignTaskToMember(selectedTaskId, profile.id)
            
            if (result.success) {
                toast.success('Task assigned successfully')
                setSelectedTaskId('')
                
                // Refresh tasks
                const { data: tasksData } = await supabase
                    .from('tasks')
                    .select('*')
                    .eq('assignee_id', profile.id)
                    .eq('foundry_id', profile.foundry_id)
                    .order('created_at', { ascending: false })
                
                if (tasksData) {
                    setTasks(tasksData)
                }
                
                // Refresh unassigned tasks
                const { data: unassignedData } = await supabase
                    .from('tasks')
                    .select('id, title, created_at')
                    .eq('foundry_id', profile.foundry_id)
                    .is('assignee_id', null)
                    .order('created_at', { ascending: false })
                    .limit(50)
                
                if (unassignedData) {
                    setUnassignedTasks(unassignedData)
                }
            } else {
                toast.error(result.error || 'Failed to assign task')
            }
        } catch (error) {
            console.error('[FullProfileView] Error assigning task:', error)
            toast.error('An unexpected error occurred')
        } finally {
            setIsAssigningTask(false)
        }
    }
    
    const handleUnassignTask = async (taskId: string) => {
        if (!profile) return
        
        try {
            const result = await unassignTaskFromMember(taskId, profile.id)
            
            if (result.success) {
                toast.success('Task unassigned successfully')
                
                // Refresh tasks
                const { data: tasksData } = await supabase
                    .from('tasks')
                    .select('*')
                    .eq('assignee_id', profile.id)
                    .eq('foundry_id', profile.foundry_id)
                    .order('created_at', { ascending: false })
                
                if (tasksData) {
                    setTasks(tasksData)
                }
                
                // Refresh unassigned tasks
                const { data: unassignedData } = await supabase
                    .from('tasks')
                    .select('id, title, created_at')
                    .eq('foundry_id', profile.foundry_id)
                    .is('assignee_id', null)
                    .order('created_at', { ascending: false })
                    .limit(50)
                
                if (unassignedData) {
                    setUnassignedTasks(unassignedData)
                }
            } else {
                toast.error(result.error || 'Failed to unassign task')
            }
        } catch (error) {
            console.error('[FullProfileView] Error unassigning task:', error)
            toast.error('An unexpected error occurred')
        }
    }
    
    // ========================================================================
    // RENDER
    // ========================================================================
    
    if (!open) return null
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="h-[90vh] flex flex-col p-0 gap-0">
                {/* Fixed Header */}
                <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
                    {isLoading ? (
                        <div className="flex items-center gap-4">
                            <DialogTitle className="sr-only">Loading profile...</DialogTitle>
                            <div className="h-32 w-32 bg-muted rounded-full animate-pulse" />
                            <div className="flex-1">
                                <div className="h-8 w-64 bg-muted rounded animate-pulse mb-2" />
                                <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                            </div>
                        </div>
                    ) : profile ? (
                        <div className="flex items-start gap-6">
                            <UserAvatar
                                name={profile.full_name}
                                role={profile.role}
                                size="3xl"
                                className="border-4 border-slate-50 shadow-inner"
                            />
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        {isEditing ? (
                                            <div className="space-y-4">
                                                <DialogTitle className="sr-only">Editing {profile.full_name}</DialogTitle>
                                                <div>
                                                    <Label htmlFor="full_name" className="text-sm font-medium">
                                                        Full Name <span className="text-destructive">*</span>
                                                    </Label>
                                                    <Input
                                                        id="full_name"
                                                        value={editedFullName}
                                                        onChange={(e) => setEditedFullName(e.target.value)}
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor="email" className="text-sm font-medium">
                                                        Email <span className="text-destructive">*</span>
                                                    </Label>
                                                    <Input
                                                        id="email"
                                                        type="email"
                                                        value={editedEmail}
                                                        onChange={(e) => setEditedEmail(e.target.value)}
                                                        className="mt-1"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <DialogTitle className="text-3xl font-bold text-foreground mb-2">
                                                    {profile.full_name}
                                                </DialogTitle>
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Mail className="h-4 w-4" />
                                                    <span>{profile.email}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {isEditing ? (
                                            <Select value={editedRole} onValueChange={setEditedRole}>
                                                <SelectTrigger className="w-40">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Founder">Founder</SelectItem>
                                                    <SelectItem value="Executive">Executive</SelectItem>
                                                    <SelectItem value="Apprentice">Apprentice</SelectItem>
                                                    <SelectItem value="AI_Agent">AI Agent</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Badge variant="secondary" className="text-lg px-4 py-1 bg-muted">
                                                {profile.role}
                                            </Badge>
                                        )}
                                        
                                        {canEdit && (
                                            isEditing ? (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={handleCancelEdit}
                                                        disabled={isSaving}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        onClick={handleSaveEdit}
                                                        disabled={isSaving}
                                                    >
                                                        {isSaving ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Check className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={handleEditClick}
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <DialogTitle>Profile not found</DialogTitle>
                    )}
                </DialogHeader>
                
                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                    {isLoading ? (
                        <div className="space-y-6">
                            <div className="h-32 bg-muted rounded animate-pulse" />
                            <div className="h-32 bg-muted rounded animate-pulse" />
                            <div className="h-32 bg-muted rounded animate-pulse" />
                        </div>
                    ) : profile ? (
                        <>
                            {/* Bio Section */}
                            <div className="bg-muted rounded-lg p-6 space-y-4">
                                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">About</h3>
                                {isEditing ? (
                                    <Textarea
                                        value={editedBio}
                                        onChange={(e) => setEditedBio(e.target.value)}
                                        placeholder="Write a bio..."
                                        className="min-h-[100px]"
                                    />
                                ) : profile.bio ? (
                                    <Markdown content={profile.bio} />
                                ) : (
                                    <p className="text-muted-foreground italic">No bio yet</p>
                                )}
                            </div>
                            
                            {/* Contact Details Section */}
                            <div className="bg-muted rounded-lg p-6 space-y-4">
                                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Contact Details</h3>
                                
                                {isEditing ? (
                                    <div className="space-y-4">
                                        <div>
                                            <Label htmlFor="phone_number" className="text-sm font-medium">
                                                Phone Number
                                            </Label>
                                            <Input
                                                id="phone_number"
                                                type="tel"
                                                value={editedPhoneNumber}
                                                onChange={(e) => setEditedPhoneNumber(e.target.value)}
                                                placeholder="+1 (555) 123-4567"
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="linkedin_url" className="text-sm font-medium">
                                                LinkedIn URL
                                            </Label>
                                            <Input
                                                id="linkedin_url"
                                                type="url"
                                                value={editedLinkedinUrl}
                                                onChange={(e) => setEditedLinkedinUrl(e.target.value)}
                                                placeholder="https://linkedin.com/in/username"
                                                className="mt-1"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {profile.phone_number && (
                                            <div className="flex items-center gap-2 text-foreground">
                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                <span>{profile.phone_number}</span>
                                            </div>
                                        )}
                                        {profile.linkedin_url && (
                                            <div className="flex items-center gap-2">
                                                <Linkedin className="h-4 w-4 text-muted-foreground" />
                                                <a
                                                    href={profile.linkedin_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-primary hover:underline"
                                                >
                                                    LinkedIn Profile
                                                </a>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Calendar className="h-4 w-4" />
                                            <span>Joined {format(new Date(profile.created_at), 'MMM d, yyyy')}</span>
                                        </div>
                                        {!profile.phone_number && !profile.linkedin_url && (
                                            <p className="text-muted-foreground italic">No contact details added</p>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {/* Metrics Grid */}
                            <div className="bg-muted rounded-lg p-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-status-info-light text-status-info rounded-lg">
                                            <Briefcase className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="text-sm text-muted-foreground">Active Tasks</div>
                                            <div className="font-semibold text-foreground">{activeTasks.length}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-status-success-light text-status-success rounded-lg">
                                            <Shield className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="text-sm text-muted-foreground">Completed</div>
                                            <div className="font-semibold text-foreground">{completedTasks.length}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-status-warning-light text-status-warning rounded-lg">
                                            <Award className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="text-sm text-muted-foreground">Reputation</div>
                                            <div className="font-semibold text-foreground">Good</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Teams Section */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                        <Users className="h-4 w-4" /> Teams
                                        <Badge variant="secondary" className="text-xs">{teamMemberships.length}</Badge>
                                    </h2>
                                    {canManageAssignments && availableTeams.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                                                <SelectTrigger className="w-48">
                                                    <SelectValue placeholder="Select team..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableTeams.map(team => (
                                                        <SelectItem key={team.id} value={team.id}>
                                                            {team.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                size="sm"
                                                onClick={handleAddToTeam}
                                                disabled={!selectedTeamId || isAssigningTeam}
                                            >
                                                {isAssigningTeam ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Plus className="h-4 w-4 mr-2" />
                                                        Add
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="bg-background border border-slate-200 rounded-lg overflow-hidden">
                                    {teamMemberships.length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground">
                                            Not on any teams yet
                                        </div>
                                    ) : (
                                        teamMemberships.map(membership => (
                                            <div
                                                key={membership.team_id}
                                                className="p-4 border-b border-slate-100 last:border-0 hover:bg-muted flex justify-between items-center"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Users className="h-4 w-4 text-muted-foreground" />
                                                    <div>
                                                        <div className="font-medium text-foreground">
                                                            {membership.teams.name}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            Joined {formatDistanceToNow(new Date(membership.created_at), { addSuffix: true })}
                                                        </div>
                                                    </div>
                                                </div>
                                                {canManageAssignments && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveFromTeam(membership.team_id)}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            
                            {/* Current Tasks Section */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                        <Briefcase className="h-4 w-4" /> Current Tasks
                                        <Badge variant="secondary" className="text-xs">{activeTasks.length}</Badge>
                                    </h2>
                                    {canManageAssignments && unassignedTasks.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                                                <SelectTrigger className="w-48">
                                                    <SelectValue placeholder="Select task..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {unassignedTasks.map(task => (
                                                        <SelectItem key={task.id} value={task.id}>
                                                            {task.title}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                size="sm"
                                                onClick={handleAssignTask}
                                                disabled={!selectedTaskId || isAssigningTask}
                                            >
                                                {isAssigningTask ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Plus className="h-4 w-4 mr-2" />
                                                        Assign
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="bg-background border border-slate-200 rounded-lg overflow-hidden">
                                    {activeTasks.length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground">
                                            No active tasks
                                        </div>
                                    ) : (
                                        activeTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className="p-4 border-b border-slate-100 last:border-0 hover:bg-muted flex justify-between items-center"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-foreground">{task.title}</div>
                                                    {task.description && (
                                                        <div className="text-sm text-muted-foreground truncate max-w-md">
                                                            {task.description}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant={task.status === 'Accepted' ? 'default' : 'secondary'}>
                                                        {task.status}
                                                    </Badge>
                                                    {canManageAssignments && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleUnassignTask(task.id)}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            
                            {/* Completed Tasks Section */}
                            <div>
                                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
                                    <Check className="h-4 w-4" /> Completed Tasks
                                    <Badge variant="secondary" className="text-xs">{completedTasks.length}</Badge>
                                </h2>
                                <div className="bg-background border border-slate-200 rounded-lg overflow-hidden">
                                    {completedTasks.length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground">
                                            No completed tasks yet
                                        </div>
                                    ) : (
                                        completedTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className="p-4 border-b border-slate-100 last:border-0 hover:bg-muted flex justify-between items-center"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-foreground">{task.title}</div>
                                                    {task.description && (
                                                        <div className="text-sm text-muted-foreground truncate max-w-md">
                                                            {task.description}
                                                        </div>
                                                    )}
                                                </div>
                                                <Badge variant="secondary" className="bg-status-success-light text-status-success-dark border-status-success">
                                                    Completed
                                                </Badge>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    )
}
