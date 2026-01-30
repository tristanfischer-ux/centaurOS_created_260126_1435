'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog'
import { 
    getCaseStudies, 
    createCaseStudy, 
    updateCaseStudy, 
    deleteCaseStudy,
    toggleCaseStudyFeatured,
    CaseStudyInput 
} from '@/actions/case-studies'
import { 
    Plus, 
    Edit2, 
    Trash2, 
    Star, 
    Loader2,
    FileText,
    TrendingUp,
    Quote,
    AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface CaseStudy extends CaseStudyInput {
    id: string
    created_at: string
}

const engagementTypes = [
    { value: 'fractional', label: 'Fractional (ongoing part-time)' },
    { value: 'project', label: 'Project-based' },
    { value: 'advisory', label: 'Advisory' },
    { value: 'interim', label: 'Interim (full-time temporary)' }
]

const industries = [
    'Technology', 'Healthcare', 'Finance', 'E-commerce', 'SaaS', 
    'Manufacturing', 'Retail', 'Media', 'Education', 'Real Estate', 'Other'
]

const companyStages = [
    'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 
    'Growth', 'Mature', 'Turnaround'
]

export default function CaseStudiesPage() {
    const [isPending, startTransition] = useTransition()
    const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [showDialog, setShowDialog] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    // Form state
    const [formData, setFormData] = useState<CaseStudyInput>({
        title: '',
        client_name: '',
        client_industry: '',
        company_stage: '',
        challenge: '',
        approach: '',
        outcome: '',
        engagement_type: undefined,
        hours_per_week: undefined,
        is_featured: false,
        is_public: true,
        metrics: [],
        testimonial_quote: '',
        testimonial_author: '',
        testimonial_role: ''
    })
    
    // Metric being added
    const [newMetric, setNewMetric] = useState({ label: '', value: '', change_percent: '' })
    
    useEffect(() => {
        loadCaseStudies()
    }, [])
    
    async function loadCaseStudies() {
        const { caseStudies: data, error } = await getCaseStudies()
        if (error) {
            setError(error)
        } else {
            setCaseStudies(data as CaseStudy[])
        }
        setLoading(false)
    }
    
    function resetForm() {
        setFormData({
            title: '',
            client_name: '',
            client_industry: '',
            company_stage: '',
            challenge: '',
            approach: '',
            outcome: '',
            engagement_type: undefined,
            hours_per_week: undefined,
            is_featured: false,
            is_public: true,
            metrics: [],
            testimonial_quote: '',
            testimonial_author: '',
            testimonial_role: ''
        })
        setEditingId(null)
        setNewMetric({ label: '', value: '', change_percent: '' })
    }
    
    function handleEdit(caseStudy: CaseStudy) {
        setFormData({
            title: caseStudy.title,
            client_name: caseStudy.client_name,
            client_industry: caseStudy.client_industry,
            company_stage: caseStudy.company_stage,
            challenge: caseStudy.challenge,
            approach: caseStudy.approach,
            outcome: caseStudy.outcome,
            engagement_type: caseStudy.engagement_type,
            hours_per_week: caseStudy.hours_per_week,
            is_featured: caseStudy.is_featured,
            is_public: caseStudy.is_public,
            metrics: caseStudy.metrics || [],
            testimonial_quote: caseStudy.testimonial_quote,
            testimonial_author: caseStudy.testimonial_author,
            testimonial_role: caseStudy.testimonial_role
        })
        setEditingId(caseStudy.id)
        setShowDialog(true)
    }
    
    function addMetric() {
        if (newMetric.label && newMetric.value) {
            setFormData({
                ...formData,
                metrics: [
                    ...(formData.metrics || []),
                    {
                        label: newMetric.label,
                        value: newMetric.value,
                        change_percent: newMetric.change_percent ? parseInt(newMetric.change_percent) : undefined
                    }
                ]
            })
            setNewMetric({ label: '', value: '', change_percent: '' })
        }
    }
    
    function removeMetric(index: number) {
        setFormData({
            ...formData,
            metrics: (formData.metrics || []).filter((_, i) => i !== index)
        })
    }
    
    async function handleSubmit() {
        startTransition(async () => {
            let result
            if (editingId) {
                result = await updateCaseStudy(editingId, formData)
            } else {
                result = await createCaseStudy(formData)
            }
            
            if (result.success) {
                toast.success(editingId ? 'Case study updated!' : 'Case study created!')
                setShowDialog(false)
                resetForm()
                loadCaseStudies()
            } else {
                toast.error(result.error || 'Something went wrong')
            }
        })
    }
    
    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this case study?')) return
        
        startTransition(async () => {
            const result = await deleteCaseStudy(id)
            if (result.success) {
                toast.success('Case study deleted')
                loadCaseStudies()
            } else {
                toast.error(result.error || 'Failed to delete')
            }
        })
    }
    
    async function handleToggleFeatured(id: string) {
        startTransition(async () => {
            const result = await toggleCaseStudyFeatured(id)
            if (result.success) {
                loadCaseStudies()
            } else {
                toast.error(result.error || 'Failed to update')
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
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Case Studies</h1>
                    <p className="text-muted-foreground mt-1">
                        Showcase your past work and client success stories
                    </p>
                </div>
                <Dialog open={showDialog} onOpenChange={(open) => {
                    setShowDialog(open)
                    if (!open) resetForm()
                }}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Case Study
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {editingId ? 'Edit Case Study' : 'Create Case Study'}
                            </DialogTitle>
                            <DialogDescription>
                                Tell the story of a successful engagement. Use the Challenge → Approach → Outcome format.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4">
                            {/* Basic Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="title">Title *</Label>
                                    <Input
                                        id="title"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="e.g., Scaling B2B Sales from $0 to $5M ARR"
                                    />
                                </div>
                                
                                <div className="space-y-2">
                                    <Label htmlFor="client_name">Client Name (optional)</Label>
                                    <Input
                                        id="client_name"
                                        value={formData.client_name || ''}
                                        onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                                        placeholder="Leave blank for confidential"
                                    />
                                </div>
                                
                                <div className="space-y-2">
                                    <Label htmlFor="client_industry">Industry</Label>
                                    <Select 
                                        value={formData.client_industry || ''} 
                                        onValueChange={(v) => setFormData({ ...formData, client_industry: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select industry" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {industries.map((ind) => (
                                                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div className="space-y-2">
                                    <Label htmlFor="company_stage">Company Stage</Label>
                                    <Select 
                                        value={formData.company_stage || ''} 
                                        onValueChange={(v) => setFormData({ ...formData, company_stage: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select stage" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {companyStages.map((stage) => (
                                                <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div className="space-y-2">
                                    <Label htmlFor="engagement_type">Engagement Type</Label>
                                    <Select 
                                        value={formData.engagement_type || ''} 
                                        onValueChange={(v) => setFormData({ ...formData, engagement_type: v as CaseStudyInput['engagement_type'] })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {engagementTypes.map((type) => (
                                                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            
                            {/* Challenge → Approach → Outcome */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="challenge">Challenge *</Label>
                                    <Textarea
                                        id="challenge"
                                        value={formData.challenge}
                                        onChange={(e) => setFormData({ ...formData, challenge: e.target.value })}
                                        placeholder="What problem did the client face? What was the situation before you got involved?"
                                        className="min-h-[100px]"
                                    />
                                </div>
                                
                                <div className="space-y-2">
                                    <Label htmlFor="approach">Approach *</Label>
                                    <Textarea
                                        id="approach"
                                        value={formData.approach}
                                        onChange={(e) => setFormData({ ...formData, approach: e.target.value })}
                                        placeholder="How did you tackle the challenge? What strategies or frameworks did you use?"
                                        className="min-h-[100px]"
                                    />
                                </div>
                                
                                <div className="space-y-2">
                                    <Label htmlFor="outcome">Outcome *</Label>
                                    <Textarea
                                        id="outcome"
                                        value={formData.outcome}
                                        onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
                                        placeholder="What were the results? Be specific with metrics where possible."
                                        className="min-h-[100px]"
                                    />
                                </div>
                            </div>
                            
                            {/* Metrics */}
                            <div className="space-y-3">
                                <Label>Key Metrics (optional)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={newMetric.label}
                                        onChange={(e) => setNewMetric({ ...newMetric, label: e.target.value })}
                                        placeholder="Metric name"
                                        className="flex-1"
                                    />
                                    <Input
                                        value={newMetric.value}
                                        onChange={(e) => setNewMetric({ ...newMetric, value: e.target.value })}
                                        placeholder="Value (e.g., $5M)"
                                        className="w-28"
                                    />
                                    <Input
                                        value={newMetric.change_percent}
                                        onChange={(e) => setNewMetric({ ...newMetric, change_percent: e.target.value })}
                                        placeholder="+%"
                                        className="w-20"
                                        type="number"
                                    />
                                    <Button type="button" variant="secondary" onClick={addMetric}>
                                        Add
                                    </Button>
                                </div>
                                {formData.metrics && formData.metrics.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {formData.metrics.map((metric, i) => (
                                            <Badge 
                                                key={i} 
                                                variant="secondary"
                                                className="px-3 py-1.5 cursor-pointer hover:bg-destructive/10"
                                                onClick={() => removeMetric(i)}
                                            >
                                                {metric.label}: {metric.value}
                                                {metric.change_percent && ` (+${metric.change_percent}%)`}
                                                <span className="ml-1">×</span>
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            {/* Testimonial */}
                            <div className="space-y-3">
                                <Label>Client Testimonial (optional)</Label>
                                <Textarea
                                    value={formData.testimonial_quote || ''}
                                    onChange={(e) => setFormData({ ...formData, testimonial_quote: e.target.value })}
                                    placeholder="What did the client say about working with you?"
                                    className="min-h-[80px]"
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <Input
                                        value={formData.testimonial_author || ''}
                                        onChange={(e) => setFormData({ ...formData, testimonial_author: e.target.value })}
                                        placeholder="Author name"
                                    />
                                    <Input
                                        value={formData.testimonial_role || ''}
                                        onChange={(e) => setFormData({ ...formData, testimonial_role: e.target.value })}
                                        placeholder="Author role (e.g., CEO)"
                                    />
                                </div>
                            </div>
                            
                            {/* Settings */}
                            <div className="flex items-center justify-between pt-4 border-t">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_public}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_public: checked })}
                                    />
                                    <Label>Public (visible on profile)</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_featured}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
                                    />
                                    <Label>Featured</Label>
                                </div>
                            </div>
                        </div>
                        
                        <DialogFooter>
                            <Button variant="secondary" onClick={() => setShowDialog(false)}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleSubmit} 
                                disabled={isPending || !formData.title || !formData.challenge || !formData.approach || !formData.outcome}
                            >
                                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {editingId ? 'Update' : 'Create'} Case Study
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
            
            {/* Case Studies List */}
            {caseStudies.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No case studies yet</h3>
                        <p className="text-muted-foreground text-center max-w-md mb-4">
                            Case studies help potential clients understand your experience and results. 
                            Add your first one to strengthen your profile.
                        </p>
                        <Button onClick={() => setShowDialog(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Your First Case Study
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {caseStudies.map((cs) => (
                        <Card key={cs.id} className={cn(cs.is_featured && 'border-amber-200 bg-amber-50/30')}>
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            {cs.is_featured && (
                                                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                                            )}
                                            <CardTitle className="text-lg">{cs.title}</CardTitle>
                                        </div>
                                        <CardDescription className="flex items-center gap-2">
                                            {cs.client_name && <span>{cs.client_name}</span>}
                                            {cs.client_industry && (
                                                <>
                                                    <span>•</span>
                                                    <span>{cs.client_industry}</span>
                                                </>
                                            )}
                                            {cs.engagement_type && (
                                                <Badge variant="outline" className="text-xs capitalize">
                                                    {cs.engagement_type}
                                                </Badge>
                                            )}
                                            {!cs.is_public && (
                                                <Badge variant="secondary" className="text-xs">
                                                    Private
                                                </Badge>
                                            )}
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => handleToggleFeatured(cs.id)}
                                        >
                                            <Star className={cn(
                                                "h-4 w-4",
                                                cs.is_featured && "fill-amber-500 text-amber-500"
                                            )} />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => handleEdit(cs)}
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => handleDelete(cs.id)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <p className="font-medium text-muted-foreground mb-1">Challenge</p>
                                        <p className="line-clamp-2">{cs.challenge}</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-muted-foreground mb-1">Approach</p>
                                        <p className="line-clamp-2">{cs.approach}</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-muted-foreground mb-1">Outcome</p>
                                        <p className="line-clamp-2">{cs.outcome}</p>
                                    </div>
                                </div>
                                
                                {cs.metrics && cs.metrics.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                                        {cs.metrics.map((metric, i) => (
                                            <div key={i} className="flex items-center gap-1 text-sm bg-muted rounded-md px-2 py-1">
                                                <TrendingUp className="h-3 w-3 text-green-600" />
                                                <span className="font-medium">{metric.value}</span>
                                                <span className="text-muted-foreground">{metric.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {cs.testimonial_quote && (
                                    <div className="bg-slate-50 rounded-lg p-3 text-sm">
                                        <Quote className="h-4 w-4 text-muted-foreground mb-1" />
                                        <p className="italic line-clamp-2">"{cs.testimonial_quote}"</p>
                                        {cs.testimonial_author && (
                                            <p className="text-muted-foreground text-xs mt-1">
                                                — {cs.testimonial_author}
                                                {cs.testimonial_role && `, ${cs.testimonial_role}`}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
