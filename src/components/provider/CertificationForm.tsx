'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { CalendarIcon, Loader2, Plus } from 'lucide-react'
import { addCertification, updateCertification, type Certification } from '@/actions/trust-signals'
import { toast } from 'sonner'

interface CertificationFormProps {
    certification?: Certification
    trigger?: React.ReactNode
    onSuccess?: () => void
}

export function CertificationForm({ certification, trigger, onSuccess }: CertificationFormProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    
    // Form state
    const [certificationName, setCertificationName] = useState(certification?.certification_name || '')
    const [issuingBody, setIssuingBody] = useState(certification?.issuing_body || '')
    const [credentialId, setCredentialId] = useState(certification?.credential_id || '')
    const [issuedDate, setIssuedDate] = useState<Date | undefined>(
        certification?.issued_date ? new Date(certification.issued_date) : undefined
    )
    const [expiryDate, setExpiryDate] = useState<Date | undefined>(
        certification?.expiry_date ? new Date(certification.expiry_date) : undefined
    )
    const [verificationUrl, setVerificationUrl] = useState(certification?.verification_url || '')

    const isEditing = !!certification

    const resetForm = () => {
        if (!certification) {
            setCertificationName('')
            setIssuingBody('')
            setCredentialId('')
            setIssuedDate(undefined)
            setExpiryDate(undefined)
            setVerificationUrl('')
        }
    }

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen)
        if (!newOpen) {
            setTimeout(resetForm, 300)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!certificationName.trim()) {
            toast.error('Certification name is required')
            return
        }
        if (!issuingBody.trim()) {
            toast.error('Issuing body is required')
            return
        }

        setIsLoading(true)

        try {
            const data = {
                certification_name: certificationName.trim(),
                issuing_body: issuingBody.trim(),
                credential_id: credentialId.trim() || undefined,
                issued_date: issuedDate?.toISOString().split('T')[0],
                expiry_date: expiryDate?.toISOString().split('T')[0],
                verification_url: verificationUrl.trim() || undefined,
            }

            const result = isEditing
                ? await updateCertification(certification.id, data)
                : await addCertification(data)

            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(isEditing ? 'Certification updated' : 'Certification added')
                setOpen(false)
                onSuccess?.()
            }
        } catch (err) {
            toast.error('An unexpected error occurred')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="primary" size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Add Certification
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent size="md" className="max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>
                            {isEditing ? 'Edit Certification' : 'Add Certification'}
                        </DialogTitle>
                        <DialogDescription>
                            Add your professional certifications and credentials.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {/* Certification Name */}
                        <div className="grid gap-2">
                            <Label htmlFor="certName">
                                Certification Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="certName"
                                value={certificationName}
                                onChange={(e) => setCertificationName(e.target.value)}
                                placeholder="e.g., AWS Solutions Architect"
                                required
                            />
                        </div>

                        {/* Issuing Body */}
                        <div className="grid gap-2">
                            <Label htmlFor="issuingBody">
                                Issuing Body <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="issuingBody"
                                value={issuingBody}
                                onChange={(e) => setIssuingBody(e.target.value)}
                                placeholder="e.g., Amazon Web Services"
                                required
                            />
                        </div>

                        {/* Credential ID */}
                        <div className="grid gap-2">
                            <Label htmlFor="credentialId">Credential ID</Label>
                            <Input
                                id="credentialId"
                                value={credentialId}
                                onChange={(e) => setCredentialId(e.target.value)}
                                placeholder="e.g., ABC123XYZ"
                            />
                        </div>

                        {/* Dates Row */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Issued Date */}
                            <div className="grid gap-2">
                                <Label>Issue Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                'w-full justify-start text-left font-normal',
                                                !issuedDate && 'text-muted-foreground'
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {issuedDate ? (
                                                format(issuedDate, 'PP')
                                            ) : (
                                                <span>Pick date</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={issuedDate}
                                            onSelect={setIssuedDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Expiry Date */}
                            <div className="grid gap-2">
                                <Label>Expiry Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                'w-full justify-start text-left font-normal',
                                                !expiryDate && 'text-muted-foreground'
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {expiryDate ? (
                                                format(expiryDate, 'PP')
                                            ) : (
                                                <span>No expiry</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={expiryDate}
                                            onSelect={setExpiryDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        {/* Verification URL */}
                        <div className="grid gap-2">
                            <Label htmlFor="verificationUrl">Verification URL</Label>
                            <Input
                                id="verificationUrl"
                                type="url"
                                value={verificationUrl}
                                onChange={(e) => setVerificationUrl(e.target.value)}
                                placeholder="https://verify.example.com/..."
                            />
                            <p className="text-xs text-muted-foreground">
                                Link where the certification can be verified
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isEditing ? 'Save Changes' : 'Add Certification'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
