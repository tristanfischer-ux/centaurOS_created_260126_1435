// @ts-nocheck
'use client'

import { useState, useTransition, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { typography, spacing } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Loader2,
  Zap,
  Clock,
  HelpCircle,
  AlertCircle,
  ChevronDown,
  PanelRightOpen,
  Users,
} from 'lucide-react'
import { createNewRFQ } from '@/actions/rfq'
import { CreateRFQParams, RFQType, RFQ_CATEGORIES } from '@/types/rfq'
import { RFQFileUpload } from './RFQFileUpload'
import { CategoryFieldGroup, getCategoryGroup } from './CategoryFieldGroup'
import { SupplierPreviewPanel } from './SupplierPreviewPanel'
import { generateCompletenessChecks } from './CompletenessIndicator'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  path: string
  uploading?: boolean
  error?: string
}

interface RFQCreatorProps {
  // Optional pre-fill from context
  initialCategory?: string
  initialDescription?: string
  targetSupplierId?: string

  // UI options
  defaultPreviewOpen?: boolean // Desktop: true by default
  showPreviewToggle?: boolean // Whether to show the toggle button

  onSuccess?: (rfqId: string) => void
  onCancel?: () => void
  className?: string
}

export function RFQCreator({
  initialCategory = '',
  initialDescription = '',
  targetSupplierId,
  defaultPreviewOpen = true,
  showPreviewToggle = true,
  onSuccess,
  onCancel,
  className,
}: RFQCreatorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(defaultPreviewOpen)

  // Core form state
  const [title, setTitle] = useState('')
  const [rfqType, setRfqType] = useState<RFQType>('commodity')
  const [category, setCategory] = useState(initialCategory)
  const [description, setDescription] = useState(initialDescription)
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [deadline, setDeadline] = useState('')
  const [urgency, setUrgency] = useState<'urgent' | 'standard'>('standard')
  const [files, setFiles] = useState<UploadedFile[]>([])

  // Category-specific fields
  const [categoryFields, setCategoryFields] = useState({
    quantity: '',
    quantityUnit: 'pieces',
    material: '',
    customMaterial: '',
    dimensionL: '',
    dimensionW: '',
    dimensionH: '',
    dimensionUnit: 'mm',
    deliverySchedule: '',
    scopeOfWork: '',
    deliverables: '',
  })

  const handleCategoryFieldChange = useCallback((field: string, value: string) => {
    setCategoryFields((prev) => ({ ...prev, [field]: value }))
  }, [])

  // Generate completeness checks
  const completenessChecks = useMemo(
    () =>
      generateCompletenessChecks({
        title,
        category,
        rfqType,
        description,
        budgetMin,
        budgetMax,
        deadline,
        files: files.filter((f) => f.path && !f.error),
        quantity: categoryFields.quantity,
        material: categoryFields.material,
      }),
    [title, category, rfqType, description, budgetMin, budgetMax, deadline, files, categoryFields]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    if (!category) {
      setError('Please select a category')
      return
    }

    if (!description.trim() || description.trim().length < 20) {
      setError('Please provide a description (at least 20 characters)')
      return
    }

    // Check for files still uploading
    const uploadingFiles = files.filter((f) => f.uploading)
    if (uploadingFiles.length > 0) {
      setError('Please wait for all files to finish uploading')
      return
    }

    // Check for files with errors
    const errorFiles = files.filter((f) => f.error)
    if (errorFiles.length > 0) {
      setError('Please remove files with errors before submitting')
      return
    }

    startTransition(async () => {
      // Get successfully uploaded file paths
      const attachmentPaths = files.filter((f) => f.path && !f.error).map((f) => f.path)

      // Build specifications object
      const specs: Record<string, unknown> = {
        description: description.trim(),
      }

      if (attachmentPaths.length > 0) {
        specs.attachments = attachmentPaths
      }

      // Add category-specific fields
      const categoryGroup = getCategoryGroup(category)
      if (categoryGroup === 'physical_products') {
        if (categoryFields.quantity) specs.quantity = parseInt(categoryFields.quantity)
        if (categoryFields.quantityUnit) specs.unit = categoryFields.quantityUnit
        if (categoryFields.material && categoryFields.material !== 'Other (specify)') {
          specs.materials = [categoryFields.material]
        } else if (categoryFields.customMaterial) {
          specs.materials = [categoryFields.customMaterial]
        }
        if (categoryFields.dimensionL || categoryFields.dimensionW || categoryFields.dimensionH) {
          specs.dimensions = {
            length: categoryFields.dimensionL ? parseFloat(categoryFields.dimensionL) : undefined,
            width: categoryFields.dimensionW ? parseFloat(categoryFields.dimensionW) : undefined,
            height: categoryFields.dimensionH ? parseFloat(categoryFields.dimensionH) : undefined,
            unit: categoryFields.dimensionUnit,
          }
        }
      } else if (categoryGroup === 'materials_supplies') {
        if (categoryFields.quantity) specs.quantity = parseInt(categoryFields.quantity)
        if (categoryFields.quantityUnit) specs.unit = categoryFields.quantityUnit
        if (categoryFields.deliverySchedule) specs.deliverySchedule = categoryFields.deliverySchedule
      } else if (categoryGroup === 'services') {
        if (categoryFields.scopeOfWork) specs.scopeOfWork = categoryFields.scopeOfWork
        if (categoryFields.deliverables) specs.deliverables = categoryFields.deliverables
      }

      const params: CreateRFQParams = {
        title: title.trim(),
        rfq_type: rfqType,
        specifications: specs,
        budget_min: budgetMin ? parseFloat(budgetMin) : null,
        budget_max: budgetMax ? parseFloat(budgetMax) : null,
        deadline: deadline || null,
        category: category || null,
        urgency,
      }

      const result = await createNewRFQ(params)

      if (result.error) {
        setError(result.error)
        return
      }

      if (result.data?.id) {
        if (onSuccess) {
          onSuccess(result.data.id)
        } else {
          router.push(`/rfq/${result.data.id}`)
        }
      }
    })
  }

  // Preview form data for the supplier panel
  const previewFormData = {
    title,
    rfqType,
    category,
    description,
    budgetMin,
    budgetMax,
    deadline,
    urgency,
    files: files.filter((f) => !f.error),
    quantity: categoryFields.quantity,
    quantityUnit: categoryFields.quantityUnit,
    material: categoryFields.material,
    customMaterial: categoryFields.customMaterial,
  }

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit} className={cn('h-full', className)}>
        <div className="flex h-full">
          {/* Left Panel: Form */}
          <div
            className={cn(
              'flex-1 overflow-y-auto p-6 space-y-6',
              showPreview ? 'lg:border-r' : ''
            )}
          >
            {/* Header with Orange Accent Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="min-w-0 flex-1">
                <div className={typography.pageHeader}>
                  <div className={typography.pageHeaderAccent} />
                  <h1 className={typography.h1}>
                    Create Request for Quote
                  </h1>
                </div>
                <p className={typography.pageSubtitle}>
                  Describe what you need and suppliers will compete to fulfill your request
                </p>
              </div>
              {showPreviewToggle && !showPreview && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPreview(true)}
                  className="hidden lg:flex"
                >
                  <PanelRightOpen className="w-4 h-4 mr-2" />
                  Show Preview
                </Button>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., 500 units of aluminum brackets"
                disabled={isPending}
                maxLength={200}
              />
            </div>

            {/* Category & RFQ Type Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={setCategory} disabled={isPending}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {RFQ_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* RFQ Type */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>RFQ Type *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">How the winner is determined when suppliers respond.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setRfqType('commodity')}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-all text-xs',
                          rfqType === 'commodity'
                            ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                            : 'border-transparent bg-muted/50 hover:bg-muted'
                        )}
                        disabled={isPending}
                      >
                        <Zap className="w-5 h-5" />
                        <span className="font-medium">Commodity</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">First Click Wins</p>
                      <p className="text-xs">First supplier to accept wins automatically.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setRfqType('custom')}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-all text-xs',
                          rfqType === 'custom'
                            ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                            : 'border-transparent bg-muted/50 hover:bg-muted'
                        )}
                        disabled={isPending}
                      >
                        <Clock className="w-5 h-5" />
                        <span className="font-medium">Custom</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">2hr Priority Hold</p>
                      <p className="text-xs">First supplier gets 2-hour window. You confirm or release.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setRfqType('service')}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-all text-xs',
                          rfqType === 'service'
                            ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                            : 'border-transparent bg-muted/50 hover:bg-muted'
                        )}
                        disabled={isPending}
                      >
                        <Users className="w-5 h-5" />
                        <span className="font-medium">Service</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">Review All Quotes</p>
                      <p className="text-xs">Collect all responses and manually select winner.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Specifications *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your requirements in detail. Include technical specs, quality standards, and any special requirements..."
                rows={4}
                disabled={isPending}
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground text-right">{description.length}/5000</p>
            </div>

            {/* Category-specific fields */}
            {category && (
              <CategoryFieldGroup
                category={category}
                formData={categoryFields}
                onChange={handleCategoryFieldChange}
                disabled={isPending}
              />
            )}

            {/* Files */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors group">
                <span>
                  Files & Documents
                  {files.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-2">
                      ({files.length} attached)
                    </span>
                  )}
                </span>
                <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <RFQFileUpload
                  files={files}
                  onFilesChange={setFiles}
                  maxFiles={10}
                  maxSizeMB={25}
                  disabled={isPending}
                />
              </CollapsibleContent>
            </Collapsible>

            {/* Commercial Terms */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors group">
                <span>Commercial Terms</span>
                <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                {/* Budget */}
                <div className="space-y-2">
                  <Label>Budget Range (GBP)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="number"
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(e.target.value)}
                      placeholder="Min"
                      min={0}
                      step={0.01}
                      disabled={isPending}
                    />
                    <Input
                      type="number"
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(e.target.value)}
                      placeholder="Max"
                      min={0}
                      step={0.01}
                      disabled={isPending}
                    />
                  </div>
                </div>

                {/* Deadline */}
                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline</Label>
                  <Input
                    id="deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    disabled={isPending}
                  />
                </div>

                {/* Urgency */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Urgency</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          <strong>Standard:</strong> Broadcasts at 9am in each supplier&apos;s timezone.
                        </p>
                        <p className="text-xs mt-1">
                          <strong>Urgent:</strong> Race starts in 5 minutes.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setUrgency('standard')}
                      className={cn(
                        'flex items-center justify-center gap-2 p-3.5 rounded-xl border transition-all text-sm font-medium',
                        urgency === 'standard'
                          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                          : 'border-transparent bg-muted/50 hover:bg-muted'
                      )}
                      disabled={isPending}
                    >
                      <Clock className="w-4 h-4" />
                      Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setUrgency('urgent')}
                      className={cn(
                        'flex items-center justify-center gap-2 p-3.5 rounded-xl border transition-all text-sm font-medium',
                        urgency === 'urgent'
                          ? 'border-status-warning bg-status-warning-light text-status-warning-dark shadow-sm ring-1 ring-status-warning/20'
                          : 'border-transparent bg-muted/50 hover:bg-muted'
                      )}
                      disabled={isPending}
                    >
                      <Zap className="w-4 h-4" />
                      Urgent
                    </button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Error display */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              {onCancel ? (
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
                  Cancel
                </Button>
              ) : (
                <div />
              )}
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create RFQ
              </Button>
            </div>
          </div>

          {/* Right Panel: Preview (Desktop only) */}
          {showPreview && (
            <div className="hidden lg:block w-[400px] p-6 bg-muted/30 overflow-hidden">
              <SupplierPreviewPanel
                formData={previewFormData}
                completenessChecks={completenessChecks}
                onCollapse={() => setShowPreview(false)}
              />
            </div>
          )}
        </div>
      </form>
    </TooltipProvider>
  )
}
