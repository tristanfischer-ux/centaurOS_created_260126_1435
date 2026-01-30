"use client"

import { useState, useEffect, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
    Mail, 
    Clock, 
    RefreshCw, 
    X, 
    ChevronDown, 
    ChevronUp,
    Loader2,
    Copy,
    CheckCircle2
} from "lucide-react"
import { listInvitations, resendInvitation, cancelInvitation } from "@/actions/invitations"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface Invitation {
    id: string
    email: string
    role: string
    invitedByName: string
    createdAt: string
    expiresAt: string
    status: 'pending' | 'expired' | 'accepted'
}

export function PendingInvitations() {
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [actionId, setActionId] = useState<string | null>(null)

    useEffect(() => {
        loadInvitations()
    }, [])

    const loadInvitations = async () => {
        setLoading(true)
        const result = await listInvitations()
        if (result.invitations) {
            setInvitations(result.invitations)
        }
        setLoading(false)
    }

    const handleResend = async (id: string) => {
        setActionId(id)
        startTransition(async () => {
            const result = await resendInvitation(id)
            if (result.success) {
                toast.success("Invitation resent")
                loadInvitations()
            } else {
                toast.error(result.error || "Failed to resend")
            }
            setActionId(null)
        })
    }

    const handleCancel = async (id: string) => {
        setActionId(id)
        startTransition(async () => {
            const result = await cancelInvitation(id)
            if (result.success) {
                toast.success("Invitation cancelled")
                loadInvitations()
            } else {
                toast.error(result.error || "Failed to cancel")
            }
            setActionId(null)
        })
    }

    const copyInviteLink = (id: string) => {
        // Find the invitation and construct the link
        // Note: We don't have the token here, so we'd need to add it to the list response
        // For now, we'll just show a toast that the feature is coming
        toast.info("Copy link feature coming soon")
    }

    const pendingCount = invitations.filter(i => i.status === 'pending').length
    const expiredCount = invitations.filter(i => i.status === 'expired').length

    if (loading) {
        return null // Don't show loading state, will appear when loaded
    }

    if (invitations.length === 0) {
        return null // Don't show section if no invitations
    }

    const pendingInvitations = invitations.filter(i => i.status === 'pending')
    const otherInvitations = invitations.filter(i => i.status !== 'pending')

    return (
        <section className="space-y-4">
            <div 
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                        <Mail className="h-5 w-5 text-blue-500" />
                        Pending Invitations
                    </h2>
                    {pendingCount > 0 && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                            {pendingCount} pending
                        </Badge>
                    )}
                    {expiredCount > 0 && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                            {expiredCount} expired
                        </Badge>
                    )}
                </div>
                <Button variant="ghost" size="sm" className="text-slate-400 group-hover:text-slate-600">
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </div>

            {expanded && (
                <Card className="border-slate-200">
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                            {pendingInvitations.map((invitation) => (
                                <div 
                                    key={invitation.id}
                                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                            <Mail className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-900">{invitation.email}</span>
                                                <Badge variant="outline" className="text-xs">
                                                    {invitation.role}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                                <Clock className="h-3 w-3" />
                                                <span>
                                                    Expires {formatDistanceToNow(new Date(invitation.expiresAt), { addSuffix: true })}
                                                </span>
                                                <span className="text-slate-300">|</span>
                                                <span>Invited by {invitation.invitedByName}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleResend(invitation.id)}
                                            disabled={isPending && actionId === invitation.id}
                                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        >
                                            {isPending && actionId === invitation.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <>
                                                    <RefreshCw className="h-4 w-4 mr-1" />
                                                    Resend
                                                </>
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCancel(invitation.id)}
                                            disabled={isPending && actionId === invitation.id}
                                            className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            {/* Expired/Accepted invitations */}
                            {otherInvitations.length > 0 && (
                                <>
                                    <div className="px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        History
                                    </div>
                                    {otherInvitations.slice(0, 5).map((invitation) => (
                                        <div 
                                            key={invitation.id}
                                            className="flex items-center justify-between p-4 opacity-60"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                                    invitation.status === 'accepted' 
                                                        ? 'bg-green-100' 
                                                        : 'bg-orange-100'
                                                }`}>
                                                    {invitation.status === 'accepted' ? (
                                                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                                                    ) : (
                                                        <Clock className="h-5 w-5 text-orange-600" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-slate-700">{invitation.email}</span>
                                                        <Badge 
                                                            variant="outline" 
                                                            className={`text-xs ${
                                                                invitation.status === 'accepted'
                                                                    ? 'border-green-200 text-green-700 bg-green-50'
                                                                    : 'border-orange-200 text-orange-700 bg-orange-50'
                                                            }`}
                                                        >
                                                            {invitation.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-xs text-slate-400 mt-1">
                                                        {invitation.role} - {formatDistanceToNow(new Date(invitation.createdAt), { addSuffix: true })}
                                                    </div>
                                                </div>
                                            </div>
                                            {invitation.status === 'expired' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleResend(invitation.id)}
                                                    disabled={isPending && actionId === invitation.id}
                                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                >
                                                    {isPending && actionId === invitation.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <RefreshCw className="h-4 w-4 mr-1" />
                                                            Resend
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </section>
    )
}
