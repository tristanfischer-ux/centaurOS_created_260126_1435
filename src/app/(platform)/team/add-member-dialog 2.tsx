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
        <Button type="submit" className="bg-accent text-foundry-950 hover:bg-accent/90" disabled={pending}>
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

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-accent text-foundry-950 hover:bg-accent/90 gap-2 font-bold">
                    <UserPlus className="h-4 w-4" />
                    Add Member
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-foundry-900 border-foundry-800 text-white">
                <DialogHeader>
                    <DialogTitle>Add Team Member</DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Expand your Foundry roster.
                    </DialogDescription>
                </DialogHeader>
                <form action={clientAction}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="full_name" className="text-gray-200">Full Name</Label>
                            <Input
                                id="full_name"
                                name="full_name"
                                required
                                placeholder="John Doe"
                                className="bg-foundry-950 border-foundry-800 text-white focus-visible:ring-accent"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email" className="text-gray-200">Email Address</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                required
                                placeholder="john@example.com"
                                className="bg-foundry-950 border-foundry-800 text-white focus-visible:ring-accent"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="role_type" className="text-gray-200">Role</Label>
                            <Select name="role_type" defaultValue="Apprentice">
                                <SelectTrigger className="bg-foundry-950 border-foundry-800 text-white focus:ring-accent">
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent className="bg-foundry-900 border-foundry-800 text-white">
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
                    <DialogFooter>
                        <SubmitButton />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
