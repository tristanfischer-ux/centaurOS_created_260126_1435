"use client"

import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
    DrawerFooter,
    DrawerClose,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { useEffect, useState } from "react"
import { getTaskHistory } from "@/actions/tasks"
import { Loader2, History } from "lucide-react"
import { Database } from "@/types/database.types"

interface HistoryDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    taskId: string
    taskTitle: string
}

type TaskHistoryItem = Database['public']['Tables']['task_history']['Row'] & {
    user: {
        full_name: string | null
        email: string
    } | null
}

export function HistoryDrawer({ open, onOpenChange, taskId, taskTitle }: HistoryDrawerProps) {
    const [history, setHistory] = useState<TaskHistoryItem[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let mounted = true
        if (open) {
            // Delay setting loading to avoid synchronous update warning
            const timer = setTimeout(() => {
                if (mounted) setLoading(true)
            }, 0)

            getTaskHistory(taskId).then((res) => {
                if (mounted) {
                    if (res.data) setHistory(res.data as unknown as TaskHistoryItem[]) // Cast due to join complexity
                    setLoading(false)
                }
            })
            return () => {
                mounted = false
                clearTimeout(timer)
            }
        }
    }, [open, taskId])

    const getActionBadges = (item: TaskHistoryItem) => {
        switch (item.action_type) {
            case 'CREATED': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Created</Badge>
            case 'COMPLETED': return <Badge className="bg-slate-900 border-slate-900 text-white hover:bg-slate-800">Completed</Badge>
            case 'STATUS_CHANGE':
                if (item.changes && typeof item.changes === 'object' && 'new_status' in item.changes) {
                    const changes = item.changes as { new_status?: string }
                    if (changes.new_status === 'Accepted') return <Badge className="bg-green-600 hover:bg-green-700 border-0 text-white">Accepted</Badge>
                    if (changes.new_status === 'Rejected') return <Badge className="bg-red-600 hover:bg-red-700 border-0 text-white">Rejected</Badge>
                }
                return <Badge variant="secondary">Status Change</Badge>
            case 'ASSIGNED': return <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">Assigned</Badge>
            case 'FORWARDED': return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Forwarded</Badge>
            case 'UPDATED': return <Badge variant="outline" className="text-slate-500">Updated</Badge>
            default: return <Badge variant="outline">{item.action_type}</Badge>
        }
    }

    const renderChanges = (changes: unknown) => {
        if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) return null

        const changeObj = changes as Record<string, any>

        return (
            <div className="mt-2 space-y-1">
                {Object.entries(changeObj).map(([key, value]) => {
                    if (key === 'initial_status' || key === 'source') return null
                    // Skip some fields if too verbose
                    return (
                        <div key={key} className="text-xs text-slate-500 flex flex-wrap items-center gap-1">
                            <span className="font-medium text-slate-700 capitalize">{key.replace(/_/g, ' ')}:</span>
                            {typeof value === 'object' && value !== null ? (
                                // Handle nested objects like dates
                                <span>{JSON.stringify(value)}</span>
                            ) : (
                                <span>{String(value)}</span>
                            )}
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="h-[85vh] max-h-[85vh]">
                <div className="mx-auto w-full max-w-2xl flex flex-col h-full">
                    <DrawerHeader>
                        <DrawerTitle className="flex items-center gap-2">
                            <History className="w-5 h-5 text-slate-500" />
                            History: {taskTitle}
                        </DrawerTitle>
                        <DrawerDescription>Audit log of all actions performed on this task.</DrawerDescription>
                    </DrawerHeader>

                    <ScrollArea className="flex-1 px-4 overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-slate-400" /></div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-sm">No history recorded yet.</div>
                        ) : (
                            <div className="relative border-l border-slate-200 ml-4 my-4 space-y-8">
                                {history.map((item) => (
                                    <div key={item.id} className="relative pl-6">
                                        {/* Dot on timeline */}
                                        <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 border-2 border-white ring-1 ring-slate-100" />

                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono text-slate-400">
                                                        {format(new Date(item.created_at), 'MMM d, HH:mm')}
                                                    </span>
                                                    {getActionBadges(item)}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 mt-1">
                                                <Avatar className="h-5 w-5 border border-slate-100">
                                                    <AvatarImage src={`https://avatar.vercel.sh/${item.user?.email || 'user'}`} />
                                                    <AvatarFallback className="text-[9px]">{item.user?.full_name?.substring(0, 2) || "??"}</AvatarFallback>
                                                </Avatar>
                                                <span className="text-sm font-medium text-slate-900">
                                                    {item.user?.full_name || 'Unknown User'}
                                                </span>
                                            </div>

                                            <div className="bg-slate-50 rounded-md p-2 mt-1 border border-slate-100 text-sm">
                                                {renderChanges(item.changes)}
                                                {/* Handle specifics for better readability */}
                                                {item.action_type === 'CREATED' && <div className="text-xs text-slate-500">Task created.</div>}
                                                {item.action_type === 'COMPLETED' && <div className="text-xs text-slate-700 font-medium">Task marked as complete.</div>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>

                    <DrawerFooter>
                        <DrawerClose asChild>
                            <Button variant="outline">Close</Button>
                        </DrawerClose>
                    </DrawerFooter>
                </div>
            </DrawerContent>
        </Drawer>
    )
}
