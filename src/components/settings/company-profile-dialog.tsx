'use client'

/**
 * @file company-profile-dialog.tsx
 * 
 * @description Multi-step dialog for capturing structured company profile data
 * (size, revenue, funding, business model). Data feeds the AI Context Builder
 * to improve recommendation relevance across advisory, marketplace, and workflows.
 * 
 * @component CompanyProfileDialog
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { InputWithSpeech } from '@/components/ui/input-with-speech'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { TextareaWithSpeech } from '@/components/ui/textarea-with-speech'
import {
  Building2,
  Users,
  TrendingUp,
  BadgePoundSterling,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Swords,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateCompanyProfile } from '@/actions/foundry'
import type {
  CompanyProfile,
  EmployeeCount,
  RevenueRange,
  FundingStatus,
  BusinessModel,
  Sector,
} from '@/types/foundry'
import {
  EMPLOYEE_COUNT_LABELS,
  REVENUE_RANGE_LABELS,
  FUNDING_STATUS_LABELS,
  BUSINESS_MODEL_LABELS,
  SECTOR_LABELS,
} from '@/types/foundry'
import { toast } from 'sonner'

interface CompanyProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData: CompanyProfile | null
  /** Initial sector value from the foundries table (separate from CompanyProfile JSONB) */
  initialSector?: Sector | null
  foundryId: string
  userId: string
}

type FormStep = 'basics' | 'business' | 'funding' | 'review'

const STEPS: { id: FormStep; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'basics', title: 'Company Basics', icon: Building2 },
  { id: 'business', title: 'Business Model', icon: TrendingUp },
  { id: 'funding', title: 'Funding', icon: BadgePoundSterling },
  { id: 'review', title: 'Review', icon: CheckCircle2 },
]

export function CompanyProfileDialog({
  open,
  onOpenChange,
  initialData,
  initialSector,
  foundryId,
  userId,
}: CompanyProfileDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentStep, setCurrentStep] = useState<FormStep>('basics')
  const [error, setError] = useState<string | null>(null)
  const [sector, setSector] = useState<Sector | null>(initialSector ?? null)

  const [formData, setFormData] = useState<Partial<CompanyProfile>>({
    employee_count: initialData?.employee_count ?? null,
    revenue_range: initialData?.revenue_range ?? null,
    funding_status: initialData?.funding_status ?? null,
    seeking_funding: initialData?.seeking_funding ?? false,
    founded_year: initialData?.founded_year ?? null,
    location: initialData?.location ?? null,
    website: initialData?.website ?? null,
    business_model: initialData?.business_model ?? null,
    competitors: initialData?.competitors ?? null,
  })

  const updateField = <K extends keyof CompanyProfile>(
    field: K,
    value: CompanyProfile[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (error) setError(null)
  }

  const goToNextStep = () => {
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

  const handleSubmit = async () => {
    startTransition(async () => {
      try {
        const profileData: CompanyProfile = {
          employee_count: formData.employee_count ?? null,
          revenue_range: formData.revenue_range ?? null,
          funding_status: formData.funding_status ?? null,
          seeking_funding: formData.seeking_funding ?? null,
          founded_year: formData.founded_year ?? null,
          location: formData.location ?? null,
          website: formData.website ?? null,
          business_model: formData.business_model ?? null,
          competitors: formData.competitors ?? null,
          updatedAt: new Date().toISOString(),
          updatedBy: userId,
        }

        const result = await updateCompanyProfile(foundryId, profileData, sector)

        if (result.success) {
          toast.success('Company profile updated successfully')
          onOpenChange(false)
          router.refresh()
        } else {
          setError(result.error || 'Failed to update company profile')
        }
      } catch (err) {
        setError('An unexpected error occurred')
        console.error('[CompanyProfileDialog] Submit error:', err)
      }
    })
  }

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-international-orange" />
            {initialData ? 'Edit Company Profile' : 'Set Up Company Profile'}
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isCompleted = index < currentStepIndex

            return (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-2 flex-1',
                  index > 0 && 'pl-2'
                )}
              >
                {index > 0 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1',
                      isCompleted ? 'bg-international-orange' : 'bg-muted'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full',
                    'h-8 w-8 transition-colors',
                    isActive && 'bg-international-orange text-white',
                    isCompleted && !isActive && 'bg-orange-100 text-international-orange',
                    !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {currentStep === 'basics' && (
            <StepBasics
              employeeCount={formData.employee_count ?? null}
              foundedYear={formData.founded_year ?? null}
              location={formData.location ?? ''}
              website={formData.website ?? ''}
              sector={sector}
              onEmployeeCountChange={(v) => updateField('employee_count', v)}
              onFoundedYearChange={(v) => updateField('founded_year', v)}
              onLocationChange={(v) => updateField('location', v)}
              onWebsiteChange={(v) => updateField('website', v)}
              onSectorChange={setSector}
            />
          )}

          {currentStep === 'business' && (
            <StepBusiness
              businessModel={formData.business_model ?? null}
              revenueRange={formData.revenue_range ?? null}
              competitors={formData.competitors ?? null}
              onBusinessModelChange={(v) => updateField('business_model', v)}
              onRevenueRangeChange={(v) => updateField('revenue_range', v)}
              onCompetitorsChange={(v) => updateField('competitors', v)}
            />
          )}

          {currentStep === 'funding' && (
            <StepFunding
              fundingStatus={formData.funding_status ?? null}
              seekingFunding={formData.seeking_funding ?? false}
              onFundingStatusChange={(v) => updateField('funding_status', v)}
              onSeekingFundingChange={(v) => updateField('seeking_funding', v)}
            />
          )}

          {currentStep === 'review' && (
            <StepReview formData={formData} sector={sector} />
          )}
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={isFirstStep ? () => onOpenChange(false) : goToPrevStep}
              disabled={isPending}
            >
              {isFirstStep ? (
                'Cancel'
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </>
              )}
            </Button>

            {isLastStep ? (
              <Button
                onClick={handleSubmit}
                disabled={isPending}
                className="bg-international-orange hover:bg-international-orange-hover"
              >
                {isPending ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Save Profile
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={goToNextStep} disabled={isPending}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Step Components ---

function StepBasics({
  employeeCount,
  foundedYear,
  location,
  website,
  sector,
  onEmployeeCountChange,
  onFoundedYearChange,
  onLocationChange,
  onWebsiteChange,
  onSectorChange,
}: {
  employeeCount: EmployeeCount | null
  foundedYear: number | null
  location: string
  website: string
  sector: Sector | null
  onEmployeeCountChange: (v: EmployeeCount) => void
  onFoundedYearChange: (v: number | null) => void
  onLocationChange: (v: string) => void
  onWebsiteChange: (v: string) => void
  onSectorChange: (v: Sector | null) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold mb-1">Company Basics</h3>
        <p className="text-sm text-muted-foreground">
          Help us understand the size, sector, and location of your company.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sector">
          <Building2 className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Industry sector
        </Label>
        <Select
          value={sector ?? ''}
          onValueChange={(v) => onSectorChange(v as Sector)}
        >
          <SelectTrigger id="sector">
            <SelectValue placeholder="Select your industry sector" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(SECTOR_LABELS) as [Sector, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Used to show relevant components in The Forge.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="employeeCount">
          <Users className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Team size
        </Label>
        <Select
          value={employeeCount ?? ''}
          onValueChange={(v) => onEmployeeCountChange(v as EmployeeCount)}
        >
          <SelectTrigger id="employeeCount">
            <SelectValue placeholder="Select team size" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(EMPLOYEE_COUNT_LABELS) as [EmployeeCount, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label} {value === 'just_me' ? 'person' : 'people'}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="foundedYear">Year founded</Label>
        <Input
          id="foundedYear"
          type="number"
          min={1900}
          max={new Date().getFullYear()}
          placeholder={`e.g. ${new Date().getFullYear() - 1}`}
          value={foundedYear ?? ''}
          onChange={(e) =>
            onFoundedYearChange(e.target.value ? Number(e.target.value) : null)
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <InputWithSpeech
          enableSpeech
          id="location"
          placeholder="e.g. London, UK"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          onSpeechTranscript={(text) => onLocationChange(location ? location + " " + text : text)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">Website</Label>
        <Input
          id="website"
          type="url"
          placeholder="https://yourcompany.com"
          value={website}
          onChange={(e) => onWebsiteChange(e.target.value)}
        />
      </div>
    </div>
  )
}

function StepBusiness({
  businessModel,
  revenueRange,
  competitors,
  onBusinessModelChange,
  onRevenueRangeChange,
  onCompetitorsChange,
}: {
  businessModel: BusinessModel | null
  revenueRange: RevenueRange | null
  competitors: string[] | null
  onBusinessModelChange: (v: BusinessModel) => void
  onRevenueRangeChange: (v: RevenueRange) => void
  onCompetitorsChange: (v: string[] | null) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold mb-1">Business Model & Market</h3>
        <p className="text-sm text-muted-foreground">
          This helps us tailor recommendations to your business type and competitive landscape.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessModel">Primary business model</Label>
        <Select
          value={businessModel ?? ''}
          onValueChange={(v) => onBusinessModelChange(v as BusinessModel)}
        >
          <SelectTrigger id="businessModel">
            <SelectValue placeholder="Select business model" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(BUSINESS_MODEL_LABELS) as [BusinessModel, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="revenueRange">Annual revenue</Label>
        <Select
          value={revenueRange ?? ''}
          onValueChange={(v) => onRevenueRangeChange(v as RevenueRange)}
        >
          <SelectTrigger id="revenueRange">
            <SelectValue placeholder="Select revenue range" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(REVENUE_RANGE_LABELS) as [RevenueRange, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="competitors">
          <Swords className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Key competitors
        </Label>
        <TextareaWithSpeech
          enableSpeech
          id="competitors"
          placeholder={"e.g. Acme Corp, https://widgetco.com, FastWidget\n\nOne per line — company names or website URLs"}
          value={(competitors ?? []).join('\n')}
          onChange={(e) => {
            const lines = e.target.value
              .split('\n')
              .map(l => l.trim())
              .filter(l => l.length > 0)
            onCompetitorsChange(lines.length > 0 ? lines : null)
          }}
          onSpeechTranscript={(text) => {
            const current = (competitors ?? []).join('\n')
            const updated = current ? current + '\n' + text : text
            const lines = updated
              .split('\n')
              .map(l => l.trim())
              .filter(l => l.length > 0)
            onCompetitorsChange(lines.length > 0 ? lines : null)
          }}
          rows={3}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Your specialists will use this to give you competitive insights and differentiated advice.
        </p>
      </div>
    </div>
  )
}

function StepFunding({
  fundingStatus,
  seekingFunding,
  onFundingStatusChange,
  onSeekingFundingChange,
}: {
  fundingStatus: FundingStatus | null
  seekingFunding: boolean | null
  onFundingStatusChange: (v: FundingStatus) => void
  onSeekingFundingChange: (v: boolean) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold mb-1">Funding Status</h3>
        <p className="text-sm text-muted-foreground">
          Understanding your funding stage helps us recommend the right resources.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fundingStatus">Current funding stage</Label>
        <Select
          value={fundingStatus ?? ''}
          onValueChange={(v) => onFundingStatusChange(v as FundingStatus)}
        >
          <SelectTrigger id="fundingStatus">
            <SelectValue placeholder="Select funding stage" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(FUNDING_STATUS_LABELS) as [FundingStatus, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-muted p-4">
        <div className="space-y-0.5">
          <Label htmlFor="seekingFunding" className="text-base">
            Actively seeking funding?
          </Label>
          <p className="text-sm text-muted-foreground">
            We can surface relevant fundraising resources and investor-ready tools.
          </p>
        </div>
        <Switch
          id="seekingFunding"
          checked={seekingFunding ?? false}
          onCheckedChange={onSeekingFundingChange}
        />
      </div>
    </div>
  )
}

function StepReview({ formData, sector }: { formData: Partial<CompanyProfile>; sector: Sector | null }) {
  const items: { label: string; value: string | null }[] = [
    { label: 'Sector', value: sector ? SECTOR_LABELS[sector] : null },
    { label: 'Team size', value: formData.employee_count ? EMPLOYEE_COUNT_LABELS[formData.employee_count] : null },
    { label: 'Founded', value: formData.founded_year ? String(formData.founded_year) : null },
    { label: 'Location', value: formData.location || null },
    { label: 'Website', value: formData.website || null },
    { label: 'Business model', value: formData.business_model ? BUSINESS_MODEL_LABELS[formData.business_model] : null },
    { label: 'Revenue', value: formData.revenue_range ? REVENUE_RANGE_LABELS[formData.revenue_range] : null },
    { label: 'Funding stage', value: formData.funding_status ? FUNDING_STATUS_LABELS[formData.funding_status] : null },
    { label: 'Seeking funding', value: formData.seeking_funding ? 'Yes' : 'No' },
    { label: 'Competitors', value: formData.competitors && formData.competitors.length > 0 ? formData.competitors.join(', ') : null },
  ]

  const filledCount = items.filter((i) => i.value && i.value !== 'No').length

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">Review your profile</h3>
        <p className="text-sm text-muted-foreground">
          {filledCount === 0
            ? 'You haven\'t filled in any fields yet. You can still save and come back later.'
            : `${filledCount} of ${items.length} fields completed. You can always update these later.`}
        </p>
      </div>

      <div className="rounded-lg border border-muted divide-y divide-muted">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-muted-foreground">{item.label}</span>
            <span className="text-sm font-medium">
              {item.value || <span className="text-muted-foreground/50">Not set</span>}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        This information is used to personalise AI recommendations. Only founders can edit it.
      </p>
    </div>
  )
}
