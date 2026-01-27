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
    const [isLoading, setIsLoading] = useState(false)
    const [emailError, setEmailError] = useState<string | null>(null)
    const [nameError, setNameError] = useState<string | null>(null)

    // Email validation function
    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    async function onSubmit(formData: FormData) {
        const email = formData.get('email') as string
        const fullName = formData.get('full_name') as string

        // Reset errors
        setEmailError(null)
        setNameError(null)

        // Validate email format
        if (!email || !email.trim()) {
            setEmailError('Email address is required')
            return
        }

        if (!validateEmail(email.trim())) {
            setEmailError('Please enter a valid email address (e.g., name@example.com)')
            return
        }

        // Validate name
        if (!fullName || !fullName.trim()) {
            setNameError('Full name is required')
            return
        }

        if (fullName.trim().length < 2) {
            setNameError('Full name must be at least 2 characters')
            return
        }

        if (fullName.trim().length > 100) {
            setNameError('Full name must be 100 characters or less')
            return
        }

        setIsLoading(true)
        try {
            const result = await createMember(formData)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success("Member added to roster")
                setOpen(false)
                setEmailError(null)
                setNameError(null)
            }
        } catch (error) {
            toast.error("Failed to add member")
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <UserPlus className="h-4 w-4" />
                    Invite Member
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Invite Network Member</DialogTitle>
                    <DialogDescription>
                        Add a new member to your Foundry. They will appear in the roster immediately.
                    </DialogDescription>
                </DialogHeader>
                <form action={onSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="full_name">
                            Full Name <span className="text-red-500" aria-label="required">*</span>
                        </Label>
                        <Input
                            id="full_name"
                            name="full_name"
                            placeholder="e.g. Sarah Connor"
                            required
                            aria-required={true}
                            aria-invalid={!!nameError}
                            aria-describedby={nameError ? "name-error" : undefined}
                            autoComplete="name"
                            enterKeyHint="next"
                            className={nameError ? 'border-destructive' : ''}
                            onChange={() => setNameError(null)}
                        />
                        {nameError && (
                            <p id="name-error" className="text-sm text-red-600 mt-1" role="alert">
                                {nameError}
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">
                            Email Address <span className="text-red-500" aria-label="required">*</span>
                        </Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            enterKeyHint="done"
                            placeholder="sarah@example.com"
                            required
                            aria-required={true}
                            aria-invalid={!!emailError}
                            aria-describedby={emailError ? "email-error" : undefined}
                            className={emailError ? 'border-destructive' : ''}
                            onChange={() => setEmailError(null)}
                        />
                        {emailError && (
                            <p id="email-error" className="text-sm text-red-600 mt-1" role="alert">
                                {emailError}
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="role_type">
                            Role <span className="text-red-500" aria-label="required">*</span>
                        </Label>
                        <Select name="role_type" required defaultValue="Apprentice">
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
                    <DialogFooter className="gap-2 pt-4 border-t border-border">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
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
