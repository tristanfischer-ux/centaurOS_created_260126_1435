"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { 
    getApplicationDetail, 
    approveApplication, 
    rejectApplication,
    SupplierTier,
    ProviderApplication
} from "@/actions/admin"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDistanceToNow, format } from "date-fns"
import { toast } from "sonner"
import { 
    ArrowLeft, 
    Building2, 
    CheckCircle2, 
    XCircle,
    User,
    Mail,
    Loader2,
    AlertCircle
} from "lucide-react"
import Link from "next/link"

const tierOptions: { value: SupplierTier; label: string; description: string }[] = [
    { value: 'verified_partner', label: 'Verified Partner', description: 'Top-tier partner with full platform privileges' },
    { value: 'approved', label: 'Approved', description: 'Standard approved supplier' },
    { value: 'pending', label: 'Pending', description: 'Awaiting full verification' },
]

export default function ApplicationDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = use(params)
    const router = useRouter()
    const [application, setApplication] = useState<ProviderApplication | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    // Form state
    const [selectedTier, setSelectedTier] = useState<SupplierTier>('approved')
    const [notes, setNotes] = useState('')
    const [rejectReason, setRejectReason] = useState('')
    const [submitting, setSubmitting] = useState(false)
    
    useEffect(() => {
        const fetchApplication = async () => {
            setLoading(true)
            const { data, error } = await getApplicationDetail(id)
            
            if (error) {
                setError(error)
            } else {
                setApplication(data)
            }
            
            setLoading(false)
        }
        
        fetchApplication()
    }, [id])
    
    const handleApprove = async () => {
        setSubmitting(true)
        const { success, error } = await approveApplication(id, selectedTier, notes || undefined)
        
        if (success) {
            toast.success('Application approved successfully')
            router.push('/admin/applications')
        } else {
            toast.error(error || 'Failed to approve application')
        }
        
        setSubmitting(false)
    }
    
    const handleReject = async () => {
        if (!rejectReason.trim()) {
            toast.error('Please provide a reason for rejection')
            return
        }
        
        setSubmitting(true)
        const { success, error } = await rejectApplication(id, rejectReason)
        
        if (success) {
            toast.success('Application rejected')
            router.push('/admin/applications')
        } else {
            toast.error(error || 'Failed to reject application')
        }
        
        setSubmitting(false)
    }
    
    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        )
    }
    
    if (error || !application) {
        return (
            <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load application</h2>
                <p className="text-muted-foreground mb-4">{error}</p>
                <Link href="/admin/applications">
                    <Button variant="outline">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Applications
                    </Button>
                </Link>
            </div>
        )
    }
    
    const isPending = application.status === 'pending' || application.status === 'under_review'
    
    return (
        <div className="space-y-6">
            {/* Back Link */}
            <Link href="/admin/applications" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Applications
            </Link>
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Badge variant={
                            application.status === 'pending' ? 'secondary' :
                            application.status === 'approved' ? 'default' :
                            application.status === 'rejected' ? 'destructive' :
                            'outline'
                        }>
                            {application.status.replace('_', ' ')}
                        </Badge>
                        {application.assigned_tier && (
                            <Badge variant="outline" className="capitalize">
                                {application.assigned_tier.replace('_', ' ')}
                            </Badge>
                        )}
                    </div>
                    <h2 className="text-2xl font-bold text-foreground">
                        {application.company_name || 'Unnamed Company'}
                    </h2>
                </div>
            </div>
            
            {/* Application Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Application Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-muted-foreground">Category</Label>
                                <p className="font-medium capitalize">{application.category}</p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Submitted</Label>
                                <p className="font-medium">
                                    {format(new Date(application.submitted_at), 'MMM d, yyyy')}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(application.submitted_at), { addSuffix: true })}
                                </p>
                            </div>
                        </div>
                        
                        {application.user && (
                            <div className="border-t pt-4 mt-4">
                                <Label className="text-muted-foreground mb-2 block">Applicant</Label>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <span>{application.user.full_name || 'Unknown'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">{application.user.email}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                
                {/* Application Data */}
                <Card>
                    <CardHeader>
                        <CardTitle>Additional Information</CardTitle>
                        <CardDescription>Data submitted with the application</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {application.application_data && Object.keys(application.application_data).length > 0 ? (
                            <div className="space-y-3">
                                {Object.entries(application.application_data).map(([key, value]) => (
                                    <div key={key}>
                                        <Label className="text-muted-foreground capitalize">
                                            {key.replace(/_/g, ' ')}
                                        </Label>
                                        <p className="font-medium">
                                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No additional data provided.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            {/* Verification Checklist */}
            <Card>
                <CardHeader>
                    <CardTitle>Verification Checklist</CardTitle>
                    <CardDescription>Review these items before making a decision</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                            'Company information is complete',
                            'Contact details are valid',
                            'Category is appropriate',
                            'No red flags in application data',
                            'Business registration verified (if applicable)',
                            'Previous experience reviewed',
                        ].map((item, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                                <div className="h-4 w-4 rounded border border-muted-foreground/30" />
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
            
            {/* Actions */}
            {isPending && (
                <Card>
                    <CardHeader>
                        <CardTitle>Decision</CardTitle>
                        <CardDescription>Approve or reject this application</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Approve Section */}
                        <div className="space-y-4 p-4 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <h3 className="font-semibold">Approve Application</h3>
                            </div>
                            
                            <div className="space-y-3">
                                <div>
                                    <Label htmlFor="tier">Assign Tier</Label>
                                    <Select value={selectedTier} onValueChange={(v) => setSelectedTier(v as SupplierTier)}>
                                        <SelectTrigger id="tier" className="mt-1.5">
                                            <SelectValue placeholder="Select tier" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {tierOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    <div>
                                                        <div className="font-medium">{option.label}</div>
                                                        <div className="text-xs text-muted-foreground">{option.description}</div>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div>
                                    <Label htmlFor="notes">Notes (Optional)</Label>
                                    <Textarea
                                        id="notes"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Add any notes about this approval..."
                                        className="mt-1.5"
                                    />
                                </div>
                                
                                <Button
                                    onClick={handleApprove}
                                    disabled={submitting}
                                    className="w-full"
                                    variant="default"
                                >
                                    {submitting ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                    )}
                                    Approve Application
                                </Button>
                            </div>
                        </div>
                        
                        {/* Reject Section */}
                        <div className="space-y-4 p-4 border rounded-lg bg-red-50/50 dark:bg-red-950/20">
                            <div className="flex items-center gap-2">
                                <XCircle className="h-5 w-5 text-red-600" />
                                <h3 className="font-semibold">Reject Application</h3>
                            </div>
                            
                            <div className="space-y-3">
                                <div>
                                    <Label htmlFor="rejectReason">Reason for Rejection</Label>
                                    <Textarea
                                        id="rejectReason"
                                        value={rejectReason}
                                        onChange={(e) => setRejectReason(e.target.value)}
                                        placeholder="Explain why this application is being rejected..."
                                        className="mt-1.5"
                                    />
                                </div>
                                
                                <Button
                                    onClick={handleReject}
                                    disabled={submitting || !rejectReason.trim()}
                                    className="w-full"
                                    variant="destructive"
                                >
                                    {submitting ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <XCircle className="h-4 w-4 mr-2" />
                                    )}
                                    Reject Application
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
            
            {/* Review Info for already reviewed applications */}
            {!isPending && application.reviewer_notes && (
                <Card>
                    <CardHeader>
                        <CardTitle>Review Notes</CardTitle>
                        <CardDescription>
                            Reviewed {application.reviewed_at && formatDistanceToNow(new Date(application.reviewed_at), { addSuffix: true })}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-foreground">{application.reviewer_notes}</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
