'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Package,
  Calendar,
} from 'lucide-react'
import { createCadLabRfqAction } from '@/actions/cad-lab-rfq'
import { toast } from 'sonner'

interface CadLabModule {
  name: string
  status: string
  process?: string
  material?: string
  tolerance?: string
  finish?: string
  quantity?: number
}

interface CadLabRFQHandoffProps {
  projectName: string
  modules: CadLabModule[]
  diagnosticAnswers: Record<string, unknown>
  designBrief?: Record<string, unknown>
  assumptionNotes?: string
  projectId?: string
  onSuccess?: (rfqId: string) => void
  onCancel?: () => void
  onRfqLinked?: (rfqId: string) => Promise<void>
  className?: string
}

export function CadLabRFQHandoff({
  projectName,
  modules,
  diagnosticAnswers,
  designBrief,
  assumptionNotes,
  projectId,
  onSuccess,
  onCancel,
  onRfqLinked,
  className,
}: CadLabRFQHandoffProps) {
  const [isPending, startTransition] = useTransition()
  const [deadline, setDeadline] = useState('')
  const [moduleOverrides, setModuleOverrides] = useState<
    Record<number, { quantity?: number; material?: string; tolerance?: string; finish?: string }>
  >({})

  // Calculate readiness
  const specifiedModules = modules.filter(
    (m) => m.status === 'specified' || m.status === 'generated'
  )
  const readinessScore = modules.length > 0
    ? Math.round((specifiedModules.length / modules.length) * 100)
    : 0

  const handleSubmit = () => {
    startTransition(async () => {
      try {
        // Apply overrides to modules
        const mergedModules = modules.map((m, idx) => ({
          ...m,
          ...(moduleOverrides[idx] || {}),
        }))

        const res = await createCadLabRfqAction({
          projectName,
          modules: mergedModules as Parameters<typeof createCadLabRfqAction>[0]['modules'],
          diagnosticAnswers: diagnosticAnswers as Parameters<typeof createCadLabRfqAction>[0]['diagnosticAnswers'],
          deadline: deadline || undefined,
          designBrief: designBrief as Parameters<typeof createCadLabRfqAction>[0]['designBrief'],
          assumptionNotes,
        })

        if ('error' in res) {
          toast.error(res.error)
          return
        }

        if (projectId && onRfqLinked) {
          await onRfqLinked(res.rfqId)
        }

        toast.success('Marketplace RFQ created from drawing package')

        if (onSuccess) {
          onSuccess(res.rfqId)
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to create RFQ')
      }
    })
  }

  const updateModuleOverride = (idx: number, field: string, value: string | number) => {
    setModuleOverrides((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], [field]: value },
    }))
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          RFQ Pre-Flight Check
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Review and customise before sending to suppliers
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Readiness score */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <span className="text-sm font-medium">Readiness</span>
          <Badge
            variant={readinessScore >= 80 ? 'default' : 'secondary'}
            className={cn(
              readinessScore >= 80 && 'bg-status-success text-status-success-foreground'
            )}
          >
            {readinessScore}% ready
          </Badge>
        </div>

        {/* Module line items */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Modules ({specifiedModules.length}/{modules.length})</Label>
          {modules.map((mod, idx) => {
            const isSpecified = mod.status === 'specified' || mod.status === 'generated'
            const override = moduleOverrides[idx] || {}

            return (
              <div
                key={idx}
                className={cn(
                  'p-3 rounded-lg border space-y-2',
                  isSpecified ? 'border-border' : 'border-dashed border-muted-foreground/30 opacity-60'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isSpecified ? (
                      <CheckCircle2 className="w-4 h-4 text-status-success" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{mod.name}</span>
                  </div>
                  {mod.process && (
                    <Badge variant="outline" className="text-xs">
                      {mod.process}
                    </Badge>
                  )}
                </div>

                {isSpecified && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        value={override.quantity ?? mod.quantity ?? ''}
                        onChange={(e) => updateModuleOverride(idx, 'quantity', parseInt(e.target.value) || 0)}
                        min={1}
                        disabled={isPending}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Material</Label>
                      <Input
                        className="h-8 text-xs"
                        value={override.material ?? mod.material ?? ''}
                        onChange={(e) => updateModuleOverride(idx, 'material', e.target.value)}
                        placeholder="e.g., 6061-T6"
                        disabled={isPending}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Tolerance</Label>
                      <Input
                        className="h-8 text-xs"
                        value={override.tolerance ?? mod.tolerance ?? ''}
                        onChange={(e) => updateModuleOverride(idx, 'tolerance', e.target.value)}
                        placeholder="e.g., ±0.1mm"
                        disabled={isPending}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Finish</Label>
                      <Input
                        className="h-8 text-xs"
                        value={override.finish ?? mod.finish ?? ''}
                        onChange={(e) => updateModuleOverride(idx, 'finish', e.target.value)}
                        placeholder="e.g., Anodised"
                        disabled={isPending}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Deadline */}
        <div className="space-y-2">
          <Label htmlFor="handoff-deadline" className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            Deadline
          </Label>
          <Input
            id="handoff-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            disabled={isPending}
          />
        </div>
      </CardContent>

      <CardFooter className="flex gap-3">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={isPending} className="flex-1">
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={isPending || specifiedModules.length === 0}
          className="flex-1"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Package className="w-4 h-4 mr-2" />
          )}
          Send to Marketplace
        </Button>
      </CardFooter>
    </Card>
  )
}
