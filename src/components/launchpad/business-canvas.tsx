'use client'

/**
 * @file business-canvas.tsx
 * 
 * @description Simplified lean business canvas for the Entrepreneur's Launchpad.
 * Helps solopreneurs articulate their business model visually.
 * Data is stored in the foundry's purpose_data JSONB column.
 * 
 * @component BusinessCanvas
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertCircle,
  Lightbulb,
  Users,
  Zap,
  DollarSign,
  Target,
  ArrowRight,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface BusinessCanvasProps {
  /** Existing purpose/canvas data from foundry */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  purposeData: any
  /** Foundry name */
  foundryName: string
  /** Industry category */
  foundryIndustry: string | null
  /** Foundry ID for linking to purpose editor */
  foundryId: string
}

/** The 6 sections of the simplified canvas */
const CANVAS_SECTIONS = [
  {
    id: 'problem',
    title: 'Problem',
    description: 'What pain point are you solving?',
    icon: AlertCircle,
    field: 'problemSolved',
    placeholder: 'Describe the problem your customers face...',
    color: 'text-destructive',
    bgColor: 'bg-status-error-light',
  },
  {
    id: 'solution',
    title: 'Solution',
    description: 'How do you solve it?',
    icon: Lightbulb,
    field: 'purpose',
    placeholder: 'Describe your product or service...',
    color: 'text-status-success',
    bgColor: 'bg-status-success-light',
  },
  {
    id: 'customer',
    title: 'Target Customer',
    description: 'Who are you solving this for?',
    icon: Users,
    field: 'whoServed',
    placeholder: 'Describe your ideal customer...',
    color: 'text-status-info',
    bgColor: 'bg-status-info-light',
  },
  {
    id: 'value',
    title: 'Unique Value',
    description: 'Why should they choose you?',
    icon: Zap,
    field: 'uniqueValue',
    placeholder: 'What makes your approach special?',
    color: 'text-status-warning',
    bgColor: 'bg-status-warning-light',
  },
  {
    id: 'revenue',
    title: 'Revenue Model',
    description: 'How will you make money?',
    icon: DollarSign,
    field: 'mission',
    placeholder: 'Subscriptions, services, products, marketplace...',
    color: 'text-status-success',
    bgColor: 'bg-status-success-light',
  },
  {
    id: 'vision',
    title: 'Vision',
    description: 'Where will you be in 5 years?',
    icon: Target,
    field: 'fiveYearVision',
    placeholder: 'Describe your long-term vision...',
    color: 'text-international-orange',
    bgColor: 'bg-orange-50',
  },
] as const

/**
 * BusinessCanvas - Simplified lean canvas for solopreneurs
 * 
 * @description Visual business model canvas showing 6 key sections:
 * Problem, Solution, Target Customer, Unique Value, Revenue Model, Vision.
 * Links to the Company Purpose dialog for editing.
 */
export function BusinessCanvas({
  purposeData,
  foundryName,
  foundryIndustry,
  foundryId,
}: BusinessCanvasProps) {
  const questionnaire = purposeData?.questionnaire || {}
  const filledSections = CANVAS_SECTIONS.filter(s => {
    const value = questionnaire[s.field] || purposeData?.[s.field]
    return value && String(value).trim().length > 0
  })
  const completionPercent = Math.round((filledSections.length / CANVAS_SECTIONS.length) * 100)

  const isEmpty = filledSections.length === 0

  return (
    <div id="canvas" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-international-orange" />
          Business Canvas
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {filledSections.length}/{CANVAS_SECTIONS.length} sections
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href="/new-objectives">
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <Card className="border bg-muted/30">
          <CardContent className="py-12 text-center">
            <Lightbulb className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-base font-semibold text-foreground mb-2">
              Define your business model
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Fill out the Business Canvas to clarify what you&apos;re building, who it&apos;s for,
              and how you&apos;ll make it work. This helps you and the AI advisor stay aligned.
            </p>
            <Button asChild>
              <Link href="/new-objectives">
                Get Started
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CANVAS_SECTIONS.map((section) => {
            const Icon = section.icon
            const value = questionnaire[section.field] || purposeData?.[section.field] || ''
            const isFilled = String(value).trim().length > 0

            return (
              <Card
                key={section.id}
                className={cn(
                  'border transition-all',
                  isFilled ? 'hover:shadow-sm' : 'border-dashed bg-muted/20',
                )}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <div className={cn(
                      'flex items-center justify-center h-6 w-6 rounded',
                      isFilled ? section.bgColor : 'bg-muted',
                    )}>
                      <Icon className={cn(
                        'h-3.5 w-3.5',
                        isFilled ? section.color : 'text-muted-foreground',
                      )} />
                    </div>
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isFilled ? (
                    <p className="text-sm text-foreground line-clamp-3">{value}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">{section.placeholder}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
