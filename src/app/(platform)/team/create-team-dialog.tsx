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
import { createTeam } from "@/actions/team"
import { Plus } from "lucide-react"
import { toast } from "sonner"

interface Member {
    id: string
    full_name: string | null
    role: string
}

export function CreateTeamDialog({ members }: { members: Member[] }) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState("")
    const [selectedMembers, setSelectedMembers] = useState<string[]>([])
    const [loading, setLoading] = useState(false)

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
        if (selectedMembers.length < 2) {
            toast.error("Select at least 2 members")
            return
        }

        setLoading(true)
        const result = await createTeam(name, selectedMembers)
        setLoading(false)

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success("Team created")
            setOpen(false)
            setName("")
            setSelectedMembers([])
        }
    }

    const toggleMember = (id: string) => {
        setSelectedMembers(prev =>
            prev.includes(id)
                ? prev.filter(m => m !== id)
                : [...prev, id]
        )
    }

    // Handle dialog open state change with form reset
    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen)
        if (!newOpen) {
            // Reset state after dialog close animation
            setTimeout(() => {
                setName("")
                setSelectedMembers([])
            }, 300)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="primary">
                    <Plus className="h-4 w-4 mr-2" />
                    New Team
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Team</DialogTitle>
                    <DialogDescription>
                        Group apprentices into a specialized unit.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Team Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Frontend Squad"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Select Members (Min 2)</Label>
                        <div className="border border-input rounded-md max-h-[200px] overflow-y-auto p-2 space-y-2">
                            {members.map(member => (
                                <div key={member.id} className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id={member.id}
                                        checked={selectedMembers.includes(member.id)}
                                        onChange={() => toggleMember(member.id)}
                                        className="h-4 w-4 rounded border-input text-foreground focus:ring-ring"
                                        aria-label={`Select ${member.full_name}`}
                                    />
                                    <label
                                        htmlFor={member.id}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer w-full py-1"
                                    >
                                        {member.full_name} <span className="text-xs text-muted-foreground">({member.role})</span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter className="gap-2 pt-4 border-t border-border">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="primary" disabled={loading}>
                            {loading ? "Creating..." : "Create Team"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
