'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  Building2,
  Users,
  Target,
  TrendingUp,
  FileText,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { createPitchPrepRequest } from '@/actions/pitch-prep'
import {
  CreatePitchPrepParams,
  FundingStage,
  LegalStructure,
  PitchPrepServiceType,
  InvestorType,
  FUNDING_STAGES,
  LEGAL_STRUCTURES,
  PITCH_PREP_SERVICES,
  INVESTOR_TYPES,
  PITCH_PREP_SERVICE_DESCRIPTIONS,
} from '@/types/pitch-prep'
import { toast } from 'sonner'

interface PitchPrepFormProps {
  onSuccess?: (id: string) => void
  onCancel?: () => void
  className?: string
}

type FormStep = 'company' | 'product' | 'traction' | 'services' | 'review'

const STEPS: { id: FormStep; title: string; icon: React.ElementType }[] = [
  { id: 'company', title: 'Company', icon: Building2 },
  { id: 'product', title: 'Product', icon: Target },
  { id: 'traction', title: 'Traction', icon: TrendingUp },
  { id: 'services', title: 'Services', icon: FileText },
  { id: 'review', title: 'Review', icon: CheckCircle2 },
]

export function PitchPrepForm({ onSuccess, onCancel, className }: PitchPrepFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentStep, setCurrentStep] = useState<FormStep>('company')
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<Partial<CreatePitchPrepParams>>({
    company_name: '',
    company_website: '',
    headquarters: '',
    legal_structure: undefined,
    founder_count: undefined,
    team_size: undefined,
    product_description: '',
    problem_solved: '',
    target_market: '',
    competitive_landscape: '',
    stage: 'Seed',
    has_revenue: false,
    traction_summary: '',
    amount_seeking: '',
    use_of_funds: '',
    timeline: '',
    services_requested: [],
    target_investor_types: [],
    specific_questions: '',
  })

  const updateField = <K extends keyof CreatePitchPrepParams>(
    field: K,
    value: CreatePitchPrepParams[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (error) setError(null)
  }

  const toggleService = (service: PitchPrepServiceType) => {
    const current = formData.services_requested || []
    const updated = current.includes(service)
      ? current.filter((s) => s !== service)
      : [...current, service]
    updateField('services_requested', updated)
  }

  const toggleInvestorType = (type: InvestorType) => {
    const current = formData.target_investor_types || []
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type]
    updateField('target_investor_types', updated)
  }

  const validateStep = (step: FormStep): boolean => {
    switch (step) {
      case 'company':
        if (!formData.company_name?.trim()) {
          setError('Company name is required')
          return false
        }
        return true
      case 'product':
        if (!formData.product_description?.trim()) {
          setError('Product description is required')
          return false
        }
        return true
      case 'traction':
        if (!formData.stage) {
          setError('Please select your funding stage')
          return false
        }
        return true
      case 'services':
        if (!formData.services_requested?.length) {
          setError('Please select at least one service')
          return false
        }
        return true
      default:
        return true
    }
  }

  const goToNextStep = () => {
    if (!validateStep(currentStep)) return
    
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].id)
      setError(null)
    }
  }

  const goToPrevStep = () => {
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id)
      setError(null)
    }
  }

  const handleSubmit = () => {
    if (!validateStep('services')) return

    startTransition(async () => {
      const result = await createPitchPrepRequest({
        company_name: formData.company_name!,
        product_description: formData.product_description!,
        stage: formData.stage as FundingStage,
        has_revenue: formData.has_revenue || false,
        services_requested: formData.services_requested as PitchPrepServiceType[],
        company_website: formData.company_website,
        legal_structure: formData.legal_structure as LegalStructure | undefined,
        headquarters: formData.headquarters,
        founder_count: formData.founder_count,
        team_size: formData.team_size,
        problem_solved: formData.problem_solved,
        target_market: formData.target_market,
        competitive_landscape: formData.competitive_landscape,
        traction_summary: formData.traction_summary,
        amount_seeking: formData.amount_seeking,
        use_of_funds: formData.use_of_funds,
        timeline: formData.timeline,
        target_investor_types: formData.target_investor_types as InvestorType[] | undefined,
        specific_questions: formData.specific_questions,
      })

      if (result.error) {
        setError(result.error)
        toast.error(result.error)
        return
      }

      if (result.data?.id) {
        toast.success('Pitch prep request submitted!')
        if (onSuccess) {
          onSuccess(result.data.id)
        } else {
          router.push(`/pitch-prep/${result.data.id}`)
        }
      }
    })
  }

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)

  return (
    <div className={cn('space-y-6', className)}>
      {/* Legal Disclaimer */}
      <Alert className="bg-status-info-light border-status-info">
        <Info className="h-4 w-4 text-status-info" />
        <AlertDescription className="text-status-info-dark">
          <strong>Preparation Service Only:</strong> CentaurOS helps you prepare for investor conversations. 
          We do not provide investment advice or facilitate securities transactions. 
          All investment discussions happen directly between you and investors off-platform.
        </AlertDescription>
      </Alert>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon
          const isActive = step.id === currentStep
          const isCompleted = index < currentStepIndex
          
          return (
            <div key={step.id} className="flex items-center">
              <button
                type="button"
                onClick={() => {
                  if (index < currentStepIndex) {
                    setCurrentStep(step.id)
                  }
                }}
                disabled={index > currentStepIndex}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg transition-all',
                  isActive && 'bg-accent text-accent-foreground',
                  isCompleted && 'text-status-success cursor-pointer hover:bg-muted',
                  !isActive && !isCompleted && 'text-muted-foreground'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center',
                    isActive && 'bg-accent-foreground/10',
                    isCompleted && 'bg-status-success-light'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-status-success" />
                  ) : (
                    <StepIcon className="h-4 w-4" />
                  )}
                </div>
                <span className="hidden sm:inline text-sm font-medium">{step.title}</span>
              </button>
              {index < STEPS.length - 1 && (
                <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground hidden sm:block" />
              )}
            </div>
          )
        })}
      </div>

      {/* Form Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStepIndex].title}</CardTitle>
          <CardDescription>
            {currentStep === 'company' && 'Tell us about your company'}
            {currentStep === 'product' && 'Describe your product and market'}
            {currentStep === 'traction' && 'Share your current traction and stage'}
            {currentStep === 'services' && 'Select the services you need'}
            {currentStep === 'review' && 'Review your submission'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Company */}
          {currentStep === 'company' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name || ''}
                    onChange={(e) => updateField('company_name', e.target.value)}
                    placeholder="Acme Corp"
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_website">Website</Label>
                  <Input
                    id="company_website"
                    value={formData.company_website || ''}
                    onChange={(e) => updateField('company_website', e.target.value)}
                    placeholder="https://acme.com"
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="headquarters">Headquarters</Label>
                  <Input
                    id="headquarters"
                    value={formData.headquarters || ''}
                    onChange={(e) => updateField('headquarters', e.target.value)}
                    placeholder="London, UK"
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legal_structure">Legal Structure</Label>
                  <Select
                    value={formData.legal_structure || ''}
                    onValueChange={(v) => updateField('legal_structure', v as LegalStructure)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="legal_structure">
                      <SelectValue placeholder="Select structure" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEGAL_STRUCTURES.map((structure) => (
                        <SelectItem key={structure} value={structure}>
                          {structure}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="founder_count">Number of Founders</Label>
                  <Input
                    id="founder_count"
                    type="number"
                    min={1}
                    value={formData.founder_count || ''}
                    onChange={(e) => updateField('founder_count', parseInt(e.target.value) || undefined)}
                    placeholder="2"
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team_size">Total Team Size</Label>
                  <Input
                    id="team_size"
                    type="number"
                    min={1}
                    value={formData.team_size || ''}
                    onChange={(e) => updateField('team_size', parseInt(e.target.value) || undefined)}
                    placeholder="5"
                    disabled={isPending}
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 2: Product */}
          {currentStep === 'product' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="product_description">Product Description *</Label>
                <Textarea
                  id="product_description"
                  value={formData.product_description || ''}
                  onChange={(e) => updateField('product_description', e.target.value)}
                  placeholder="Describe what your company does and what product/service you offer..."
                  rows={4}
                  disabled={isPending}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {(formData.product_description || '').length}/2000
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="problem_solved">Problem You Solve</Label>
                <Textarea
                  id="problem_solved"
                  value={formData.problem_solved || ''}
                  onChange={(e) => updateField('problem_solved', e.target.value)}
                  placeholder="What problem does your product solve? Why does it matter?"
                  rows={3}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="target_market">Target Market</Label>
                <Textarea
                  id="target_market"
                  value={formData.target_market || ''}
                  onChange={(e) => updateField('target_market', e.target.value)}
                  placeholder="Who are your customers? What's your TAM/SAM/SOM?"
                  rows={2}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="competitive_landscape">Competitive Landscape</Label>
                <Textarea
                  id="competitive_landscape"
                  value={formData.competitive_landscape || ''}
                  onChange={(e) => updateField('competitive_landscape', e.target.value)}
                  placeholder="Who are your competitors? What's your differentiation?"
                  rows={2}
                  disabled={isPending}
                />
              </div>
            </>
          )}

          {/* Step 3: Traction */}
          {currentStep === 'traction' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stage">Funding Stage *</Label>
                  <Select
                    value={formData.stage || ''}
                    onValueChange={(v) => updateField('stage', v as FundingStage)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="stage">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {FUNDING_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Revenue Status</Label>
                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                      id="has_revenue"
                      checked={formData.has_revenue || false}
                      onCheckedChange={(checked) => updateField('has_revenue', checked === true)}
                      disabled={isPending}
                    />
                    <label
                      htmlFor="has_revenue"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Company has revenue
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="traction_summary">Traction Summary</Label>
                <Textarea
                  id="traction_summary"
                  value={formData.traction_summary || ''}
                  onChange={(e) => updateField('traction_summary', e.target.value)}
                  placeholder="Key metrics: ARR, MRR, users, growth rate, notable customers..."
                  rows={3}
                  disabled={isPending}
                />
              </div>

              <div className="border-t pt-4 mt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  <strong>Fundraising Context</strong> (informational only - helps us match you with the right preparation services)
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount_seeking">Amount Seeking</Label>
                    <Input
                      id="amount_seeking"
                      value={formData.amount_seeking || ''}
                      onChange={(e) => updateField('amount_seeking', e.target.value)}
                      placeholder="e.g., £500K-£1M"
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeline">Timeline</Label>
                    <Input
                      id="timeline"
                      value={formData.timeline || ''}
                      onChange={(e) => updateField('timeline', e.target.value)}
                      placeholder="e.g., Q2 2026"
                      disabled={isPending}
                    />
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  <Label htmlFor="use_of_funds">Use of Funds</Label>
                  <Textarea
                    id="use_of_funds"
                    value={formData.use_of_funds || ''}
                    onChange={(e) => updateField('use_of_funds', e.target.value)}
                    placeholder="How do you plan to use the funding?"
                    rows={2}
                    disabled={isPending}
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 4: Services */}
          {currentStep === 'services' && (
            <>
              <div className="space-y-4">
                <Label>Select Services You Need *</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PITCH_PREP_SERVICES.map((service) => {
                    const isSelected = formData.services_requested?.includes(service)
                    return (
                      <button
                        key={service}
                        type="button"
                        onClick={() => toggleService(service)}
                        disabled={isPending}
                        className={cn(
                          'flex flex-col items-start p-4 rounded-lg border text-left transition-all',
                          isSelected
                            ? 'border-accent bg-accent/10 ring-1 ring-accent'
                            : 'border-muted hover:border-accent/50 hover:bg-muted/50'
                        )}
                      >
                        <span className="font-medium">{service}</span>
                        <span className="text-xs text-muted-foreground mt-1">
                          {PITCH_PREP_SERVICE_DESCRIPTIONS[service]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <Label>Target Investor Types (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {INVESTOR_TYPES.map((type) => {
                    const isSelected = formData.target_investor_types?.includes(type)
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleInvestorType(type)}
                        disabled={isPending}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-sm transition-all',
                          isSelected
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {type}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="specific_questions">Specific Questions or Areas to Focus On</Label>
                <Textarea
                  id="specific_questions"
                  value={formData.specific_questions || ''}
                  onChange={(e) => updateField('specific_questions', e.target.value)}
                  placeholder="Any specific areas you want help with? Questions you want to prepare for?"
                  rows={3}
                  disabled={isPending}
                />
              </div>
            </>
          )}

          {/* Step 5: Review */}
          {currentStep === 'review' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Company</h4>
                  <p className="font-semibold">{formData.company_name}</p>
                  {formData.company_website && (
                    <p className="text-sm text-muted-foreground">{formData.company_website}</p>
                  )}
                  {formData.headquarters && (
                    <p className="text-sm text-muted-foreground">{formData.headquarters}</p>
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Stage</h4>
                  <Badge variant="secondary">{formData.stage}</Badge>
                  {formData.has_revenue && (
                    <Badge variant="success" className="ml-2">Has Revenue</Badge>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">Product Description</h4>
                <p className="text-sm">{formData.product_description}</p>
              </div>

              {formData.traction_summary && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Traction</h4>
                  <p className="text-sm">{formData.traction_summary}</p>
                </div>
              )}

              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">Services Requested</h4>
                <div className="flex flex-wrap gap-2">
                  {formData.services_requested?.map((service) => (
                    <Badge key={service} variant="default">{service}</Badge>
                  ))}
                </div>
              </div>

              {formData.target_investor_types && formData.target_investor_types.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Target Investors</h4>
                  <div className="flex flex-wrap gap-2">
                    {formData.target_investor_types.map((type) => (
                      <Badge key={type} variant="secondary">{type}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {(formData.amount_seeking || formData.timeline) && (
                <div className="grid grid-cols-2 gap-4">
                  {formData.amount_seeking && (
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">Amount Seeking</h4>
                      <p className="text-sm">{formData.amount_seeking}</p>
                    </div>
                  )}
                  {formData.timeline && (
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">Timeline</h4>
                      <p className="text-sm">{formData.timeline}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <div>
          {currentStepIndex > 0 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={goToPrevStep}
              disabled={isPending}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          ) : onCancel ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isPending}
            >
              Cancel
            </Button>
          ) : (
            <div />
          )}
        </div>
        <div>
          {currentStep === 'review' ? (
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Request
            </Button>
          ) : (
            <Button onClick={goToNextStep} disabled={isPending}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
