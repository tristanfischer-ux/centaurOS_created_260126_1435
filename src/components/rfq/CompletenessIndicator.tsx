'use client'

import { Progress } from '@/components/ui/progress'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CompletenessCheck {
  key: string
  label: string
  passed: boolean
  required: boolean
  hint?: string
}

interface CompletenessIndicatorProps {
  checks: CompletenessCheck[]
  className?: string
}

export function CompletenessIndicator({ checks, className }: CompletenessIndicatorProps) {
  // Calculate score - required fields count more
  const requiredChecks = checks.filter(c => c.required)
  const optionalChecks = checks.filter(c => !c.required)
  
  const requiredPassed = requiredChecks.filter(c => c.passed).length
  const optionalPassed = optionalChecks.filter(c => c.passed).length
  
  // Required fields are worth 70%, optional 30%
  const requiredScore = requiredChecks.length > 0 
    ? (requiredPassed / requiredChecks.length) * 70 
    : 70
  const optionalScore = optionalChecks.length > 0 
    ? (optionalPassed / optionalChecks.length) * 30 
    : 30
  
  const totalScore = Math.round(requiredScore + optionalScore)
  
  // Get incomplete items to show as recommendations
  const incompleteRequired = checks.filter(c => c.required && !c.passed)
  const incompleteOptional = checks.filter(c => !c.required && !c.passed)
  const completedChecks = checks.filter(c => c.passed)

  // Determine color based on score
  const getScoreColor = () => {
    if (totalScore >= 80) return 'text-emerald-600'
    if (totalScore >= 50) return 'text-amber-600'
    return 'text-red-600'
  }

  const getProgressColor = () => {
    if (totalScore >= 80) return '[&>div]:bg-emerald-500'
    if (totalScore >= 50) return '[&>div]:bg-amber-500'
    return '[&>div]:bg-red-500'
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Score header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Completeness</span>
        <span className={cn('text-lg font-bold', getScoreColor())}>{totalScore}%</span>
      </div>
      
      {/* Progress bar */}
      <Progress 
        value={totalScore} 
        className={cn('h-2', getProgressColor())}
      />
      
      {/* Checklist */}
      <div className="space-y-1.5 pt-2">
        {/* Show missing required items first */}
        {incompleteRequired.map((check) => (
          <div key={check.key} className="flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-red-600 font-medium">{check.label}</span>
              {check.hint && (
                <span className="text-muted-foreground ml-1">— {check.hint}</span>
              )}
            </div>
          </div>
        ))}
        
        {/* Show missing optional items */}
        {incompleteOptional.slice(0, 3).map((check) => (
          <div key={check.key} className="flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-amber-600">{check.label}</span>
              {check.hint && (
                <span className="text-muted-foreground ml-1">— {check.hint}</span>
              )}
            </div>
          </div>
        ))}
        
        {/* Show completed items (collapsed if many) */}
        {completedChecks.slice(0, 3).map((check) => (
          <div key={check.key} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-muted-foreground">{check.label}</span>
          </div>
        ))}
        
        {completedChecks.length > 3 && (
          <div className="text-xs text-muted-foreground pl-6">
            +{completedChecks.length - 3} more completed
          </div>
        )}
      </div>
    </div>
  )
}

// Helper to generate completeness checks from form data
export function generateCompletenessChecks(formData: {
  title: string
  category: string
  rfqType: string
  description: string
  budgetMin: string
  budgetMax: string
  deadline: string
  files: { path: string }[]
  quantity?: string
  material?: string
}): CompletenessCheck[] {
  return [
    {
      key: 'title',
      label: 'Title provided',
      passed: formData.title.trim().length >= 3,
      required: true,
      hint: 'required',
    },
    {
      key: 'category',
      label: 'Category selected',
      passed: !!formData.category,
      required: true,
      hint: 'required',
    },
    {
      key: 'rfqType',
      label: 'RFQ type selected',
      passed: !!formData.rfqType,
      required: true,
      hint: 'required',
    },
    {
      key: 'description',
      label: 'Description provided',
      passed: formData.description.trim().length >= 20,
      required: true,
      hint: 'at least 20 characters',
    },
    {
      key: 'budget',
      label: 'Budget specified',
      passed: !!(formData.budgetMin || formData.budgetMax),
      required: false,
      hint: 'helps suppliers prioritize',
    },
    {
      key: 'deadline',
      label: 'Deadline set',
      passed: !!formData.deadline,
      required: false,
      hint: 'faster responses',
    },
    {
      key: 'files',
      label: 'Files attached',
      passed: formData.files.length > 0,
      required: false,
      hint: 'drawings, specs, CAD',
    },
    {
      key: 'quantity',
      label: 'Quantity specified',
      passed: !!(formData.quantity && parseInt(formData.quantity) > 0),
      required: false,
      hint: 'for accurate quotes',
    },
  ]
}
