"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { GitCompare, Check } from "lucide-react"

interface Member {
    id: string
    full_name: string | null
    email: string | null
    role: string | null
    activeTasks: number
    completedTasks: number
    pendingTasks: number
    rejectedTasks: number
}

interface CompareToDialogProps {
    currentMember: Member
    allMembers: Member[]
}

export function CompareToDialog({ currentMember, allMembers }: CompareToDialogProps) {
    const [open, setOpen] = useState(false)
    const [selectedMember, setSelectedMember] = useState<Member | null>(null)
    const [showComparison, setShowComparison] = useState(false)

    const otherMembers = allMembers.filter(m => m.id !== currentMember.id)

    const handleSelectMember = (member: Member) => {
        setSelectedMember(member)
        setShowComparison(true)
    }

    const resetState = () => {
        setSelectedMember(null)
        setShowComparison(false)
    }

    const comparisonRows = [
        { label: "Role", getValue: (m: Member) => m.role || "-" },
        { label: "Email", getValue: (m: Member) => m.email || "-" },
        { label: "Active Tasks", getValue: (m: Member) => m.activeTasks, highlight: true },
        { label: "Completed", getValue: (m: Member) => m.completedTasks, highlight: true, good: true },
        { label: "Pending", getValue: (m: Member) => m.pendingTasks },
        { label: "Rejected", getValue: (m: Member) => m.rejectedTasks, caution: true },
    ]

    return (
        <>
            <Button
                variant="outline"
                onClick={() => setOpen(true)}
                className="gap-2"
            >
                <GitCompare className="h-4 w-4" />
                Compare to someone else
            </Button>

            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetState() }}>
                <DialogContent className="max-w-2xl bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">
                            {showComparison ? "Comparison Results" : "Compare To..."}
                        </DialogTitle>
                        <DialogDescription>
                            {showComparison
                                ? `Comparing ${currentMember.full_name} with ${selectedMember?.full_name}`
                                : `Select someone to compare with ${currentMember.full_name}`
                            }
                        </DialogDescription>
                    </DialogHeader>

                    {!showComparison ? (
                        /* Member Selection Grid */
                        <div className="grid gap-2 max-h-80 overflow-y-auto py-2">
                            {otherMembers.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    No other team members to compare with.
                                </div>
                            ) : (
                                otherMembers.map(member => (
                                    <button
                                        key={member.id}
                                        onClick={() => handleSelectMember(member)}
                                        className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                                    >
                                        <Avatar className="h-10 w-10">
                                            <AvatarFallback className="bg-slate-100 text-slate-600">
                                                {member.full_name?.substring(0, 2).toUpperCase() || "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <div className="font-medium text-slate-900">{member.full_name}</div>
                                            <div className="text-sm text-slate-500">{member.role}</div>
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            {member.completedTasks} done • {member.activeTasks} active
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    ) : (
                        /* Comparison Table */
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="py-4 px-4 text-left text-slate-500 font-medium w-32"></th>
                                        {[currentMember, selectedMember!].map(member => (
                                            <th key={member.id} className="py-4 px-6 text-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Avatar className="h-14 w-14 border-2 border-slate-200">
                                                        <AvatarFallback className="bg-slate-100 text-slate-600 font-bold">
                                                            {member.full_name?.substring(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="font-semibold text-slate-900">{member.full_name}</span>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparisonRows.map((row, idx) => {
                                        const members = [currentMember, selectedMember!]
                                        const values = members.map(m => row.getValue(m))
                                        const numericValues = values.filter(v => typeof v === 'number') as number[]
                                        const maxVal = Math.max(...numericValues)

                                        return (
                                            <tr key={row.label} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                                                <td className="py-3 px-4 text-slate-500 font-medium text-sm">{row.label}</td>
                                                {members.map((member, i) => {
                                                    const value = values[i]
                                                    const isNumeric = typeof value === 'number'
                                                    const isBest = isNumeric && row.good && value === maxVal && maxVal > 0
                                                    const isWorst = isNumeric && row.caution && value === maxVal && (value as number) > 0

                                                    return (
                                                        <td
                                                            key={member.id}
                                                            className={`py-3 px-6 text-center font-medium
                                                                ${isBest ? 'text-green-600 bg-green-50' : ''}
                                                                ${isWorst ? 'text-red-600 bg-red-50' : ''}
                                                                ${!isBest && !isWorst ? 'text-slate-900' : ''}
                                                            `}
                                                        >
                                                            {isBest && <Check className="inline h-4 w-4 mr-1" />}
                                                            {value}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>

                            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between">
                                <Button variant="outline" onClick={resetState}>
                                    ← Compare with someone else
                                </Button>
                                <Button onClick={() => setOpen(false)}>
                                    Done
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
