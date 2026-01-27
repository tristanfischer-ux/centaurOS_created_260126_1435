"use client"
import { createObjective } from "@/actions/objectives"
import { toast } from "sonner"
import { useState } from "react"
import { Loader2, Plus, BookTemplate } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OBJECTIVE_PLAYBOOKS } from "@/lib/playbooks"

export function CreateObjectiveDialog({ disabled }: { disabled?: boolean }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    async function clientAction(formData: FormData) {
        setLoading(true)
        const res = await createObjective(formData)
        setLoading(false)
        if (res?.error) {
            toast.error(res.error)
        } else {
            toast.success("Objective Initiated")
            setOpen(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="bg-white text-black hover:bg-gray-200" disabled={disabled}>
                    <Plus className="mr-2 h-4 w-4" /> New Objective
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-white text-slate-900 border-slate-200">
                <DialogHeader>
                    <DialogTitle>Define Strategic Objective</DialogTitle>
                </DialogHeader>
                <form action={clientAction} className="space-y-4">
                    <Input name="title" placeholder="e.g. Expand Market Share" required className="bg-slate-50 border-slate-200" />
                    <Textarea name="description" placeholder="Success criteria and scope..." className="bg-slate-50 border-slate-200" />

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            <BookTemplate className="h-4 w-4" />
                            Use Playbook (Optional)
                        </label>
                        <Select name="playbookId">
                            <SelectTrigger className="bg-slate-50 border-slate-200">
                                <SelectValue placeholder="Select a template..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None (Empty Objective)</SelectItem>
                                {OBJECTIVE_PLAYBOOKS.map(pb => (
                                    <SelectItem key={pb.id} value={pb.id}>
                                        {pb.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">
                            Selecting a playbook will automatically generate tasks for this objective.
                        </p>
                    </div>

                    <Button type="submit" disabled={loading} className="w-full bg-slate-900 text-white">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Initialize
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
