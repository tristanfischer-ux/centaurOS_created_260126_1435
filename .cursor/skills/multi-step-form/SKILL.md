---
name: multi-step-form
description: Create multi-step form wizards with step validation, progress indicators, and navigation. Use when implementing wizard, multi-step, stepper, form steps, onboarding form, or complex forms with multiple pages.
---

# Multi-Step Form Implementation

This skill provides patterns for building multi-step form wizards in ForgeOS.

## Reference Implementation

See `src/components/pitch-prep/PitchPrepForm.tsx` for a complete 5-step form example.

---

## Core Architecture

### Step 1: Define Steps Configuration

```tsx
type FormStep = 'company' | 'product' | 'traction' | 'services' | 'review'

const STEPS: { id: FormStep; title: string; icon: React.ElementType }[] = [
  { id: 'company', title: 'Company Info', icon: Building2 },
  { id: 'product', title: 'Product', icon: Target },
  { id: 'traction', title: 'Traction', icon: TrendingUp },
  { id: 'services', title: 'Services', icon: FileText },
  { id: 'review', title: 'Review', icon: CheckCircle2 },
]
```

### Step 2: State Management

```tsx
'use client'

import { useState, useTransition } from 'react'

export function MultiStepForm() {
  const [isPending, startTransition] = useTransition()
  const [currentStep, setCurrentStep] = useState<FormStep>('company')
  const [error, setError] = useState<string | null>(null)

  // Centralized form state
  const [formData, setFormData] = useState<Partial<FormDataType>>({
    // Initialize all fields
    company_name: '',
    product_description: '',
    // ... more fields
  })

  // Generic field updater
  const updateField = <K extends keyof FormDataType>(
    field: K,
    value: FormDataType[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (error) setError(null) // Clear error on change
  }

  // Calculate current step index
  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
  
  // ... rest of component
}
```

### Step 3: Step Validation

```tsx
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
```

### Step 4: Navigation Functions

```tsx
const goToNextStep = () => {
  // Validate current step before advancing
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
```

---

## UI Components

### Progress Indicator

```tsx
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
            // Allow clicking back to completed steps
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
              'flex h-8 w-8 items-center justify-center rounded-full border-2',
              isActive && 'border-accent bg-accent text-accent-foreground',
              isCompleted && 'border-status-success bg-status-success text-white',
              !isActive && !isCompleted && 'border-muted-foreground'
            )}
          >
            {isCompleted ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <StepIcon className="h-4 w-4" />
            )}
          </div>
          <span className="hidden sm:inline font-medium">{step.title}</span>
        </button>
        
        {/* Connector line between steps */}
        {index < STEPS.length - 1 && (
          <div
            className={cn(
              'hidden sm:block h-0.5 w-8 mx-2',
              index < currentStepIndex ? 'bg-status-success' : 'bg-muted'
            )}
          />
        )}
      </div>
    )
  })}
</div>
```

### Step Content Renderer

```tsx
{/* Step Content */}
<Card>
  <CardContent className="pt-6">
    {currentStep === 'company' && (
      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="company_name">
            Company Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="company_name"
            value={formData.company_name || ''}
            onChange={(e) => updateField('company_name', e.target.value)}
            placeholder="Enter your company name"
            autoFocus
          />
        </div>
        {/* More fields... */}
      </div>
    )}

    {currentStep === 'product' && (
      <div className="space-y-6">
        {/* Product step fields */}
      </div>
    )}
    
    {/* More steps... */}
    
    {currentStep === 'review' && (
      <ReviewStep formData={formData} />
    )}
  </CardContent>
</Card>
```

### Navigation Buttons

```tsx
{/* Navigation */}
<div className="flex justify-between">
  <Button
    type="button"
    variant="outline"
    onClick={goToPrevStep}
    disabled={currentStepIndex === 0}
  >
    <ChevronLeft className="h-4 w-4 mr-2" />
    Previous
  </Button>

  {currentStep !== 'review' ? (
    <Button type="button" onClick={goToNextStep}>
      Next
      <ChevronRight className="h-4 w-4 ml-2" />
    </Button>
  ) : (
    <Button 
      type="button" 
      onClick={handleSubmit}
      disabled={isPending}
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Submitting...
        </>
      ) : (
        'Submit'
      )}
    </Button>
  )}
</div>
```

### Error Display

```tsx
{/* Error Alert */}
{error && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

---

## Advanced Patterns

### Conditional Steps

Skip steps based on previous answers:

```tsx
const getVisibleSteps = () => {
  return STEPS.filter(step => {
    // Skip traction step if no revenue
    if (step.id === 'traction' && !formData.has_revenue) {
      return false
    }
    return true
  })
}

const visibleSteps = getVisibleSteps()
const currentStepIndex = visibleSteps.findIndex((s) => s.id === currentStep)
```

### Save Draft State

Auto-save to localStorage:

```tsx
// Save draft on change
useEffect(() => {
  localStorage.setItem('form-draft', JSON.stringify(formData))
}, [formData])

// Restore draft on mount
useEffect(() => {
  const saved = localStorage.getItem('form-draft')
  if (saved) {
    setFormData(JSON.parse(saved))
  }
}, [])

// Clear draft on successful submit
const handleSubmit = async () => {
  const result = await submitForm(formData)
  if (result.success) {
    localStorage.removeItem('form-draft')
    // ...
  }
}
```

### Multi-Select Fields

For checkbox groups:

```tsx
const toggleService = (service: ServiceType) => {
  const current = formData.services || []
  const updated = current.includes(service)
    ? current.filter((s) => s !== service)
    : [...current, service]
  updateField('services', updated)
}

// In render
<div className="grid grid-cols-2 gap-4">
  {SERVICES.map((service) => (
    <div
      key={service}
      onClick={() => toggleService(service)}
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all',
        formData.services?.includes(service)
          ? 'border-accent bg-accent/10'
          : 'border-muted hover:border-accent/50'
      )}
    >
      <Checkbox
        checked={formData.services?.includes(service)}
        onCheckedChange={() => toggleService(service)}
      />
      <span className="ml-2">{service}</span>
    </div>
  ))}
</div>
```

### Review Step Component

Display all entered data for review:

```tsx
function ReviewStep({ formData }: { formData: Partial<FormDataType> }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Review Your Information</h3>
      
      {/* Company Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Company Name</span>
            <span className="font-medium">{formData.company_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Website</span>
            <span className="font-medium">{formData.website || 'Not provided'}</span>
          </div>
          {/* More fields... */}
        </CardContent>
      </Card>
      
      {/* More sections... */}
    </div>
  )
}
```

---

## File Structure

```
src/
├── components/
│   └── feature-name/
│       ├── FeatureForm.tsx       # Main multi-step form
│       ├── steps/
│       │   ├── CompanyStep.tsx   # Optional: separate step components
│       │   ├── ProductStep.tsx
│       │   └── ReviewStep.tsx
│       └── index.ts
├── types/
│   └── feature-name.ts           # Form types and enums
└── actions/
    └── feature-name.ts           # Server action for submission
```

---

## Checklist

Before committing a multi-step form:

- [ ] Steps configuration defined with icons
- [ ] Form state centralized with generic updater
- [ ] Each step has validation function
- [ ] Progress indicator shows current/completed/future states
- [ ] Users can click back to completed steps
- [ ] Navigation disabled for future steps
- [ ] Error messages displayed clearly
- [ ] Review step shows all entered data
- [ ] Submit button shows loading state
- [ ] First input in each step has `autoFocus`
- [ ] Mobile-responsive progress indicator
- [ ] Draft auto-save (optional but recommended)

---

## Common Mistakes to Avoid

1. **Don't validate all steps at once** - Validate only current step before advancing
2. **Don't lose form state on navigation** - Keep all data in centralized state
3. **Don't block backwards navigation** - Users should revisit completed steps
4. **Don't forget loading states** - Show spinner during submission
5. **Don't skip the review step** - Let users verify before submitting
