'use client'

import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Zap,
  Clock,
  CheckCircle2,
  HelpCircle,
  XCircle,
  FileText,
  Calendar,
  Wallet,
  Tag,
  PanelRightClose,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RFQType, RFQ_CATEGORIES } from '@/types/rfq'
import { CompletenessIndicator, CompletenessCheck } from './CompletenessIndicator'
import { format } from 'date-fns'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  path: string
}

interface SupplierPreviewPanelProps {
  formData: {
    title: string
    rfqType: RFQType
    category: string
    description: string
    budgetMin: string
    budgetMax: string
    deadline: string
    urgency: 'urgent' | 'standard'
    files: UploadedFile[]
    quantity?: string
    quantityUnit?: string
    material?: string
    customMaterial?: string
  }
  completenessChecks: CompletenessCheck[]
  onCollapse?: () => void
  className?: string
}

const typeLabels: Record<RFQType, { label: string; description: string; icon: React.ReactNode }> = {
  commodity: {
    label: 'Commodity',
    description: 'First click wins',
    icon: <Zap className="w-3.5 h-3.5" />,
  },
  custom: {
    label: 'Custom',
    description: '2hr priority hold',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  service: {
    label: 'Service',
    description: 'Review all quotes',
    icon: <User className="w-3.5 h-3.5" />,
  },
}

export function SupplierPreviewPanel({
  formData,
  completenessChecks,
  onCollapse,
  className,
}: SupplierPreviewPanelProps) {
  const formatBudget = () => {
    const min = formData.budgetMin ? parseFloat(formData.budgetMin) : null
    const max = formData.budgetMax ? parseFloat(formData.budgetMax) : null

    if (min && max) {
      return `£${min.toLocaleString()} - £${max.toLocaleString()}`
    }
    if (min) {
      return `From £${min.toLocaleString()}`
    }
    if (max) {
      return `Up to £${max.toLocaleString()}`
    }
    return 'Not specified'
  }

  const formatDeadline = () => {
    if (!formData.deadline) return 'Not specified'
    try {
      return format(new Date(formData.deadline), 'MMM d, yyyy')
    } catch {
      return formData.deadline
    }
  }

  const typeInfo = typeLabels[formData.rfqType] || typeLabels.commodity

  const hasContent = formData.title || formData.description || formData.category

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b mb-4">
        <h3 className="font-semibold text-sm">Supplier Preview</h3>
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCollapse}
            className="h-8 w-8"
            title="Collapse preview"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Preview Card */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <Card className="border-2">
          <CardHeader className="pb-3">
            {/* Title */}
            <h4 className="font-semibold text-lg leading-tight">
              {formData.title || (
                <span className="text-muted-foreground italic">Your RFQ title...</span>
              )}
            </h4>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 pt-2">
              {formData.rfqType && (
                <Badge variant="secondary" className="text-xs gap-1">
                  {typeInfo.icon}
                  {typeInfo.label}
                </Badge>
              )}
              {formData.category && (
                <Badge variant="outline" className="text-xs">
                  <Tag className="w-3 h-3 mr-1" />
                  {formData.category}
                </Badge>
              )}
              {formData.urgency === 'urgent' && (
                <StatusBadge status="warning" size="sm">
                  <Zap className="w-3 h-3 mr-1" />
                  Urgent
                </StatusBadge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Key Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Wallet className="w-3.5 h-3.5" />
                  Budget
                </div>
                <div className="font-medium text-sm">{formatBudget()}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Deadline
                </div>
                <div className="font-medium text-sm">{formatDeadline()}</div>
              </div>
            </div>

            {/* Specifications */}
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                <FileText className="w-3.5 h-3.5" />
                Specifications
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-sm whitespace-pre-wrap min-h-[60px]">
                {formData.description || (
                  <span className="text-muted-foreground italic">
                    Your specifications will appear here...
                  </span>
                )}
              </div>
            </div>

            {/* Additional details if provided */}
            {(formData.quantity || formData.material) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {formData.quantity && (
                  <span className="px-2 py-1 bg-muted rounded">
                    Qty: {formData.quantity} {formData.quantityUnit || 'pieces'}
                  </span>
                )}
                {formData.material && formData.material !== 'Other (specify)' && (
                  <span className="px-2 py-1 bg-muted rounded">
                    {formData.material}
                  </span>
                )}
                {formData.material === 'Other (specify)' && formData.customMaterial && (
                  <span className="px-2 py-1 bg-muted rounded">
                    {formData.customMaterial}
                  </span>
                )}
              </div>
            )}

            {/* Files */}
            {formData.files.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <FileText className="w-3.5 h-3.5" />
                  Attachments ({formData.files.length})
                </div>
                <div className="space-y-1">
                  {formData.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50"
                    >
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="truncate">{file.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons Preview */}
            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-2">Supplier actions:</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="success"
                  className="flex-1 cursor-default"
                  disabled
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 cursor-default"
                  disabled
                >
                  <HelpCircle className="w-3.5 h-3.5 mr-1.5" />
                  Info
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 cursor-default"
                  disabled
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Decline
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Completeness Indicator */}
        <Card>
          <CardContent className="pt-4">
            <CompletenessIndicator checks={completenessChecks} />
          </CardContent>
        </Card>

        {/* Helper text */}
        <p className="text-xs text-muted-foreground text-center px-4">
          This is exactly what suppliers will see when your RFQ is broadcast
        </p>
      </div>
    </div>
  )
}
