// Supplier Portal - Listing Management
// Re-exports the provider listing page functionality

// @ts-nocheck
'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select'
import {
    createSelfServiceListing,
    updateSelfServiceListing,
    getProviderListing,
    getSubcategories,
    previewListing,
    SelfServiceListingInput
} from '@/actions/self-service-listing'
import { MarketCard } from '@/components/marketplace/market-card'
import { typography } from '@/lib/design-system'
import { 
    Package, 
    Save, 
    Loader2,
    Eye,
    CheckCircle2,
    Clock,
    XCircle,
    AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const categories = [
    { value: 'People', label: 'People', description: 'Offer your skills as a consultant' },
    { value: 'Products', label: 'Products', description: 'Sell physical products' },
    { value: 'Services', label: 'Services', description: 'Provide business services' }
]

export default function SupplierListingPage() {
    const [isPending, startTransition] = useTransition()
    const [loading, setLoading] = useState(true)
    const [existingListing, setExistingListing] = useState<Record<string, unknown> | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
    const [subcategories, setSubcategories] = useState<string[]>([])
    
    const [formData, setFormData] = useState<SelfServiceListingInput>({
        title: '',
        category: 'Products',
        subcategory: '',
        description: ''
    })
    
    useEffect(() => {
        loadExistingListing()
    }, [])
    
    useEffect(() => {
        loadSubcategories(formData.category)
    }, [formData.category])
    
    async function loadExistingListing() {
        const { listing } = await getProviderListing()
        
        if (listing) {
            setExistingListing(listing)
            setFormData({
                title: listing.title as string,
                category: listing.category as SelfServiceListingInput['category'],
                subcategory: listing.subcategory as string,
                description: listing.description as string || ''
            })
        }
        
        setLoading(false)
    }
    
    async function loadSubcategories(category: string) {
        const subs = await getSubcategories(category)
        setSubcategories(subs)
        
        if (!subs.includes(formData.subcategory)) {
            setFormData(prev => ({ ...prev, subcategory: '' }))
        }
    }
    
    async function handlePreview() {
        const { preview: previewData, error } = await previewListing(formData)
        
        if (previewData) {
            setPreview(previewData)
            setShowPreview(true)
        } else {
            toast.error(error || 'Failed to generate preview')
        }
    }
    
    async function handleSubmit() {
        startTransition(async () => {
            let result
            
            if (existingListing) {
                result = await updateSelfServiceListing(existingListing.id as string, formData)
            } else {
                result = await createSelfServiceListing(formData)
            }
            
            if (result.success) {
                toast.success(existingListing ? 'Listing updated!' : 'Listing created!')
                loadExistingListing()
            } else {
                toast.error(result.error || 'Something went wrong')
            }
        })
    }
    
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }
    
    const approvalStatus = existingListing?.approval_status as string | undefined
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className={typography.pageHeader}>
                        <div className={typography.pageHeaderAccent} />
                        <h1 className={typography.h1}>My Listing</h1>
                    </div>
                    <p className={typography.pageSubtitle}>
                        Manage how you appear in the marketplace
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={handlePreview}>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={isPending || !formData.title || !formData.subcategory}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        {existingListing ? 'Update' : 'Create'}
                    </Button>
                </div>
            </div>
            
            {/* Approval Status */}
            {existingListing && (
                <Alert className={cn(
                    approvalStatus === 'approved' && 'border-status-success bg-status-success-light',
                    approvalStatus === 'pending' && 'border-status-warning bg-status-warning-light',
                    approvalStatus === 'rejected' && 'border-destructive bg-status-error-light'
                )}>
                    <div className="flex items-center gap-2">
                        {approvalStatus === 'approved' && <CheckCircle2 className="h-4 w-4 text-status-success" />}
                        {approvalStatus === 'pending' && <Clock className="h-4 w-4 text-status-warning" />}
                        {approvalStatus === 'rejected' && <XCircle className="h-4 w-4 text-destructive" />}
                        <AlertDescription>
                            {approvalStatus === 'approved' && 'Your listing is live in the marketplace.'}
                            {approvalStatus === 'pending' && 'Your listing is pending approval.'}
                            {approvalStatus === 'rejected' && 'Your listing was not approved.'}
                        </AlertDescription>
                    </div>
                </Alert>
            )}
            
            <div className={cn("grid gap-6", showPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
                {/* Form */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5" />
                            Listing Details
                        </CardTitle>
                        <CardDescription>
                            This information appears on your marketplace card
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Category */}
                        <div className="space-y-2">
                            <Label>Category *</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {categories.map((cat) => (
                                    <button
                                        key={cat.value}
                                        onClick={() => setFormData({ ...formData, category: cat.value as SelfServiceListingInput['category'] })}
                                        className={cn(
                                            "p-3 rounded-lg border-2 text-left transition-all",
                                            "hover:border-international-orange/50",
                                            formData.category === cat.value 
                                                ? "border-international-orange bg-international-orange/5" 
                                                : "border-muted"
                                        )}
                                    >
                                        <p className="font-medium text-sm">{cat.label}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {/* Subcategory */}
                        <div className="space-y-2">
                            <Label>Subcategory *</Label>
                            <Select 
                                value={formData.subcategory} 
                                onValueChange={(v) => setFormData({ ...formData, subcategory: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a subcategory" />
                                </SelectTrigger>
                                <SelectContent>
                                    {subcategories.map((sub) => (
                                        <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {/* Title */}
                        <div className="space-y-2">
                            <Label htmlFor="title">Title *</Label>
                            <Input
                                id="title"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="e.g., Custom Metal Fabrication"
                                maxLength={100}
                            />
                        </div>
                        
                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describe what you offer..."
                                className="min-h-[150px]"
                                maxLength={2000}
                            />
                        </div>
                    </CardContent>
                </Card>
                
                {/* Preview */}
                {showPreview && preview && (
                    <div className="lg:sticky lg:top-6 h-fit">
                        <Card className="border-dashed">
                            <CardHeader>
                                <CardTitle className="text-sm text-muted-foreground">
                                    Preview
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="pointer-events-none">
                                    <MarketCard
                                        listing={{
                                            id: 'preview',
                                            title: formData.title || 'Your Listing Title',
                                            category: formData.category,
                                            subcategory: formData.subcategory || 'Subcategory',
                                            description: formData.description || 'Description...',
                                            attributes: {},
                                            is_verified: false
                                        }}
                                        isSelected={false}
                                        onToggleSelect={() => {}}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    )
}
