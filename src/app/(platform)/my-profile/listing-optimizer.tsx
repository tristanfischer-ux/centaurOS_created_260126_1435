'use client'

import { useState } from 'react'
import { 
  Package, Image as ImageIcon, Tag, FileText, Lightbulb, CheckCircle2, ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ListingData {
  id: string
  title: string | null
  description: string | null
  category: string | null
  subcategory: string | null
  image_url: string | null
  approval_status: string | null
}

// Category-specific description templates
const CATEGORY_TEMPLATES: Record<string, { title: string; template: string; tips: string[] }> = {
  'People': {
    title: 'Professional Services',
    template: `[Your Role/Title] with [X years] of experience in [industry/domain].

Key Services:
- [Service 1]: [Brief description of what you deliver]
- [Service 2]: [Brief description of what you deliver]
- [Service 3]: [Brief description of what you deliver]

Typical Engagement:
- Duration: [weeks/months]
- Commitment: [hours per week]
- Deliverables: [what the client gets]

Past clients include [types of companies]. Notable results: [specific metric or achievement].`,
    tips: [
      'Lead with the outcome you deliver, not just your title',
      'Include specific metrics from past work (e.g., "reduced costs by 30%")',
      'Mention the types of companies you work best with',
      'Be specific about your engagement model (fractional, project, advisory)',
    ],
  },
  'Products': {
    title: 'Hardware & Physical Products',
    template: `[Product Name] - [One-line description of what it does/solves]

Specifications:
- [Key spec 1]: [Value]
- [Key spec 2]: [Value]
- [Key spec 3]: [Value]

Ideal For: [Type of customer or use case]

Pricing: [Starting from / per unit / custom quote]
Lead Time: [Typical delivery timeline]
MOQ: [Minimum order quantity, if applicable]

Certifications: [ISO, CE, UL, etc.]`,
    tips: [
      'Lead with the problem your product solves, not just specs',
      'Include high-quality product photos from multiple angles',
      'Be transparent about lead times and minimum order quantities',
      'List all relevant certifications and compliance standards',
    ],
  },
  'Services': {
    title: 'Business Services',
    template: `[Service Name] - [What it delivers in one sentence]

What We Do:
[2-3 sentences describing your core service offering]

How It Works:
1. [Step 1]: [Description]
2. [Step 2]: [Description]
3. [Step 3]: [Description]

Pricing: [Fixed price / Hourly / Project-based]
Turnaround: [Typical timeline]

Why Choose Us:
- [Differentiator 1]
- [Differentiator 2]
- [Differentiator 3]`,
    tips: [
      'Explain your process - buyers want to know what to expect',
      'Include turnaround times and pricing model (even if approximate)',
      'Highlight what makes you different from competitors',
      'Add case studies or examples of past work',
    ],
  },
}

export function ListingOptimizer({ listing }: { listing: ListingData | null }) {
  const [showTemplate, setShowTemplate] = useState(false)

  if (!listing) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-3">
          <Package className="h-4 w-4 text-international-orange" />
          Marketplace Listing
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          You don&apos;t have a marketplace listing yet. Create one to be discoverable by buyers.
        </p>
        <Button asChild size="sm" className="bg-international-orange hover:bg-international-orange/90">
          <a href="/provider-portal/listing">
            Create Listing
            <ArrowRight className="h-4 w-4 ml-2" />
          </a>
        </Button>
      </div>
    )
  }

  const template = CATEGORY_TEMPLATES[listing.category || 'Services'] || CATEGORY_TEMPLATES.Services
  const optimizationChecks = getOptimizationChecks(listing)

  return (
    <div className="rounded-lg border bg-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Package className="h-4 w-4 text-international-orange" />
          Listing Optimizer
        </h3>
        {listing.approval_status && (
          <span className={cn(
            "text-xs font-mono uppercase px-2 py-1 rounded border font-semibold tracking-wide",
            listing.approval_status === 'approved' 
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
              : listing.approval_status === 'pending'
              ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-red-700 bg-red-50 border-red-200'
          )}>
            {listing.approval_status}
          </span>
        )}
      </div>

      {/* Current listing summary */}
      <div className="p-4 bg-muted/50 rounded-md">
        <div className="text-sm font-medium text-foreground">{listing.title || 'Untitled'}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {listing.category} / {listing.subcategory}
        </div>
      </div>

      {/* Optimization checks */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Listing Health
        </h4>
        <div className="space-y-2">
          {optimizationChecks.map((check) => (
            <div key={check.label} className="flex items-start gap-2">
              <CheckCircle2 className={cn(
                "h-4 w-4 flex-shrink-0 mt-0.5",
                check.passed ? "text-emerald-600" : "text-muted-foreground"
              )} />
              <div>
                <span className={cn(
                  "text-sm",
                  check.passed ? "text-foreground" : "text-muted-foreground"
                )}>
                  {check.label}
                </span>
                {!check.passed && check.suggestion && (
                  <p className="text-xs text-muted-foreground mt-0.5">{check.suggestion}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category-specific tips */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Tag className="h-4 w-4 text-international-orange" />
          Tips for {template.title}
        </h4>
        <ul className="space-y-2">
          {template.tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="text-international-orange mt-1">•</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>

      {/* Description template */}
      <div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setShowTemplate(!showTemplate)}
          className="mb-3"
        >
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          {showTemplate ? 'Hide' : 'Show'} Description Template
        </Button>
        
        {showTemplate && (
          <pre className="p-4 bg-muted rounded-md text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs leading-relaxed">
            {template.template}
          </pre>
        )}
      </div>

      {/* Image guidance */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-international-orange" />
          Image Best Practices
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-emerald-50 rounded-md">
            <div className="text-xs font-semibold text-emerald-700 mb-1">Do</div>
            <ul className="text-xs text-emerald-700 space-y-1">
              <li>Use high-resolution images (min 800x600)</li>
              <li>Show your product/service in action</li>
              <li>Use consistent, professional lighting</li>
              <li>Include multiple angles or examples</li>
            </ul>
          </div>
          <div className="p-3 bg-red-50 rounded-md">
            <div className="text-xs font-semibold text-red-700 mb-1">Avoid</div>
            <ul className="text-xs text-red-700 space-y-1">
              <li>Stock photos that feel generic</li>
              <li>Low-resolution or blurry images</li>
              <li>Text-heavy graphics or watermarks</li>
              <li>Cluttered backgrounds</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Edit link */}
      <Button asChild variant="outline" size="sm" className="w-full">
        <a href="/provider-portal/listing">
          Edit Listing
          <ArrowRight className="h-4 w-4 ml-2" />
        </a>
      </Button>
    </div>
  )
}

function getOptimizationChecks(listing: ListingData) {
  return [
    {
      label: 'Title is descriptive',
      passed: !!(listing.title && listing.title.length > 10),
      suggestion: 'Make your title specific. Instead of "Consulting", try "Fractional CFO for Hardware Startups"',
    },
    {
      label: 'Description is detailed',
      passed: !!(listing.description && listing.description.length > 100),
      suggestion: 'A detailed description (200+ words) helps buyers understand your offering',
    },
    {
      label: 'Has a cover image',
      passed: !!(listing.image_url),
      suggestion: 'Listings with images get 3x more clicks. Add a professional photo.',
    },
    {
      label: 'Category and subcategory set',
      passed: !!(listing.category && listing.subcategory),
      suggestion: 'Proper categorization helps buyers find you through filters',
    },
    {
      label: 'Listing is approved',
      passed: listing.approval_status === 'approved',
      suggestion: listing.approval_status === 'pending' 
        ? 'Your listing is being reviewed. You\'ll be notified once approved.'
        : 'Submit your listing for review to make it visible on the marketplace.',
    },
  ]
}
