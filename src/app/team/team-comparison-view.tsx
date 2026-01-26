"use client"

import { useState, useTransition } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Check, X, GitCompare, Users } from "lucide-react"
import { createTeam } from "@/actions/team"
import Link from "next/link"

interface Member {
    id: string
    full_name: string | null
    email: string | null
    role: string
    activeTasks: number
    completedTasks: number
    pendingTasks: number
    rejectedTasks: number
}

interface TeamComparisonViewProps {
    executives: Member[]
    apprentices: Member[]
}

export function TeamComparisonView({ executives, apprentices }: TeamComparisonViewProps) {
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
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent, memberId: string) => {
        e.preventDefault()
        if (draggedMemberId && draggedMemberId !== memberId) {
            setDropTargetId(memberId)
        }
    }

    const handleDragLeave = () => {
        setDropTargetId(null)
    }

    const handleDrop = (e: React.DragEvent, targetMemberId: string) => {
        e.preventDefault()
        if (draggedMemberId && draggedMemberId !== targetMemberId) {
            // Open quick team creation dialog with both members
            setQuickTeamMemberIds([draggedMemberId, targetMemberId])
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

    const MemberCard = ({ member, type }: { member: Member, type: 'executive' | 'apprentice' }) => {
        const isSelected = selectedIds.has(member.id)
        const isExecutive = type === 'executive'
        const isDragging = draggedMemberId === member.id
        const isDropTarget = dropTargetId === member.id && draggedMemberId !== member.id

        const cardContent = (
            <Card className={`
                bg-white border-slate-200 shadow-sm transition-all cursor-pointer relative
                ${isExecutive ? 'group-hover:border-amber-400' : 'group-hover:border-blue-400'}
                ${compareMode && isSelected ? (isExecutive ? 'ring-2 ring-amber-500 border-amber-500' : 'ring-2 ring-blue-500 border-blue-500') : ''}
                ${isDragging ? 'opacity-50 scale-95' : ''}
                ${isDropTarget ? 'ring-2 ring-green-500 border-green-500 bg-green-50' : ''}
            `}>
                {compareMode && (
                    <div className={`absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center text-white text-xs
                        ${isSelected ? (isExecutive ? 'bg-amber-500' : 'bg-blue-500') : 'bg-slate-200'}
                    `}>
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                    </div>
                )}
                {isDropTarget && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 rounded-lg">
                        <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            Create Team
                        </div>
                    </div>
                )}
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                    <Avatar className={`h-12 w-12 ${isExecutive ? 'border-2 border-amber-500' : 'border border-slate-200'}`}>
                        <AvatarFallback className={isExecutive ? 'bg-amber-100 text-amber-700 font-bold' : 'bg-slate-100 text-slate-500'}>
                            {getInitials(member.full_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <CardTitle className="text-lg text-slate-900">{member.full_name}</CardTitle>
                        <Badge
                            variant="outline"
                            className={`text-[10px] mt-1 ${isExecutive ? 'text-amber-600 border-amber-200 bg-amber-50' : 'bg-slate-100 text-slate-600'}`}
                        >
                            {member.role}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="text-sm text-slate-500">
                    <div className="flex gap-4 text-xs">
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

            {/* Executives Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-amber-600 uppercase tracking-wider border-b border-slate-200 pb-2">
                    Executives (Assessors)
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
                    Apprentices (Executors)
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
                                            const minVal = Math.min(...numericValues)
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
        </div>
    )
}
