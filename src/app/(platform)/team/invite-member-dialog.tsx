"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { createMember } from "@/actions/team"
import { UserPlus, Loader2 } from "lucide-react"
import { toast } from "sonner"

export function InviteMemberDialog() {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    async function onSubmit(formData: FormData) {
        setLoading(true)
        try {
            const result = await createMember(formData)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success("Member added to roster")
                setOpen(false)
            }
        } catch (error) {
            toast.error("Failed to add member")
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite Member
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-white text-slate-900 border-slate-200">
                <DialogHeader>
                    <DialogTitle>Invite Network Member</DialogTitle>
                    <DialogDescription>
                        Add a new member to your Foundry. They will appear in the roster immediately.
                    </DialogDescription>
                </DialogHeader>
                <form action={onSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="full_name">Full Name</Label>
                        <Input
                            id="full_name"
                            name="full_name"
                            placeholder="e.g. Sarah Connor"
                            required
                            className="bg-white border-slate-300"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="sarah@example.com"
                            required
                            className="bg-white border-slate-300"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="role_type">Role</Label>
                        <Select name="role_type" required defaultValue="Apprentice">
                            <SelectTrigger className="bg-white border-slate-300">
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-slate-200">
                                <SelectItem value="Executive">Executive (Assessor)</SelectItem>
                                <SelectItem value="Apprentice">Apprentice (Executor)</SelectItem>
                                <SelectItem value="AI_Agent">AI Agent (Digital)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">
                            Executives manage tasks and approve work. Apprentices execute tasks.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Adding...
                                </>
                            ) : (
                                "Add Member"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
