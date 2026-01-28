"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
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
import { UserPlus, Loader2 } from "lucide-react"
import { createMember } from "@/actions/team"

function SubmitButton() {
    const { pending } = useFormStatus()

    return (
        <Button type="submit" variant="primary" disabled={pending}>
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                </>
            ) : (
                "Add Member"
            )}
        </Button>
    )
}

export function AddMemberDialog() {
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function clientAction(formData: FormData) {
        const result = await createMember(formData)
        if (result?.error) {
            setError(result.error)
        } else {
            setOpen(false)
            setError(null)
        }
    }

    // Handle dialog open state change with form reset
    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen)
        if (!newOpen) {
            // Reset state after dialog close animation
            setTimeout(() => {
                setError(null)
            }, 300)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="primary" className="gap-2 font-bold">
                    <UserPlus className="h-4 w-4" />
                    Add Member
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-white text-slate-900 border-slate-200">
                <DialogHeader>
                    <DialogTitle>Add Team Member</DialogTitle>
                    <DialogDescription>
                        Expand your Foundry roster.
                    </DialogDescription>
                </DialogHeader>
                <form action={clientAction}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="full_name">Full Name <span className="text-red-500">*</span></Label>
                            <Input
                                id="full_name"
                                name="full_name"
                                required
                                aria-required={true}
                                placeholder="John Doe"
                                autoComplete="name"
                                enterKeyHint="next"
                                className="bg-white border-slate-200"
                                autoFocus
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                enterKeyHint="done"
                                required
                                aria-required={true}
                                placeholder="john@example.com"
                                className="bg-white border-slate-200"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="role_type">Role <span className="text-red-500">*</span></Label>
                            <Select name="role_type" defaultValue="Apprentice" required>
                                <SelectTrigger 
                                    id="role_type"
                                    className="bg-white border-slate-200"
                                    aria-required={true}
                                >
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-slate-200">
                                    <SelectItem value="Apprentice">Apprentice</SelectItem>
                                    <SelectItem value="Executive">Executive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {error && (
                            <div className="text-red-500 text-sm font-medium">
                                {error}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2 pt-4 border-t border-slate-100">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <SubmitButton />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
