// @ts-nocheck
'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Award, Plus, AlertTriangle, Info } from 'lucide-react'
import { CertificationForm } from '@/components/provider/CertificationForm'
import { CertificationCard } from '@/components/provider/CertificationCard'
import { deleteCertification, requestVerification, type Certification } from '@/actions/certifications'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { differenceInDays } from 'date-fns'

interface CertificationsViewProps {
    certifications: Certification[]
    error: string | null
}

export function CertificationsView({ certifications, error }: CertificationsViewProps) {
    const router = useRouter()
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Separate expiring soon certifications
    const expiringSoon = certifications.filter(cert => {
        if (!cert.expiry_date) return false
        const daysUntil = differenceInDays(new Date(cert.expiry_date), new Date())
        return daysUntil > 0 && daysUntil <= 90
    })

    // Separate verified and unverified
    const verified = certifications.filter(c => c.is_verified)
    const pending = certifications.filter(c => !c.is_verified)

    const handleDelete = async () => {
        if (!deleteId) return
        
        setIsDeleting(true)
        const result = await deleteCertification(deleteId)
        
        if (result.success) {
            toast.success('Certification deleted')
            router.refresh()
        } else {
            toast.error(result.error || 'Failed to delete certification')
        }
        
        setIsDeleting(false)
        setDeleteId(null)
    }

    const handleRequestVerification = async (certId: string) => {
        const result = await requestVerification(certId)
        
        if (result.success) {
            toast.success('Verification request submitted')
            router.refresh()
        } else {
            toast.error(result.error || 'Failed to request verification')
        }
    }

    const handleSuccess = () => {
        router.refresh()
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Certifications</h1>
                    <p className="text-muted-foreground mt-1">
                        Showcase your professional credentials and certifications
                    </p>
                </div>
                <CertificationForm onSuccess={handleSuccess} />
            </div>

            {/* Error State */}
            {error && (
                <div className="rounded-lg border border-destructive bg-status-error-light p-4 text-destructive">
                    {error}
                </div>
            )}

            {/* Expiry Warnings */}
            {expiringSoon.length > 0 && (
                <Card className="border-status-warning bg-status-warning-light">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2 text-status-warning-dark">
                            <AlertTriangle className="w-5 h-5" />
                            Expiring Soon
                        </CardTitle>
                        <CardDescription className="text-status-warning">
                            {expiringSoon.length} certification{expiringSoon.length > 1 ? 's' : ''} expiring within 90 days
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {expiringSoon.map((cert) => (
                            <CertificationCard
                                key={cert.id}
                                certification={cert}
                                onEdit={handleSuccess}
                                onDelete={() => setDeleteId(cert.id)}
                                onRequestVerification={
                                    !cert.is_verified && cert.verification_url 
                                        ? () => handleRequestVerification(cert.id)
                                        : undefined
                                }
                            />
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Empty State */}
            {!error && certifications.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                        <Award className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No certifications yet</h3>
                        <p className="text-muted-foreground mb-4">
                            Add your professional certifications to build trust with clients
                        </p>
                        <CertificationForm
                            trigger={
                                <Button variant="default">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Your First Certification
                                </Button>
                            }
                            onSuccess={handleSuccess}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Verified Certifications */}
            {verified.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-status-success" />
                        Verified ({verified.length})
                    </h2>
                    <div className="space-y-3">
                        {verified.map((cert) => (
                            <CertificationCard
                                key={cert.id}
                                certification={cert}
                                onEdit={handleSuccess}
                                onDelete={() => setDeleteId(cert.id)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Pending Verification */}
            {pending.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                            Pending Verification ({pending.length})
                        </h2>
                    </div>
                    <div className="rounded-lg border border-status-info bg-status-info-light p-3 flex items-start gap-2">
                        <Info className="w-4 h-4 text-status-info mt-0.5 shrink-0" />
                        <p className="text-sm text-status-info">
                            Add a verification URL to your certifications to request verification. 
                            Verified certifications are more trustworthy to potential clients.
                        </p>
                    </div>
                    <div className="space-y-3">
                        {pending.map((cert) => (
                            <CertificationCard
                                key={cert.id}
                                certification={cert}
                                onEdit={handleSuccess}
                                onDelete={() => setDeleteId(cert.id)}
                                onRequestVerification={
                                    cert.verification_url 
                                        ? () => handleRequestVerification(cert.id)
                                        : undefined
                                }
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Certification</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this certification?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
