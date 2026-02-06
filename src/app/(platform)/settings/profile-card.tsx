'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { User, Mail, Shield, Building2, Pencil, Check, X, Loader2 } from 'lucide-react'
import { updateProfileDetails } from '@/actions/profiles'
import { toast } from 'sonner'

interface ProfileCardProps {
    profileId: string
    fullName: string
    email: string
    role: string
    foundryId: string
}

export function ProfileCard({ profileId, fullName, email, role, foundryId }: ProfileCardProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(fullName)
    const [displayName, setDisplayName] = useState(fullName)
    const [isPending, startTransition] = useTransition()

    const handleSave = () => {
        if (!editName.trim()) {
            toast.error('Name cannot be empty')
            return
        }
        startTransition(async () => {
            const result = await updateProfileDetails(profileId, { full_name: editName.trim() })
            if (result.success) {
                setDisplayName(editName.trim())
                setIsEditing(false)
                toast.success('Profile updated')
            } else {
                toast.error(result.error || 'Failed to update profile')
            }
        })
    }

    const handleCancel = () => {
        setEditName(displayName)
        setIsEditing(false)
    }

    return (
        <Card className="bg-background border-slate-200 shadow-[0_2px_15px_rgba(0,0,0,0.03)] overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-orange-50/60 to-transparent border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                        <User className="h-5 w-5 text-international-orange" />
                    </div>
                    <div>
                        <CardTitle>Profile</CardTitle>
                        <CardDescription>Your account information and settings.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Full Name - Editable */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <User className="h-3 w-3" />
                            Full Name
                        </label>
                        {isEditing ? (
                            <div className="flex items-center gap-2">
                                <Input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="h-9"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSave()
                                        if (e.key === 'Escape') handleCancel()
                                    }}
                                />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleSave}
                                    disabled={isPending}
                                    className="h-9 w-9 p-0 text-status-success hover:text-status-success"
                                >
                                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancel}
                                    disabled={isPending}
                                    className="h-9 w-9 p-0 text-muted-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group">
                                <div className="flex-1 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-sm font-medium text-foreground">
                                    {displayName}
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setIsEditing(true)}
                                    className="h-9 w-9 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Email - Read only */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Mail className="h-3 w-3" />
                            Email
                        </label>
                        <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-sm text-foreground">
                            {email}
                        </div>
                    </div>

                    {/* Role */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Shield className="h-3 w-3" />
                            Role
                        </label>
                        <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                            <span className="text-sm font-mono text-status-warning">{role}</span>
                        </div>
                    </div>

                    {/* Company ID */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Building2 className="h-3 w-3" />
                            Company ID
                        </label>
                        <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-sm font-mono text-foreground truncate">
                            {foundryId}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
