'use client'

import { useState, useTransition, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Loader2,
  Zap,
  Clock,
  HelpCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Users,
  FileText,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { createNewRFQ, updateMyRFQ } from '@/actions/rfq'
import { CreateRFQParams, RFQType, RFQ_CATEGORIES } from '@/types/rfq'
import { RFQFileUpload } from './RFQFileUpload'
import { CategoryFieldGroup, getCategoryGroup } from './CategoryFieldGroup'
import { SupplierPreviewPanel } from './SupplierPreviewPanel'
import { CompletenessIndicator, generateCompletenessChecks } from './CompletenessIndicator'
import { RFQTechniqueSelector } from './RFQTechniqueSelector'
import { RFQTemplatePicker } from './RFQTemplatePicker'
import { TextareaWithSpeech } from '@/components/ui/textarea-with-speech'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  path: string
  uploading?: boolean
  error?: string
}

interface CategoryFieldState {
  quantity: string
  quantityUnit: string
  material: string
  customMaterial: string
  dimensionL: string
  dimensionW: string
  dimensionH: string
  dimensionUnit: string
  deliverySchedule: string
  scopeOfWork: string
  deliverables: string
}

const DEFAULT_CATEGORY_FIELDS: CategoryFieldState = {
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
}

export interface RFQWizardProps {
  /** When set, the wizard updates an existing RFQ instead of creating a new one */
  editRfqId?: string
  initialTitle?: string
  initialCategory?: string
  initialDescription?: string
  initialRfqType?: RFQType
  initialBudgetMin?: string
  initialBudgetMax?: string
  initialDeadline?: string
  initialCategoryFields?: CategoryFieldState
  initialFiles?: UploadedFile[]
  targetSupplierId?: string
  onSuccess?: (rfqId: string) => void
  onCancel?: () => void
  className?: string
}

const STEPS = [
  { key: 'start', title: 'Start', number: 1 },
  { key: 'specs', title: 'Specs & Files', number: 2 },
  { key: 'commercial', title: 'Commercial', number: 3 },
  { key: 'review', title: 'Review & Send', number: 4 },
] as const

type StepKey = (typeof STEPS)[number]['key']

export function RFQWizard({
  editRfqId,
  initialTitle = '',
  initialCategory = '',
  initialDescription = '',
  initialRfqType,
  initialBudgetMin = '',
  initialBudgetMax = '',
  initialDeadline = '',
  initialCategoryFields,
  initialFiles,
  targetSupplierId,
  onSuccess,
  onCancel,
  className,
}: RFQWizardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<StepKey>(initialRfqType ? 'specs' : 'start')

  // Form state
  const [title, setTitle] = useState(initialTitle)
  const [rfqType, setRfqType] = useState<RFQType | ''>(initialRfqType || '')
  const [category, setCategory] = useState(initialCategory)
  const [description, setDescription] = useState(initialDescription)
  const [budgetMin, setBudgetMin] = useState(initialBudgetMin)
  const [budgetMax, setBudgetMax] = useState(initialBudgetMax)
  const [deadline, setDeadline] = useState(initialDeadline)
  const [urgency, setUrgency] = useState<'urgent' | 'standard'>('standard')
  const [files, setFiles] = useState<UploadedFile[]>(initialFiles || [])
  const [selectedTechniqueId, setSelectedTechniqueId] = useState<string | null>(null)
  const [categoryFields, setCategoryFields] = useState<CategoryFieldState>(
    initialCategoryFields || DEFAULT_CATEGORY_FIELDS
  )

  const handleCategoryFieldChange = useCallback((field: string, value: string) => {
    setCategoryFields((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleTemplateSelect = useCallback(
    (template: { title: string; category: string; description: string; rfqType: string }) => {
      setTitle(template.title)
      setCategory(template.category)
      setDescription(template.description)
      setRfqType(template.rfqType as RFQType)
      setCurrentStep('specs')
    },
    []
  )

  // Completeness checks
  const completenessChecks = useMemo(
    () =>
      generateCompletenessChecks({
        title,
        category,
        rfqType: rfqType || '',
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

  // Step validation
  const canProceedFromStep = (step: StepKey): boolean => {
    switch (step) {
      case 'start':
        return !!rfqType
      case 'specs':
        return (
          title.trim().length >= 3 &&
          !!category &&
          description.trim().length >= 20
        )
      case 'commercial':
        return true // All optional
      case 'review':
        return files.filter((f) => f.uploading).length === 0
      default:
        return false
    }
  }

  const getStepIndex = (step: StepKey) => STEPS.findIndex((s) => s.key === step)

  const goToStep = (step: StepKey) => {
    setError(null)
    setCurrentStep(step)
  }

  const goNext = () => {
    const idx = getStepIndex(currentStep)
    if (idx < STEPS.length - 1) {
      goToStep(STEPS[idx + 1].key)
    }
  }

  const goBack = () => {
    const idx = getStepIndex(currentStep)
    if (idx > 0) {
      goToStep(STEPS[idx - 1].key)
    }
  }

  const handleSubmit = () => {
    if (isPending) return // Prevent double-submission
    setError(null)

    if (!rfqType) {
      setError('Please select an RFQ type')
      setCurrentStep('start')
      return
    }

    // Re-validate step 2 fields in case user navigated back and broke them
    if (title.trim().length < 3 || !category || description.trim().length < 20) {
      setError('Please go back and complete the required fields')
      setCurrentStep('specs')
      return
    }

    const uploadingFiles = files.filter((f) => f.uploading)
    if (uploadingFiles.length > 0) {
      setError('Please wait for all files to finish uploading')
      return
    }

    if (budgetMin && (!Number.isFinite(parseFloat(budgetMin)) || parseFloat(budgetMin) < 0)) {
      setError('Please enter a valid budget minimum')
      return
    }
    if (budgetMax && (!Number.isFinite(parseFloat(budgetMax)) || parseFloat(budgetMax) < 0)) {
      setError('Please enter a valid budget maximum')
      return
    }
    if (budgetMin && budgetMax && parseFloat(budgetMin) > parseFloat(budgetMax)) {
      setError('Budget minimum cannot exceed maximum')
      return
    }

    startTransition(async () => {
      const attachmentPaths = files.filter((f) => f.path && !f.error).map((f) => f.path)

      const specs: Record<string, unknown> = {
        description: description.trim(),
      }

      if (attachmentPaths.length > 0) {
        specs.attachments = attachmentPaths
      }

      if (selectedTechniqueId) {
        specs.manufacturing_technique = selectedTechniqueId
      }

      // Add category-specific fields
      const categoryGroup = getCategoryGroup(category)
      if (categoryGroup === 'physical_products') {
        const parsedQty = parseInt(categoryFields.quantity, 10)
        if (!isNaN(parsedQty)) specs.quantity = parsedQty
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
        const parsedQty = parseInt(categoryFields.quantity, 10)
        if (!isNaN(parsedQty)) specs.quantity = parsedQty
        if (categoryFields.quantityUnit) specs.unit = categoryFields.quantityUnit
        if (categoryFields.deliverySchedule) specs.deliverySchedule = categoryFields.deliverySchedule
      } else if (categoryGroup === 'services') {
        if (categoryFields.scopeOfWork) specs.scopeOfWork = categoryFields.scopeOfWork
        if (categoryFields.deliverables) specs.deliverables = categoryFields.deliverables
      }

      const parsedBudgetMin = budgetMin ? parseFloat(budgetMin) : null
      const parsedBudgetMax = budgetMax ? parseFloat(budgetMax) : null

      if (editRfqId) {
        // Update existing RFQ
        const updateResult = await updateMyRFQ(editRfqId, {
          title: title.trim(),
          specifications: specs,
          budget_min: isNaN(parsedBudgetMin as number) ? null : parsedBudgetMin,
          budget_max: isNaN(parsedBudgetMax as number) ? null : parsedBudgetMax,
          deadline: deadline || null,
          category: category || null,
          urgency,
        })

        if (updateResult.error) {
          setError(updateResult.error)
          return
        }

        if (onSuccess) {
          onSuccess(editRfqId)
        } else {
          router.push(`/rfq/${editRfqId}`)
        }
      } else {
        // Create new RFQ
        const params: CreateRFQParams = {
          title: title.trim(),
          rfq_type: rfqType as RFQType,
          specifications: specs,
          budget_min: isNaN(parsedBudgetMin as number) ? null : parsedBudgetMin,
          budget_max: isNaN(parsedBudgetMax as number) ? null : parsedBudgetMax,
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
      }
    })
  }

  // Preview form data
  const previewFormData = {
    title,
    rfqType: rfqType || 'commodity',
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
      <div className={cn('h-full flex flex-col', className)}>
        {/* Progress indicator */}
        <div className="px-6 pt-6 pb-4 border-b">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>{editRfqId ? 'Edit Request for Quote' : 'Create Request for Quote'}</h1>
          </div>
          <div className="flex items-center gap-2 mt-4">
            {STEPS.map((step, idx) => {
              const isActive = step.key === currentStep
              const isPast = getStepIndex(currentStep) > idx
              return (
                <div key={step.key} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      // Allow clicking back to completed steps
                      if (isPast) goToStep(step.key)
                    }}
                    className={cn(
                      'flex items-center gap-2 text-sm transition-colors',
                      isActive && 'text-foreground font-semibold',
                      isPast && 'text-status-success cursor-pointer',
                      !isActive && !isPast && 'text-muted-foreground'
                    )}
                    disabled={!isPast && !isActive}
                  >
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors',
                        isActive && 'border-foreground bg-foreground text-background',
                        isPast && 'border-status-success bg-status-success-light text-status-success',
                        !isActive && !isPast && 'border-muted bg-muted text-muted-foreground'
                      )}
                    >
                      {isPast ? <CheckCircle2 className="h-4 w-4" /> : step.number}
                    </div>
                    <span className="hidden sm:inline">{step.title}</span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 mx-2',
                        isPast ? 'bg-status-success' : 'bg-muted'
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex h-full">
            {/* Main form area */}
            <div className="flex-1 p-6 space-y-6">
              {/* Step 1: Start */}
              {currentStep === 'start' && (
                <div className="space-y-8">
                  {/* Template picker */}
                  <RFQTemplatePicker
                    onSelect={handleTemplateSelect}
                  />

                  {/* Or start from scratch */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-background px-4 text-sm text-muted-foreground">
                        or start from scratch
                      </span>
                    </div>
                  </div>

                  {/* RFQ Type selector */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">How should the winner be selected?</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setRfqType('commodity')}
                            className={cn(
                              'flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all text-sm',
                              rfqType === 'commodity'
                                ? 'border-foreground bg-muted shadow-sm'
                                : 'border-transparent bg-muted/50 hover:bg-muted'
                            )}
                          >
                            <Zap className="w-6 h-6" />
                            <span className="font-semibold">Commodity</span>
                            <span className="text-xs text-muted-foreground text-center">First supplier wins</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>First supplier to accept wins automatically</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setRfqType('custom')}
                            className={cn(
                              'flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all text-sm',
                              rfqType === 'custom'
                                ? 'border-foreground bg-muted shadow-sm'
                                : 'border-transparent bg-muted/50 hover:bg-muted'
                            )}
                          >
                            <Clock className="w-6 h-6" />
                            <span className="font-semibold">Custom</span>
                            <span className="text-xs text-muted-foreground text-center">2hr priority hold</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>First supplier gets 2-hour window for you to confirm</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setRfqType('service')}
                            className={cn(
                              'flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all text-sm',
                              rfqType === 'service'
                                ? 'border-foreground bg-muted shadow-sm'
                                : 'border-transparent bg-muted/50 hover:bg-muted'
                            )}
                          >
                            <Users className="w-6 h-6" />
                            <span className="font-semibold">Service</span>
                            <span className="text-xs text-muted-foreground text-center">Review all quotes</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Collect all responses and manually select winner</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Specs & Files */}
              {currentStep === 'specs' && (
                <div className="space-y-6">
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
                      autoFocus
                    />
                  </div>

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

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Specifications *</Label>
                    <TextareaWithSpeech
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

                  {/* Manufacturing Technique */}
                  <RFQTechniqueSelector
                    selectedTechniqueId={selectedTechniqueId}
                    onSelect={setSelectedTechniqueId}
                    disabled={isPending}
                  />

                  {/* Files */}
                  <div className="space-y-2">
                    <Label>Files & Documents</Label>
                    <RFQFileUpload
                      files={files}
                      onFilesChange={setFiles}
                      maxFiles={10}
                      maxSizeMB={25}
                      disabled={isPending}
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Commercial */}
              {currentStep === 'commercial' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold">Commercial Terms</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      All fields are optional but help suppliers quote more accurately
                    </p>
                  </div>

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
                          'flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 transition-all text-sm font-medium',
                          urgency === 'standard'
                            ? 'border-foreground bg-muted shadow-sm'
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
                          'flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 transition-all text-sm font-medium',
                          urgency === 'urgent'
                            ? 'border-status-warning bg-status-warning-light text-status-warning-dark shadow-sm'
                            : 'border-transparent bg-muted/50 hover:bg-muted'
                        )}
                        disabled={isPending}
                      >
                        <Zap className="w-4 h-4" />
                        Urgent
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Review & Send */}
              {currentStep === 'review' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold">Review & Send</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Check everything looks good before sending to suppliers
                    </p>
                  </div>

                  {/* Summary card */}
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Title</span>
                        <p className="font-medium">{title || 'Not set'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type</span>
                        <p className="font-medium capitalize">{rfqType || 'Not set'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Category</span>
                        <p className="font-medium">{category || 'Not set'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Urgency</span>
                        <p className="font-medium capitalize">{urgency}</p>
                      </div>
                      {(budgetMin || budgetMax) && (
                        <div>
                          <span className="text-muted-foreground">Budget</span>
                          <p className="font-medium">
                            {budgetMin && budgetMax
                              ? `£${parseFloat(budgetMin).toLocaleString()} - £${parseFloat(budgetMax).toLocaleString()}`
                              : budgetMin
                                ? `From £${parseFloat(budgetMin).toLocaleString()}`
                                : `Up to £${parseFloat(budgetMax).toLocaleString()}`}
                          </p>
                        </div>
                      )}
                      {deadline && (
                        <div>
                          <span className="text-muted-foreground">Deadline</span>
                          <p className="font-medium">{deadline}</p>
                        </div>
                      )}
                    </div>

                    {description && (
                      <div>
                        <span className="text-sm text-muted-foreground">Specifications</span>
                        <p className="text-sm mt-1 whitespace-pre-wrap line-clamp-4">{description}</p>
                      </div>
                    )}

                    {files.filter((f) => f.path && !f.error).length > 0 && (
                      <div>
                        <span className="text-sm text-muted-foreground">Files</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {files
                            .filter((f) => f.path && !f.error)
                            .map((f) => (
                              <span key={f.id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs">
                                <FileText className="w-3 h-3" />
                                {f.name}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Completeness indicator */}
                  <CompletenessIndicator checks={completenessChecks} />
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>

            {/* Right Panel: Preview (Desktop only, steps 2+) */}
            {currentStep !== 'start' && (
              <div className="hidden lg:block w-[380px] p-6 bg-muted/30 border-l overflow-y-auto">
                <SupplierPreviewPanel
                  formData={previewFormData}
                  completenessChecks={completenessChecks}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-background">
          <div>
            {currentStep === 'start' ? (
              onCancel ? (
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
                  Cancel
                </Button>
              ) : (
                <div />
              )
            ) : (
              <Button type="button" variant="secondary" onClick={goBack} disabled={isPending}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
          </div>

          <div>
            {currentStep === 'review' ? (
              <Button
                onClick={handleSubmit}
                disabled={isPending || !canProceedFromStep('review')}
              >
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Sparkles className="w-4 h-4 mr-2" />
                {editRfqId ? 'Save Changes' : 'Send RFQ'}
              </Button>
            ) : (
              <Button
                onClick={goNext}
                disabled={!canProceedFromStep(currentStep)}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
