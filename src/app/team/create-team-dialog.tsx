"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Plus, Users, Check } from "lucide-react"
import { createTeam } from "@/actions/team"

interface Member {
    id: string
    full_name: string | null
    role: string | null
    email: string | null
}

interface CreateTeamDialogProps {
    members: Member[]
}

export function CreateTeamDialog({ members }: CreateTeamDialogProps) {
    const [open, setOpen] = useState(false)
    const [teamName, setTeamName] = useState("")
    const [selectedMembers, setSelectedMembers] = useState<string[]>([])
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const toggleMember = (memberId: string) => {
        setSelectedMembers(prev =>
            prev.includes(memberId)
                ? prev.filter(id => id !== memberId)
                : [...prev, memberId]
        )
    }

    const handleSubmit = () => {
        if (!teamName.trim()) {
            setError("Team name is required")
            return
        }
        if (selectedMembers.length < 2) {
            setError("Select at least 2 members")
            return
        }

        setError(null)
        startTransition(async () => {
            const result = await createTeam(teamName, selectedMembers)
            if (result.error) {
                setError(result.error)
            } else {
                setOpen(false)
                setTeamName("")
                setSelectedMembers([])
            }
        })
    }

    // Filter out AI agents for team creation
    const availableMembers = members.filter(m => m.role !== 'AI_Agent')

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-amber-600 hover:bg-amber-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Team
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-amber-600" />
                        Create New Team
                    </DialogTitle>
                    <DialogDescription>
                        Create a team to group people working together. Select at least 2 members.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="teamName">Team Name</Label>
                        <Input
                            id="teamName"
                            placeholder="e.g., Product Team, Design Squad..."
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Select Members ({selectedMembers.length} selected)</Label>
                        <div className="border border-slate-200 rounded-lg max-h-[250px] overflow-y-auto">
                            {availableMembers.map((member) => {
                                const isSelected = selectedMembers.includes(member.id)
                                return (
                                    <button
                                        key={member.id}
                                        type="button"
                                        onClick={() => toggleMember(member.id)}
                                        className={`w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${isSelected ? 'bg-amber-50' : ''
                                            }`}
                                    >
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback className="text-xs bg-slate-100">
                                                {member.full_name?.substring(0, 2).toUpperCase() || '?'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 text-left">
                                            <div className="font-medium text-slate-900">{member.full_name}</div>
                                            <div className="text-xs text-slate-500">{member.role}</div>
                                        </div>
                                        {isSelected && (
                                            <div className="h-6 w-6 rounded-full bg-amber-500 flex items-center justify-center">
                                                <Check className="h-4 w-4 text-white" />
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                            {availableMembers.length === 0 && (
                                <div className="p-4 text-center text-slate-500 italic">
                                    No members available
                                </div>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isPending || selectedMembers.length < 2}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            {isPending ? "Creating..." : "Create Team"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
