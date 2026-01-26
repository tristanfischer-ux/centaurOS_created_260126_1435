"use client"

import { useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Check, X, GitCompare } from "lucide-react"
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

    const allMembers = [...executives, ...apprentices]
    const selectedMembers = allMembers.filter(m => selectedIds.has(m.id))

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

        const cardContent = (
            <Card className={`
                bg-white border-slate-200 shadow-sm transition-all cursor-pointer relative
                ${isExecutive ? 'group-hover:border-amber-400' : 'group-hover:border-blue-400'}
                ${compareMode && isSelected ? (isExecutive ? 'ring-2 ring-amber-500 border-amber-500' : 'ring-2 ring-blue-500 border-blue-500') : ''}
            `}>
                {compareMode && (
                    <div className={`absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center text-white text-xs
                        ${isSelected ? (isExecutive ? 'bg-amber-500' : 'bg-blue-500') : 'bg-slate-200'}
                    `}>
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                    </div>
                )}
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                    <Avatar className={`h-12 w-12 ${isExecutive ? 'border-2 border-amber-500' : 'border border-slate-200'}`}>
                        <AvatarFallback className={isExecutive ? 'bg-amber-100 text-amber-700 font-bold' : 'bg-slate-100 text-slate-500'}>
                            {member.full_name?.substring(0, 2).toUpperCase()}
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

        if (compareMode) {
            return (
                <div className="block group" onClick={() => toggleSelection(member.id)}>
                    {cardContent}
                </div>
            )
        }

        return (
            <Link href={`/team/${member.id}`} className="block group">
                {cardContent}
            </Link>
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
        </div>
    )
}
