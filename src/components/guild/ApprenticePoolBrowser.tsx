"use client"

import { useState, useEffect, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { 
    Users, 
    Search, 
    Briefcase, 
    UserPlus,
    Loader2,
    GraduationCap,
    Mail,
    CheckCircle2
} from "lucide-react"
import { getGuildApprentices, assignApprenticeToProject } from "@/actions/project-assignments"
import { toast } from "sonner"

interface Apprentice {
    id: string
    fullName: string
    email: string
    avatarUrl: string | null
    bio: string | null
    skills: string[]
    activeAssignments: number
}

export function ApprenticePoolBrowser() {
    const [apprentices, setApprentices] = useState<Apprentice[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedApprentice, setSelectedApprentice] = useState<Apprentice | null>(null)
    const [projectName, setProjectName] = useState("")
    const [projectDescription, setProjectDescription] = useState("")
    const [isPending, startTransition] = useTransition()
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        loadApprentices()
    }, [])

    const loadApprentices = async () => {
        setLoading(true)
        const result = await getGuildApprentices()
        if (result.apprentices) {
            setApprentices(result.apprentices)
        }
        if (result.error) {
            toast.error(result.error)
        }
        setLoading(false)
    }

    const handleAssign = () => {
        if (!selectedApprentice || !projectName.trim()) return

        startTransition(async () => {
            const result = await assignApprenticeToProject(
                selectedApprentice.id,
                projectName.trim(),
                projectDescription.trim() || undefined
            )

            if (result.success) {
                setSuccess(true)
                toast.success(`${selectedApprentice.fullName} assigned to ${projectName}`)
                loadApprentices() // Refresh to update assignment counts
            } else {
                toast.error(result.error || "Failed to assign apprentice")
            }
        })
    }

    const handleCloseDialog = () => {
        setSelectedApprentice(null)
        setProjectName("")
        setProjectDescription("")
        setSuccess(false)
    }

    const filteredApprentices = apprentices.filter(a => 
        a.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    if (loading) {
        return (
            <Card className="border-slate-200">
                <CardContent className="p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-slate-500">Loading Guild apprentices...</p>
                </CardContent>
            </Card>
        )
    }

    if (apprentices.length === 0) {
        return (
            <Card className="border-slate-200">
                <CardContent className="p-8 text-center">
                    <GraduationCap className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">No Apprentices Available</h3>
                    <p className="text-slate-500">
                        There are currently no apprentices in the Guild pool.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card className="border-slate-200">
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                <GraduationCap className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">Guild Apprentice Pool</CardTitle>
                                <p className="text-sm text-slate-500">
                                    {apprentices.length} apprentice{apprentices.length !== 1 ? 's' : ''} available
                                </p>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search by name, email, or skills..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    {/* Apprentice List */}
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                        {filteredApprentices.map((apprentice) => (
                            <div
                                key={apprentice.id}
                                className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <UserAvatar
                                        name={apprentice.fullName}
                                        role="Apprentice"
                                        avatarUrl={apprentice.avatarUrl}
                                        size="xl"
                                        showBorder
                                        className="border-blue-200"
                                    />
                                    <div>
                                        <h4 className="font-medium text-slate-900">{apprentice.fullName}</h4>
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <Mail className="h-3 w-3" />
                                            <span>{apprentice.email}</span>
                                        </div>
                                        {apprentice.skills.length > 0 && (
                                            <div className="flex gap-1 mt-1 flex-wrap">
                                                {apprentice.skills.slice(0, 3).map((skill, idx) => (
                                                    <Badge key={idx} variant="secondary" className="text-xs bg-slate-100">
                                                        {skill}
                                                    </Badge>
                                                ))}
                                                {apprentice.skills.length > 3 && (
                                                    <Badge variant="secondary" className="text-xs bg-slate-100">
                                                        +{apprentice.skills.length - 3}
                                                    </Badge>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {apprentice.activeAssignments > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                            <Briefcase className="h-3 w-3 mr-1" />
                                            {apprentice.activeAssignments} project{apprentice.activeAssignments !== 1 ? 's' : ''}
                                        </Badge>
                                    )}
                                    <Button
                                        size="sm"
                                        onClick={() => setSelectedApprentice(apprentice)}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        <UserPlus className="h-4 w-4 mr-1" />
                                        Assign
                                    </Button>
                                </div>
                            </div>
                        ))}

                        {filteredApprentices.length === 0 && (
                            <div className="p-8 text-center">
                                <p className="text-slate-500">No apprentices match your search.</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Assignment Dialog */}
            <Dialog open={!!selectedApprentice} onOpenChange={(open) => !open && handleCloseDialog()}>
                <DialogContent className="sm:max-w-[450px]">
                    {success ? (
                        // Success state
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    Apprentice Assigned
                                </DialogTitle>
                            </DialogHeader>
                            <div className="py-6 text-center">
                                <div className="mb-4 flex justify-center">
                                    <UserAvatar
                                        name={selectedApprentice?.fullName}
                                        role="Apprentice"
                                        avatarUrl={selectedApprentice?.avatarUrl}
                                        size="xl"
                                        showBorder
                                        className="border-green-200"
                                    />
                                </div>
                                <p className="text-slate-700">
                                    <strong>{selectedApprentice?.fullName}</strong> has been assigned to{" "}
                                    <strong>{projectName}</strong>
                                </p>
                                <p className="text-sm text-slate-500 mt-2">
                                    They can now work on tasks for your company while remaining in the Guild.
                                </p>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCloseDialog}>Done</Button>
                            </DialogFooter>
                        </>
                    ) : (
                        // Form state
                        <>
                            <DialogHeader>
                                <DialogTitle>Assign to Project</DialogTitle>
                                <DialogDescription>
                                    Assign {selectedApprentice?.fullName} to work on a project for your company.
                                </DialogDescription>
                            </DialogHeader>
                            
                            {selectedApprentice && (
                                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg my-4">
                                    <UserAvatar
                                        name={selectedApprentice.fullName}
                                        role="Apprentice"
                                        avatarUrl={selectedApprentice.avatarUrl}
                                        size="xl"
                                        showBorder
                                        className="border-blue-200"
                                    />
                                    <div>
                                        <h4 className="font-medium">{selectedApprentice.fullName}</h4>
                                        <p className="text-sm text-slate-500">{selectedApprentice.email}</p>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="projectName">
                                        Project Name <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="projectName"
                                        placeholder="e.g., MVP Development, Marketing Campaign..."
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="projectDescription">
                                        Description <span className="text-slate-400 text-xs">(optional)</span>
                                    </Label>
                                    <Textarea
                                        id="projectDescription"
                                        placeholder="Brief description of what they'll be working on..."
                                        value={projectDescription}
                                        onChange={(e) => setProjectDescription(e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </div>

                            <DialogFooter className="mt-6">
                                <Button variant="secondary" onClick={handleCloseDialog}>
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={handleAssign}
                                    disabled={!projectName.trim() || isPending}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {isPending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Assigning...
                                        </>
                                    ) : (
                                        "Assign to Project"
                                    )}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
