"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Check, Loader2, CalendarIcon } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { createTask } from "@/actions/tasks"
import { toast } from "sonner"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface CreateTaskDialogProps {
    objectives: { id: string; title: string }[]
    members: { id: string; full_name: string; role: string }[]
}

export function CreateTaskDialog({ objectives, members }: CreateTaskDialogProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [date, setDate] = useState<Date>()

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsLoading(true)

        const formData = new FormData(event.currentTarget)
        // Manually append date if selected (as form data usually only grabs inputs)
        if (date) {
            formData.append('end_date', date.toISOString())
        }

        const result = await createTask(formData)

        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success("Task created")
            setOpen(false)
            // Reset form? The dialog unmounting handles it usually.
        }
        setIsLoading(false)
    }

    // Sort members: Executives, then AI, then others
    const sortedMembers = [...members].sort((a, b) => {
        if (a.role === 'AI_Agent') return -1 // AI first!
        return a.full_name?.localeCompare(b.full_name || '')
    })

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="bg-slate-900 text-white hover:bg-slate-800">
                    <Plus className="mr-2 h-4 w-4" /> New Task
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
                <form onSubmit={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>Create New Task</DialogTitle>
                        <DialogDescription>
                            Assign a new task. Assign to an AI Agent for auto-execution.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="title">Task Title</Label>
                            <Input id="title" name="title" placeholder="Review contract drafts..." required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                name="description"
                                placeholder="Provide specific details so the assignee knows what to do."
                                className="h-24"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="assignee">Assignee</Label>
                                <Select name="assignee_id" required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select person..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sortedMembers.map(member => (
                                            <SelectItem key={member.id} value={member.id}>
                                                {member.full_name}
                                                {member.role === 'AI_Agent' && ' 🤖'}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="objective">Objective</Label>
                                <Select name="objective_id" required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Link to objective..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {objectives.map(obj => (
                                            <SelectItem key={obj.id} value={obj.id}>
                                                {obj.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>Deadline (Optional)</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Create Task
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
