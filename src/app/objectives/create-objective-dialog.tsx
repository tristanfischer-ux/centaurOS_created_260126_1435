"use client"
import { createObjective } from "@/actions/objectives"
import { toast } from "sonner"
import { useState } from "react"
import { Loader2, Plus } from "lucide-react"
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
                    <Button type="submit" disabled={loading} className="w-full bg-slate-900 text-white">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Initialize
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
