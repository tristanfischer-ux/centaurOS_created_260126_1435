"use client"

import { useState, useTransition } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Check, X, GitCompare, Users, MoreHorizontal, Pencil, Trash2, Loader2, AlertTriangle, Mail, Phone } from "lucide-react"
import { createTeam, addTeamMember, deleteMember } from "@/actions/team"
import { deleteTeam, updateTeamName } from "@/actions/teams"
import Link from "next/link"
import { CreateTeamDialog } from "./create-team-dialog"
import { InviteMemberDialog } from "./invite-member-dialog"
import { pairCentaur, unpairCentaur } from "@/actions/team"
import { Brain, Unplug, Zap } from "lucide-react"
import { toast } from "sonner"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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


interface Member {
    id: string
    full_name: string | null
    email: string | null
    bio?: string | null
    phone_number?: string | null
    role: string
    activeTasks: number
    completedTasks: number
    pendingTasks: number
    rejectedTasks: number
    paired_ai_id?: string | null
    pairedAI?: { id: string, full_name: string | null, avatar_url: string | null, role: string }[] | null
}

interface TeamMember {
    id: string
    full_name: string | null
    role: string | null
    email: string | null
}

interface Team {
    id: string
    name: string
    is_auto_generated: boolean | null
    created_at: string | null
    members: TeamMember[]
}

interface TeamComparisonViewProps {
    founders: Member[]
    executives: Member[]
    apprentices: Member[]
    aiAgents: Member[]
    teams: Team[]
}

export function TeamComparisonView({ founders, executives, apprentices, aiAgents, teams }: TeamComparisonViewProps) {
    const [compareMode, setCompareMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [showComparison, setShowComparison] = useState(false)

    // Drag-and-drop team creation state
    const [draggedMemberId, setDraggedMemberId] = useState<string | null>(null)
    const [dropTargetId, setDropTargetId] = useState<string | null>(null)
    const [showQuickTeamDialog, setShowQuickTeamDialog] = useState(false)
    const [quickTeamMemberIds, setQuickTeamMemberIds] = useState<string[]>([])
    const [teamName, setTeamName] = useState("")
    const [teamError, setTeamError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    // Edit/Delete Team State
    const [teamToEdit, setTeamToEdit] = useState<{ id: string, name: string } | null>(null)
    const [teamToDelete, setTeamToDelete] = useState<string | null>(null)
    const [memberToDelete, setMemberToDelete] = useState<string | null>(null)
    const [newName, setNewName] = useState("")

    const allMembers = [...executives, ...apprentices]
    const selectedMembers = allMembers.filter(m => selectedIds.has(m.id))
    const quickTeamMembers = allMembers.filter(m => quickTeamMemberIds.includes(m.id))

    // Helper: get initials from full name
    const getInitials = (name: string | null) => {
        if (!name) return '?'
        const parts = name.trim().split(/\s+/)
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
    }

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else if (newSet.size < 4) {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const toggleCompareMode = () => {
        if (compareMode) {
            setSelectedIds(new Set())
        }
        setCompareMode(!compareMode)
    }

    // Drag-and-drop handlers
    const handleDragStart = (e: React.DragEvent, memberId: string) => {
        setDraggedMemberId(memberId)
        // Use text/plain for Safari compatibility
        e.dataTransfer.setData('text/plain', memberId)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent, memberId: string) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        // Get the dragged ID from dataTransfer for Safari
        const draggedId = draggedMemberId || e.dataTransfer.getData('text/plain')
        if (draggedId && draggedId !== memberId) {
            setDropTargetId(memberId)
        }
    }

    const handleDragLeave = () => {
        setDropTargetId(null)
    }

    const handleDrop = (e: React.DragEvent, targetMemberId: string) => {
        e.preventDefault()
        // Get the dragged ID from dataTransfer (more reliable for Safari)
        const draggedId = e.dataTransfer.getData('text/plain') || draggedMemberId

        // --- Centaur Pairing Logic ---
        const draggedMember = [...allMembers, ...aiAgents].find(m => m.id === draggedId)
        const targetMember = [...allMembers, ...aiAgents].find(m => m.id === targetMemberId)

        if (draggedMember && targetMember) {
            // Case 1: Dragging AI onto Human
            if (draggedMember.role === 'AI_Agent' && targetMember.role !== 'AI_Agent') {
                startTransition(async () => {
                    const res = await pairCentaur(targetMember.id, draggedMember.id)
                    if (res?.error) toast.error(res.error)
                    else toast.success(`Paired ${targetMember.full_name} with ${draggedMember.full_name}`)
                })
                setDraggedMemberId(null)
                setDropTargetId(null)
                return
            }
            // Case 2: Dragging Human onto AI
            if (draggedMember.role !== 'AI_Agent' && targetMember.role === 'AI_Agent') {
                startTransition(async () => {
                    const res = await pairCentaur(draggedMember.id, targetMember.id)
                    if (res?.error) toast.error(res.error)
                    else toast.success(`Paired ${draggedMember.full_name} with ${targetMember.full_name}`)
                })
                setDraggedMemberId(null)
                setDropTargetId(null)
                return
            }
        }

        if (draggedId && draggedId !== targetMemberId) {
            // Open quick team creation dialog with both members
            setQuickTeamMemberIds([draggedId, targetMemberId])
            setTeamName("")
            setTeamError(null)
            setShowQuickTeamDialog(true)
        }
        setDraggedMemberId(null)
        setDropTargetId(null)
    }

    const handleDragEnd = () => {
        setDraggedMemberId(null)
        setDropTargetId(null)
    }

    const handleUpdateName = async () => {
        if (!teamToEdit || !newName.trim()) return

        startTransition(async () => {
            try {
                await updateTeamName(teamToEdit.id, newName)
                setTeamToEdit(null)
                setNewName("")
            } catch (error) {
                console.error(error)
            }
        })
    }

    const handleDeleteTeam = async () => {
        if (!teamToDelete) return

        startTransition(async () => {
            try {
                await deleteTeam(teamToDelete)
                setTeamToDelete(null)
            } catch (error) {
                console.error(error)
            }
        })
    }

    const handleDeleteMember = async () => {
        if (!memberToDelete) return

        startTransition(async () => {
            const res = await deleteMember(memberToDelete)
            if (res?.error) toast.error(res.error)
            else {
                toast.success("Member removed")
                setMemberToDelete(null)
            }
        })
    }

    const handleCreateQuickTeam = () => {
        if (!teamName.trim()) {
            setTeamError("Team name is required")
            return
        }
        setTeamError(null)
        startTransition(async () => {
            const result = await createTeam(teamName.trim(), quickTeamMemberIds)
            if (result.error) {
                setTeamError(result.error)
            } else {
                setShowQuickTeamDialog(false)
                setQuickTeamMemberIds([])
                setTeamName("")
            }
        })
    }

    // Comparison attribute rows
    const comparisonRows = [
        { label: "Role", getValue: (m: Member) => m.role },
        { label: "Email", getValue: (m: Member) => m.email || "-" },
        { label: "Active Tasks", getValue: (m: Member) => m.activeTasks, highlight: true },
        { label: "Completed", getValue: (m: Member) => m.completedTasks, highlight: true, good: true },
        { label: "Pending", getValue: (m: Member) => m.pendingTasks },
        { label: "Rejected", getValue: (m: Member) => m.rejectedTasks, caution: true },
    ]

    const MemberCard = ({ member, type }: { member: Member, type: 'founder' | 'executive' | 'apprentice' | 'ai_agent' }) => {
        const isSelected = selectedIds.has(member.id)
        const isFounder = type === 'founder'
        const isExecutive = type === 'executive'
        const isAIAgent = type === 'ai_agent'
        const isDragging = draggedMemberId === member.id
        const isDropTarget = dropTargetId === member.id && draggedMemberId !== member.id

        // Centaur Status
        const pairedAI = member.pairedAI?.[0]
        const isCentaur = !!member.paired_ai_id && !!pairedAI

        // Determine styles based on type
        let borderClass = 'border-slate-200'
        let ringClass = 'ring-blue-500 border-blue-500'
        let hoverBorderClass = 'group-hover:border-blue-400'
        let bgCheckClass = 'bg-blue-500'
        let avatarBorderClass = 'border border-slate-200'
        let avatarBgClass = 'bg-slate-100 text-slate-500'
        let badgeClass = 'bg-slate-100 text-slate-600'

        if (isAIAgent) {
            borderClass = 'border-indigo-200 bg-indigo-50/30'
            ringClass = 'ring-indigo-500 border-indigo-500'
            hoverBorderClass = 'group-hover:border-indigo-400'
            bgCheckClass = 'bg-indigo-500'
            avatarBorderClass = 'border-2 border-indigo-300'
            avatarBgClass = 'bg-indigo-100 text-indigo-700 font-bold'
            badgeClass = 'text-indigo-600 border-indigo-200 bg-indigo-50'
        } else if (isFounder) {
            // ... existing founder styles ...
            borderClass = 'border-purple-200'
            ringClass = 'ring-purple-500 border-purple-500'
            hoverBorderClass = 'group-hover:border-purple-400'
            bgCheckClass = 'bg-purple-500'
            avatarBorderClass = 'border-2 border-purple-500'
            avatarBgClass = 'bg-purple-100 text-purple-700 font-bold'
            badgeClass = 'text-purple-600 border-purple-200 bg-purple-50'
        } else if (isExecutive) {
            // ... existing executive styles ...
            borderClass = 'border-amber-200'
            ringClass = 'ring-amber-500 border-amber-500'
            hoverBorderClass = 'group-hover:border-amber-500'
            // Keeping original logic for brevity in replace
            hoverBorderClass = 'group-hover:border-amber-400'
            bgCheckClass = 'bg-amber-500'
            avatarBorderClass = 'border-2 border-amber-500'
            avatarBgClass = 'bg-amber-100 text-amber-700 font-bold'
            badgeClass = 'text-amber-600 border-amber-200 bg-amber-50'
        }

        // Centaur Override
        if (isCentaur) {
            borderClass = 'border-amber-400 shadow-md ring-1 ring-amber-400/50'
            hoverBorderClass = 'group-hover:border-amber-500'
        }

        const cardContent = (
            <Card className={`
                bg-white border shadow-sm transition-all cursor-pointer relative
                ${borderClass}
                ${hoverBorderClass}
                ${compareMode && isSelected ? `ring-2 ${ringClass}` : ''}
                ${isDragging ? 'opacity-50 scale-95' : ''}
                ${isDropTarget ? 'ring-2 ring-green-500 border-green-500 bg-green-50' : ''}
            `}>
                {compareMode && (
                    <div className={`absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center text-white text-xs
                        ${isSelected ? bgCheckClass : 'bg-slate-200'}
                    `}>
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                    </div>
                )}

                {isDropTarget && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 rounded-lg z-10 backdrop-blur-[1px]">
                        {/* Dynamic Drop Text based on what we are dragging */}
                        <div className="bg-green-600 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 shadow-sm">
                            <Zap className="h-3 w-3 fill-white" />
                            {draggedMemberId && aiAgents.some(a => a.id === draggedMemberId) ? 'Pair Centaur' : 'Combine / Team'}
                        </div>
                    </div>
                )}
                <CardHeader className="flex flex-row items-center gap-4 pb-2 relative">
                    {/* Main Avatar */}
                    <div className="relative">
                        <Avatar className={`h-12 w-12 ${avatarBorderClass}`}>
                            <AvatarFallback className={avatarBgClass}>
                                {isAIAgent ? <Brain className="h-6 w-6" /> : getInitials(member.full_name)}
                            </AvatarFallback>
                        </Avatar>

                        {/* Paired AI Badge (Little Avatar) */}
                        {isCentaur && (
                            <div className="absolute -bottom-1 -right-2 bg-white rounded-full p-[2px] shadow-sm border border-slate-200" title={`Paired with ${pairedAI.full_name}`}>
                                <Avatar className="h-6 w-6 border border-indigo-200">
                                    <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[8px]">
                                        <Brain className="h-3 w-3" />
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-lg text-slate-900 truncate">
                                    {member.full_name}
                                </CardTitle>
                                {isCentaur && (
                                    <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 h-5 px-1.5 border-amber-200">
                                        Centaur
                                    </Badge>
                                )}
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                        }}
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" sideOffset={8}>
                                    <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setMemberToDelete(member.id)
                                        }}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete Person
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-[10px] ${badgeClass}`}>
                                {member.role}
                            </Badge>
                            {isCentaur && (
                                <div className="text-[10px] text-slate-400 flex items-center gap-1" title="Unpair">
                                    <span className="truncate max-w-[80px]">w/ {pairedAI.full_name}</span>
                                    <button
                                        aria-label="Unpair Centaur"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            startTransition(async () => {
                                                await unpairCentaur(member.id)
                                                toast.success("Centaur unpaired")
                                            })
                                        }}
                                        className="hover:bg-red-100 hover:text-red-600 rounded p-0.5 transition-colors"
                                    >
                                        <Unplug className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="text-sm text-slate-500 space-y-3">
                    {/* Contact Info */}
                    <div className="space-y-1">
                        {member.email && (
                            <div className="flex items-center gap-2 text-xs">
                                <Mail className="h-3 w-3 text-slate-400" />
                                <span className="truncate">{member.email}</span>
                            </div>
                        )}
                        {member.phone_number && (
                            <div className="flex items-center gap-2 text-xs">
                                <Phone className="h-3 w-3 text-slate-400" />
                                <span className="truncate">{member.phone_number}</span>
                            </div>
                        )}
                    </div>

                    {/* Bio */}
                    {member.bio && (
                        <p className="text-xs text-slate-600 line-clamp-2 italic">
                            {member.bio}
                        </p>
                    )}

                    <div className="flex gap-4 text-xs pt-1 border-t border-slate-100">
                        <span className="text-green-600">{member.completedTasks} done</span>
                        <span className="text-blue-600">{member.activeTasks} active</span>
                        <span className="text-slate-400">{member.pendingTasks} pending</span>
                    </div>
                </CardContent>
            </Card>
        )

        // In compare mode, don't allow drag-drop
        if (compareMode) {
            return (
                <div className="block group" onClick={() => toggleSelection(member.id)}>
                    {cardContent}
                </div>
            )
        }

        // Normal mode: draggable cards with link functionality
        return (
            <div
                draggable={true}
                onDragStart={(e) => handleDragStart(e, member.id)}
                onDragOver={(e) => handleDragOver(e, member.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, member.id)}
                onDragEnd={handleDragEnd}
                className="block group cursor-grab active:cursor-grabbing"
            >
                <Link
                    href={`/team/${member.id}`}
                    draggable={false}
                    onClick={(e) => { if (draggedMemberId) e.preventDefault() }}
                >
                    {cardContent}
                </Link>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Foundry Roster</h1>
                    <p className="text-gray-400">Manage your Executives and Apprentices.</p>
                </div>
                <div className="flex items-center gap-2">
                    <InviteMemberDialog />
                    <CreateTeamDialog members={[...executives, ...apprentices]} />

                    {compareMode && selectedIds.size >= 2 && (
                        <Button
                            onClick={() => setShowComparison(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            <GitCompare className="h-4 w-4 mr-2" />
                            Compare {selectedIds.size}
                        </Button>
                    )}
                    <Button
                        variant={compareMode ? "default" : "outline"}
                        onClick={toggleCompareMode}
                        className={compareMode ? "bg-slate-800" : ""}
                    >
                        {compareMode ? <X className="h-4 w-4 mr-2" /> : <GitCompare className="h-4 w-4 mr-2" />}
                        {compareMode ? "Cancel" : "Compare"}
                    </Button>
                </div>
            </div>

            {compareMode && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                    Select 2-4 team members to compare. Click a card to select.
                    {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}
                </div>
            )}

            {/* Founders Section */}
            {founders.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-purple-600 uppercase tracking-wider border-b border-slate-200 pb-2">
                        Founders (Decide)
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {founders.map(member => (
                            <MemberCard key={member.id} member={member} type="founder" />
                        ))}
                    </div>
                </section>
            )}

            {/* Executives Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-amber-600 uppercase tracking-wider border-b border-slate-200 pb-2">
                    Executives (Evaluate)
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {executives.map(member => (
                        <MemberCard key={member.id} member={member} type="executive" />
                    ))}
                    {executives.length === 0 && (
                        <div className="col-span-full py-8 text-center text-gray-500 italic">No executives listed.</div>
                    )}
                </div>
            </section>

            {/* Apprentices Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-blue-600 uppercase tracking-wider border-b border-slate-200 pb-2">
                    Apprentices (Do)
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {apprentices.map(member => (
                        <MemberCard key={member.id} member={member} type="apprentice" />
                    ))}
                    {apprentices.length === 0 && (
                        <div className="col-span-full py-8 text-center text-gray-500 italic">No apprentices listed.</div>
                    )}
                </div>
            </section>

            {/* Neural Network (AI Agents) */}
            {aiAgents.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-indigo-600 uppercase tracking-wider border-b border-indigo-200 pb-2 flex items-center gap-2">
                        <Brain className="h-5 w-5" />
                        Neural Network (AI Agents)
                    </h2>
                    <p className="text-sm text-slate-500 italic pb-2">
                        Drag an AI Agent onto a human member to form a Centaur pair.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {aiAgents.map(member => (
                            <MemberCard key={member.id} member={member} type="ai_agent" />
                        ))}
                    </div>
                </section>
            )}

            {/* Teams Section */}
            {teams.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-green-600 uppercase tracking-wider border-b border-slate-200 pb-2">
                        Teams
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {teams.map(team => {
                            const isDropTarget = dropTargetId === team.id

                            return (
                                <Card
                                    key={team.id}
                                    className={`
                                        bg-white border-slate-200 shadow-sm transition-all group relative
                                        ${isDropTarget ? 'ring-2 ring-green-500 border-green-500 bg-green-50' : 'hover:border-green-400'}
                                    `}
                                    onDragOver={(e) => {
                                        e.preventDefault()
                                        e.dataTransfer.dropEffect = 'move'
                                        const draggedId = draggedMemberId || e.dataTransfer.getData('text/plain')
                                        if (draggedId && !team.members.some(m => m.id === draggedId)) {
                                            setDropTargetId(team.id)
                                        }
                                    }}
                                    onDragLeave={() => setDropTargetId(null)}
                                    onDrop={(e) => {
                                        e.preventDefault()
                                        const draggedId = e.dataTransfer.getData('text/plain') || draggedMemberId

                                        if (draggedId && !team.members.some(m => m.id === draggedId)) {
                                            startTransition(async () => {
                                                await addTeamMember(team.id, draggedId)
                                            })
                                        }
                                        setDropTargetId(null)
                                        setDraggedMemberId(null)
                                    }}
                                >
                                    {isDropTarget && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 rounded-lg z-10">
                                            <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                Add to Team
                                            </div>
                                        </div>
                                    )}
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-lg text-slate-900 truncate pr-6">{team.name}</CardTitle>

                                            <div className="flex items-center gap-2">
                                                {team.is_auto_generated && (
                                                    <Badge variant="outline" className="text-[10px] text-slate-400">Auto</Badge>
                                                )}

                                                {/* Team Actions Dropdown */}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-[160px] bg-white border-slate-200" sideOffset={8}>
                                                        <DropdownMenuItem onClick={() => {
                                                            setTeamToEdit({ id: team.id, name: team.name })
                                                            setNewName(team.name)
                                                        }}>
                                                            <Pencil className="mr-2 h-4 w-4" /> Rename
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => setTeamToDelete(team.id)}
                                                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2">
                                            {/* Member avatars */}
                                            <div className="flex -space-x-2">
                                                {(team.members || []).slice(0, 4).map(member => (
                                                    <Avatar key={member.id} className="h-8 w-8 border-2 border-white">
                                                        <AvatarFallback className="bg-green-100 text-green-700 text-xs font-bold">
                                                            {getInitials(member.full_name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ))}
                                                {(team.members || []).length > 4 && (
                                                    <div className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs text-slate-600">
                                                        +{(team.members || []).length - 4}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-sm text-slate-500 ml-2">{(team.members || []).length} members</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Comparison Dialog */}
            <Dialog open={showComparison} onOpenChange={setShowComparison}>
                <DialogContent className="max-w-4xl bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Compare Team Members</DialogTitle>
                        <DialogDescription>Side-by-side comparison of selected members</DialogDescription>
                    </DialogHeader>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            {/* Member Headers */}
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="py-4 px-4 text-left text-slate-500 font-medium w-32"></th>
                                    {selectedMembers.map(member => (
                                        <th key={member.id} className="py-4 px-6 text-center min-w-[160px]">
                                            <div className="flex flex-col items-center gap-2">
                                                <Avatar className="h-16 w-16 border-2 border-slate-200">
                                                    <AvatarFallback className="bg-slate-100 text-slate-600 text-lg font-bold">
                                                        {member.full_name?.substring(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="font-semibold text-slate-900">{member.full_name}</span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            {/* Comparison Rows */}
                            <tbody>
                                {comparisonRows.map((row, idx) => (
                                    <tr key={row.label} className={`${idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                                        <td className="py-3 px-4 text-slate-500 font-medium text-sm">{row.label}</td>
                                        {selectedMembers.map(member => {
                                            const value = row.getValue(member)
                                            const isNumeric = typeof value === 'number'

                                            // Find best value for highlighting
                                            const allValues = selectedMembers.map(m => row.getValue(m))
                                            const numericValues = allValues.filter(v => typeof v === 'number') as number[]
                                            const maxVal = Math.max(...numericValues)
                                            const isBest = isNumeric && row.good && value === maxVal
                                            const isWorst = isNumeric && row.caution && value === maxVal && value > 0

                                            return (
                                                <td
                                                    key={member.id}
                                                    className={`py-3 px-6 text-center font-medium
                                                        ${isBest ? 'text-green-600 bg-green-50' : ''}
                                                        ${isWorst ? 'text-red-600 bg-red-50' : ''}
                                                        ${!isBest && !isWorst ? 'text-slate-900' : ''}
                                                    `}
                                                >
                                                    {value}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Quick Team Creation Dialog (from drag-drop) */}
            <Dialog open={showQuickTeamDialog} onOpenChange={setShowQuickTeamDialog}>
                <DialogContent className="sm:max-w-[400px] bg-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-slate-900">
                            <Users className="h-5 w-5 text-green-600" />
                            Create Team
                        </DialogTitle>
                        <DialogDescription>
                            Name your new team with these members
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 pt-2">
                        {/* Show the two members being combined */}
                        <div className="flex items-center justify-center gap-4 py-4">
                            {quickTeamMembers.map((member, idx) => (
                                <div key={member.id} className="flex flex-col items-center">
                                    <Avatar className="h-14 w-14 border-2 border-green-500">
                                        <AvatarFallback className="bg-green-100 text-green-700 font-bold">
                                            {getInitials(member.full_name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm font-medium text-slate-900 mt-2">{member.full_name?.split(' ')[0]}</span>
                                    {idx < quickTeamMembers.length - 1 && (
                                        <span className="absolute text-2xl text-green-600">+</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="quickTeamName">Team Name</Label>
                            <Input
                                id="quickTeamName"
                                placeholder="e.g., Project Alpha, Design Squad..."
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateQuickTeam() }}
                                autoFocus
                            />
                        </div>

                        {teamError && (
                            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                                {teamError}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                            <Button variant="outline" onClick={() => setShowQuickTeamDialog(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateQuickTeam}
                                disabled={isPending || !teamName.trim()}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {isPending ? "Creating..." : "Create Team"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            {/* Rename Team Dialog */}
            <Dialog open={!!teamToEdit} onOpenChange={(open) => !open && setTeamToEdit(null)}>
                <DialogContent className="sm:max-w-[425px] bg-white text-slate-900 border-slate-200">
                    <DialogHeader>
                        <DialogTitle>Rename Team</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-team-name">Team Name</Label>
                            <Input
                                id="edit-team-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Team Name"
                                autoFocus
                                className="bg-white border-slate-300"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTeamToEdit(null)}>Cancel</Button>
                        <Button onClick={handleUpdateName} disabled={isPending || !newName.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!teamToDelete} onOpenChange={(open) => !open && setTeamToDelete(null)}>
                <AlertDialogContent className="bg-white text-slate-900 border-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Delete Team?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this team. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteTeam} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
                            Delete Team
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Member Delete/Archive Confirmation */}
            <AlertDialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
                <AlertDialogContent className="bg-white text-slate-900 border-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Remove Person?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove the person from the roster.
                            <br /><br />
                            <strong>Ownership Transfer:</strong> Any Tasks or Objectives created by this person will be reassigned to you.
                            <br />
                            <strong>Unassignment:</strong> Any Tasks assigned to them will become unassigned.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteMember} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
                            Remove Person
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </div >
    )
}


