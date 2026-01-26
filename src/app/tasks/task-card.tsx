"use client"

import { useState } from "react"
import { Database } from "@/types/database.types"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Check, X, ArrowRight, Edit, MessageSquare } from "lucide-react"
import { acceptTask, rejectTask, forwardTask, amendTask } from "@/actions/tasks"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import { ThreadDrawer } from "./thread-drawer"

type Task = Database["public"]["Tables"]["tasks"]["Row"]

export function TaskCard({ task, currentUserId, userRole }: { task: Task, currentUserId: string, userRole?: string }) {
    const isAssignee = task.assignee_id === currentUserId
    const [loading, setLoading] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [forwardOpen, setForwardOpen] = useState(false)
    const [amendOpen, setAmendOpen] = useState(false)
    const [threadOpen, setThreadOpen] = useState(false)

    // Handlers for actions
    const handleAccept = async () => {
        setLoading(true)
        await acceptTask(task.id)
        setLoading(false)
    }

    const handleReject = async (formData: FormData) => {
        setLoading(true)
        const reason = formData.get('reason') as string
        await rejectTask(task.id, reason)
        setLoading(false)
        setRejectOpen(false)
    }

    const handleForward = async (formData: FormData) => {
        setLoading(true)
        const newAssigneeId = formData.get('new_assignee_id') as string // In real app, this would be a Select
        const reason = formData.get('reason') as string
        await forwardTask(task.id, newAssigneeId, reason)
        setLoading(false)
        setForwardOpen(false)
    }

    const handleAmend = async (formData: FormData) => {
        setLoading(true)
        const notes = formData.get('amendment_notes') as string
        // Just sending notes for MVP "handshake" demo
        await amendTask(task.id, { amendment_notes: notes })
        setLoading(false)
        setAmendOpen(false)
    }

    // Status Badge Logic
    const getStatusColor = (status: string | null) => {
        switch (status) {
            case 'Accepted': return 'bg-green-600'
            case 'Rejected': return 'bg-red-600'
            case 'Amended_Pending_Approval': return 'bg-orange-500'
            default: return 'bg-gray-500' // Pending
        }
    }

    return (
        <Card className="bg-white border-slate-200 hover:border-slate-300 hover:shadow-md transition-all">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg text-slate-900 font-medium">{task.title || "Untitled Task"}</CardTitle>
                        <CardDescription className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span>ID: {task.id.slice(0, 8)}</span>
                            {/* @ts-expect-error joined data */}
                            {task.assignee && (
                                <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
                                    {/* @ts-expect-error joined data */}
                                    {task.assignee.role === "AI_Agent" ? "🤖" : "👤"} {task.assignee.full_name}
                                </span>
                            )}
                        </CardDescription>
                    </div>
                    <Badge className={`${getStatusColor(task.status)} text-white border-0 shadow-sm`}>{task.status}</Badge>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-slate-600 text-sm mb-4">{task.description || "No description."}</p>

                <div className="flex gap-4 text-xs text-slate-500 mb-2">
                    <div>StartDate: {task.start_date || "N/A"}</div>
                    <div>EndDate: {task.end_date || "N/A"}</div>
                </div>

                {task.status === 'Amended_Pending_Approval' && (
                    <div className="bg-orange-50 border border-orange-200 p-3 rounded-md mb-4 text-sm text-orange-800">
                        <strong>Amendment Proposed:</strong>
                        <p className="mt-1 opacity-90">{task.amendment_notes}</p>
                    </div>
                )}
            </CardContent>
            <Separator className="bg-slate-100" />
            <CardFooter className="pt-3 flex justify-between">
                {/* Action Buttons: Visible to Assignee OR Executives (Managers) */}
                {(isAssignee || userRole === 'Executive') && task.status === 'Pending' && (
                    <div className="flex gap-2 w-full">
                        <Button size="sm" onClick={handleAccept} disabled={loading} className="bg-green-600 hover:bg-green-700 flex-1 text-white shadow-sm">
                            <Check className="h-4 w-4 mr-1" /> Accept
                        </Button>

                        {/* Reject Dialog */}
                        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="destructive" disabled={loading} className="flex-1 shadow-sm">
                                    <X className="h-4 w-4 mr-1" /> Reject
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-white border-slate-200 text-slate-900">
                                <DialogHeader><DialogTitle>Reject Task</DialogTitle></DialogHeader>
                                <form action={handleReject} className="space-y-4">
                                    <Textarea name="reason" placeholder="Reason for rejection..." required className="bg-slate-50 border-slate-200" />
                                    <Button type="submit" variant="destructive">Confirm Rejection</Button>
                                </form>
                            </DialogContent>
                        </Dialog>

                        {/* Forward Dialog */}
                        <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline" disabled={loading} className="border-slate-200 text-slate-600 hover:bg-slate-50 flex-1">
                                    <ArrowRight className="h-4 w-4 mr-1" /> Fwd
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-white border-slate-200 text-slate-900">
                                <DialogHeader><DialogTitle>Forward Task</DialogTitle></DialogHeader>
                                <form action={handleForward} className="space-y-4">
                                    <Input name="new_assignee_id" placeholder="New Assignee UUID (Mock)" required className="bg-slate-50 border-slate-200" />
                                    <Textarea name="reason" placeholder="Handover notes..." required className="bg-slate-50 border-slate-200" />
                                    <Button type="submit" className="bg-amber-500 text-white hover:bg-amber-600">Forward</Button>
                                </form>
                            </DialogContent>
                        </Dialog>

                        {/* Amend Dialog */}
                        <Dialog open={amendOpen} onOpenChange={setAmendOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline" disabled={loading} className="border-slate-200 text-slate-600 hover:bg-slate-50 flex-1">
                                    <Edit className="h-4 w-4 mr-1" /> Amend
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-white border-slate-200 text-slate-900">
                                <DialogHeader><DialogTitle>Amend Task</DialogTitle></DialogHeader>
                                <form action={handleAmend} className="space-y-4">
                                    <Textarea name="amendment_notes" placeholder="New terms/scope..." required className="bg-slate-50 border-slate-200" />
                                    <Button type="submit" className="bg-orange-600 text-white hover:bg-orange-700">Propose Amendment</Button>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                )}

                {/* View Thread Button */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500 hover:text-amber-600 ml-auto"
                    onClick={() => setThreadOpen(true)}
                >
                    <MessageSquare className="h-4 w-4 mr-1" /> Thread
                </Button>
            </CardFooter>

            <ThreadDrawer
                open={threadOpen}
                onOpenChange={setThreadOpen}
                taskId={task.id}
                taskTitle={task.title}
            />
        </Card>
    )
}
