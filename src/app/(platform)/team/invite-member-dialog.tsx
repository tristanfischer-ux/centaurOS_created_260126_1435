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
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { createInvitation } from "@/actions/invitations"
import { UserPlus, Loader2, Mail, CheckCircle2, Copy } from "lucide-react"
import { toast } from "sonner"

type MemberRole = "Executive" | "Apprentice" | "AI_Agent"

export function InviteMemberDialog() {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [emailError, setEmailError] = useState<string | null>(null)
    const [success, setSuccess] = useState<{ email: string; token: string } | null>(null)
    const [email, setEmail] = useState("")
    const [role, setRole] = useState<MemberRole>("Apprentice")
    const [message, setMessage] = useState("")

    // Email validation function
    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    const resetForm = () => {
        setEmail("")
        setRole("Apprentice")
        setMessage("")
        setEmailError(null)
        setSuccess(null)
    }

    const handleClose = () => {
        setOpen(false)
        // Reset form after dialog closes
        setTimeout(resetForm, 300)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        
        // Reset errors
        setEmailError(null)

        // Validate email format
        if (!email || !email.trim()) {
            setEmailError('Email address is required')
            return
        }

        if (!validateEmail(email.trim())) {
            setEmailError('Please enter a valid email address (e.g., name@example.com)')
            return
        }

        setIsLoading(true)
        try {
            const result = await createInvitation(
                email.trim(),
                role,
                message.trim() || undefined
            )
            
            if (!result.success || result.error) {
                toast.error(result.error || "Failed to send invitation")
            } else if (result.invitation) {
                setSuccess({
                    email: email.trim(),
                    token: result.invitation.token
                })
                toast.success("Invitation sent!")
            }
        } catch (error) {
            toast.error("Failed to send invitation")
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const copyInviteLink = () => {
        if (success?.token) {
            const link = `${window.location.origin}/invite/${success.token}`
            navigator.clipboard.writeText(link)
            toast.success("Invite link copied to clipboard")
        }
    }

    return (
        <Dialog open={open} onOpenChange={(newOpen) => {
            if (!newOpen) handleClose()
            else setOpen(true)
        }}>
            <DialogTrigger asChild>
                <Button variant="secondary">
                    <UserPlus className="h-4 w-4" />
                    Invite Member
                </Button>
            </DialogTrigger>
            <DialogContent size="sm">
                {success ? (
                    // Success state
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                Invitation Sent
                            </DialogTitle>
                            <DialogDescription>
                                We've sent an invitation email to {success.email}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-6">
                            <div className="bg-muted rounded-lg p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Mail className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium">{success.email}</p>
                                        <p className="text-sm text-muted-foreground">Invitation expires in 7 days</p>
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-border">
                                    <p className="text-sm text-muted-foreground mb-2">
                                        You can also share this link directly:
                                    </p>
                                    <Button 
                                        variant="secondary" 
                                        size="sm" 
                                        className="w-full"
                                        onClick={copyInviteLink}
                                    >
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copy Invite Link
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="secondary" onClick={handleClose}>
                                Done
                            </Button>
                            <Button onClick={() => {
                                setSuccess(null)
                                setEmail("")
                                setMessage("")
                            }}>
                                Invite Another
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    // Form state
                    <>
                        <DialogHeader>
                            <DialogTitle>Invite Team Member</DialogTitle>
                            <DialogDescription>
                                Send an invitation to join your company. They'll receive an email with a link to accept.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">
                                    Email Address <span className="text-destructive ml-1" aria-label="required">*</span>
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    inputMode="email"
                                    autoComplete="email"
                                    placeholder="colleague@example.com"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value)
                                        setEmailError(null)
                                    }}
                                    required
                                    aria-required={true}
                                    aria-invalid={!!emailError}
                                    aria-describedby={emailError ? "email-error" : undefined}
                                    className={emailError ? 'border-destructive' : ''}
                                />
                                {emailError && (
                                    <p id="email-error" className="text-sm text-destructive mt-1" role="alert">
                                        {emailError}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role_type">
                                    Role <span className="text-destructive ml-1" aria-label="required">*</span>
                                </Label>
                                <Select 
                                    value={role} 
                                    onValueChange={(value) => setRole(value as MemberRole)}
                                    required
                                >
                                    <SelectTrigger 
                                        id="role_type"
                                        aria-required={true}
                                    >
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Executive">Executive (Assessor)</SelectItem>
                                        <SelectItem value="Apprentice">Apprentice (Executor)</SelectItem>
                                        <SelectItem value="AI_Agent">AI Agent (Digital)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Executives manage tasks and approve work. Apprentices execute tasks.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="message">
                                    Personal Message <span className="text-muted-foreground text-xs">(optional)</span>
                                </Label>
                                <Textarea
                                    id="message"
                                    placeholder="Add a personal note to the invitation..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    rows={3}
                                    className="resize-none"
                                />
                            </div>
                            <DialogFooter className="gap-2 pt-4 border-t border-border">
                                <Button type="button" variant="secondary" onClick={handleClose}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Mail className="h-4 w-4" />
                                            Send Invitation
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
