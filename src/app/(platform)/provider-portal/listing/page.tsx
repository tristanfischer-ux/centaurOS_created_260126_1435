// @ts-nocheck
'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { 
    Store, 
    Save, 
    Loader2,
    Eye,
    AlertCircle,
    CheckCircle2,
    Clock,
    XCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const categories = [
    { value: 'People', label: 'People', description: 'Offer your skills as a consultant or fractional executive' },
    { value: 'Products', label: 'Products', description: 'Sell physical products or hardware' },
    { value: 'Services', label: 'Services', description: 'Provide business services' },
    { value: 'AI', label: 'AI', description: 'Offer AI tools or automation' }
]

export default function SelfServiceListingPage() {
    const [isPending, startTransition] = useTransition()
    const [loading, setLoading] = useState(true)
    const [existingListing, setExistingListing] = useState<Record<string, unknown> | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
    const [subcategories, setSubcategories] = useState<string[]>([])
    
    // Form state
    const [formData, setFormData] = useState<SelfServiceListingInput>({
        title: '',
        category: 'People',
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
        const { listing, error } = await getProviderListing()
        
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
        
        // Reset subcategory if not in new list
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
                toast.success(existingListing ? 'Listing updated! Pending re-approval.' : 'Listing created! Pending approval.')
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Your Marketplace Listing</h1>
                    <p className="text-muted-foreground mt-1">
                        Create and manage how you appear in the marketplace
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
                        {existingListing ? 'Update Listing' : 'Create Listing'}
                    </Button>
                </div>
            </div>
            
            {/* Approval Status Banner */}
            {existingListing && (
                <Alert className={cn(
                    approvalStatus === 'approved' && 'border-status-success bg-status-success-light',
                    approvalStatus === 'pending' && 'border-status-warning bg-status-warning-light',
                    approvalStatus === 'rejected' && 'border-destructive bg-status-error-light',
                    approvalStatus === 'changes_requested' && 'border-status-info bg-status-info-light'
                )}>
                    <div className="flex items-center gap-2">
                        {approvalStatus === 'approved' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        {approvalStatus === 'pending' && <Clock className="h-4 w-4 text-amber-600" />}
                        {approvalStatus === 'rejected' && <XCircle className="h-4 w-4 text-red-600" />}
                        {approvalStatus === 'changes_requested' && <AlertCircle className="h-4 w-4 text-blue-600" />}
                        <AlertDescription className={cn(
                            approvalStatus === 'approved' && 'text-green-800',
                            approvalStatus === 'pending' && 'text-amber-800',
                            approvalStatus === 'rejected' && 'text-red-800',
                            approvalStatus === 'changes_requested' && 'text-blue-800'
                        )}>
                            {approvalStatus === 'approved' && 'Your listing is live in the marketplace.'}
                            {approvalStatus === 'pending' && 'Your listing is pending approval. This usually takes 24-48 hours.'}
                            {approvalStatus === 'rejected' && `Your listing was not approved. ${existingListing.approval_notes || 'Please contact support.'}`}
                            {approvalStatus === 'changes_requested' && `Changes requested: ${existingListing.approval_notes || 'Please review and update.'}`}
                        </AlertDescription>
                    </div>
                </Alert>
            )}
            
            <div className={cn("grid gap-6", showPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
                {/* Form */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Store className="h-5 w-5" />
                            Listing Details
                        </CardTitle>
                        <CardDescription>
                            This information appears on your marketplace card
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Category Selection */}
                        <div className="space-y-2">
                            <Label>Category *</Label>
                            <div className="grid grid-cols-2 gap-3">
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
                            <Label htmlFor="title">Listing Title *</Label>
                            <Input
                                id="title"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="e.g., Fractional CMO for B2B SaaS"
                                maxLength={100}
                            />
                            <p className="text-xs text-muted-foreground">
                                {formData.title.length}/100 characters
                            </p>
                        </div>
                        
                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describe what you offer, your expertise, and the value you bring..."
                                className="min-h-[150px]"
                                maxLength={2000}
                            />
                            <p className="text-xs text-muted-foreground">
                                {formData.description.length}/2000 characters. This appears on your marketplace card.
                            </p>
                        </div>
                        
                        {/* Tips */}
                        <div className="bg-status-info-light rounded-lg p-4 border border-status-info">
                            <h4 className="font-medium text-blue-900 text-sm mb-2">Tips for a great listing</h4>
                            <ul className="text-xs text-blue-800 space-y-1">
                                <li>• Use a clear, specific title that describes your offering</li>
                                <li>• Highlight your unique value proposition in the description</li>
                                <li>• Include relevant keywords buyers might search for</li>
                                <li>• Complete your profile to improve your listing's visibility</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
                
                {/* Preview */}
                {showPreview && preview && (
                    <div className="lg:sticky lg:top-6 h-fit">
                        <Card className="border-dashed">
                            <CardHeader>
                                <CardTitle className="text-sm text-muted-foreground">
                                    Marketplace Preview
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
                                            description: formData.description || 'Your listing description will appear here...',
                                            attributes: {},
                                            is_verified: false
                                        }}
                                        isSelected={false}
                                        onToggleSelect={() => {}}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground text-center mt-4">
                                    This is how your listing will appear in search results
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    )
}
