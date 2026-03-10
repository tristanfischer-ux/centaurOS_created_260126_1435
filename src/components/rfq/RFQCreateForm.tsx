'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Loader2, Zap, Clock, AlertCircle, HelpCircle, Paperclip } from 'lucide-react'
import { createNewRFQ } from '@/actions/rfq'
import { CreateRFQParams, RFQType, RFQ_CATEGORIES } from '@/types/rfq'
import { RFQFileUpload } from './RFQFileUpload'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  path: string
  uploading?: boolean
  error?: string
}
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert'

interface RFQCreateFormProps {
  className?: string
  onSuccess?: (rfqId: string) => void
  onCancel?: () => void
}

export function RFQCreateForm({
  className,
  onSuccess,
  onCancel,
}: RFQCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [rfqType, setRfqType] = useState<RFQType>('commodity')
  const [description, setDescription] = useState('')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [deadline, setDeadline] = useState('')
  const [category, setCategory] = useState('')
  const [urgency, setUrgency] = useState<'urgent' | 'standard'>('standard')
  const [files, setFiles] = useState<UploadedFile[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    // Check if any files are still uploading
    const uploadingFiles = files.filter(f => f.uploading)
    if (uploadingFiles.length > 0) {
      setError('Please wait for all files to finish uploading')
      return
    }

    // Check for files with errors
    const errorFiles = files.filter(f => f.error)
    if (errorFiles.length > 0) {
      setError('Please remove files with errors before submitting')
      return
    }

    startTransition(async () => {
      // Get successfully uploaded file paths
      const attachmentPaths = files
        .filter(f => f.path && !f.error)
        .map(f => f.path)

      const params: CreateRFQParams = {
        title: title.trim(),
        rfq_type: rfqType,
        specifications: {
          description: description.trim() || undefined,
          attachments: attachmentPaths.length > 0 ? attachmentPaths : undefined,
        },
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

  return (
    <TooltipProvider>
      <Card className={cn('w-full max-w-2xl', className)}>
        <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Create Request for Quote</CardTitle>
          <CardDescription>
            Describe what you need and suppliers will compete to fulfill your request
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
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

          {/* RFQ Type */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label>RFQ Type *</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">Choose your award strategy:</p>
                  <p className="text-xs">Different types suit different needs based on urgency and decision-making preference.</p>
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
                      'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors',
                      rfqType === 'commodity'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    )}
                    disabled={isPending}
                  >
                    <Zap className="w-5 h-5" />
                    <span className="font-medium text-sm">Commodity</span>
                    <span className="text-xs text-muted-foreground text-center">
                      First click wins
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">Commodity Race</p>
                  <p className="text-xs">Best for standard products where speed matters. First supplier to accept automatically wins. Perfect for urgent needs with clear specs.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setRfqType('custom')}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors',
                      rfqType === 'custom'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    )}
                    disabled={isPending}
                  >
                    <Clock className="w-5 h-5" />
                    <span className="font-medium text-sm">Custom</span>
                    <span className="text-xs text-muted-foreground text-center">
                      2hr priority hold
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">Custom Priority Hold</p>
                  <p className="text-xs">First supplier gets 2-hour priority. You review their offer and either accept or release for others to compete. Balances speed with decision control.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setRfqType('service')}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors',
                      rfqType === 'service'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    )}
                    disabled={isPending}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span className="font-medium text-sm">Service</span>
                    <span className="text-xs text-muted-foreground text-center">
                      Review all quotes
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">Service Review</p>
                  <p className="text-xs">Best for complex services requiring careful evaluation. Review all quotes, compare suppliers, and manually select the best fit. No auto-award.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Info alert explaining the selected type */}
            <Alert>
              <AlertDescription className="text-xs">
                {rfqType === 'commodity' && (
                  <span><strong>Commodity:</strong> Fastest option. First supplier to accept your RFQ wins automatically. An order will be created immediately with their quoted price.</span>
                )}
                {rfqType === 'custom' && (
                  <span><strong>Custom:</strong> First supplier gets a 2-hour exclusive window. You can award to them or release the hold to let others compete.</span>
                )}
                {rfqType === 'service' && (
                  <span><strong>Service:</strong> Most flexible. All suppliers can submit quotes, and you manually review and select your preferred supplier.</span>
                )}
              </AlertDescription>
            </Alert>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory} disabled={isPending}>
              <SelectTrigger>
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
            <Label htmlFor="description">Specifications</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your requirements in detail..."
              rows={4}
              disabled={isPending}
              maxLength={5000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/5000
            </p>
          </div>

          {/* Documents Upload */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Supporting Documents</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Upload drawings, specifications, CAD files, or other documents to help suppliers understand your requirements.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <RFQFileUpload
              files={files}
              onFilesChange={setFiles}
              maxFiles={10}
              maxSizeMB={25}
              disabled={isPending}
            />
            {files.length === 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Paperclip className="w-3 h-3" />
                Attach PDFs, images, CAD files (STL, STEP, DXF), or documents
              </p>
            )}
          </div>

          {/* Budget Range */}
          <div className="space-y-2">
            <Label>Budget Range (GBP)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  type="number"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="Min"
                  min={0}
                  step={0.01}
                  disabled={isPending}
                />
              </div>
              <div>
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
                  <p className="font-medium mb-1">When should bidding start?</p>
                  <p className="text-xs"><strong>Standard:</strong> Broadcasts at 9am in each supplier's timezone (better response rates).</p>
                  <p className="text-xs mt-1"><strong>Urgent:</strong> Race starts in 5 minutes (immediate responses).</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setUrgency('standard')}
                    className={cn(
                      'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors',
                      urgency === 'standard'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    )}
                    disabled={isPending}
                  >
                    <Clock className="w-4 h-4" />
                    <span className="font-medium">Standard</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Sends at 9am in each supplier's timezone. Maximizes response rates by reaching suppliers during business hours.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setUrgency('urgent')}
                    className={cn(
                      'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors',
                      urgency === 'urgent'
                        ? 'border-status-warning bg-status-warning-light text-status-warning-dark'
                        : 'border-border hover:border-muted-foreground/50'
                    )}
                    disabled={isPending}
                  >
                    <Zap className="w-4 h-4" />
                    <span className="font-medium">Urgent</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Race opens in 5 minutes. Suppliers notified immediately. Use when you need quick responses.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs text-muted-foreground">
              {urgency === 'urgent'
                ? '⚡ Race opens in 5 minutes - suppliers will compete immediately'
                : '🕐 Race opens at 9am in each supplier\'s timezone for better response rates'}
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isPending}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isPending} className={!onCancel ? 'w-full' : ''}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create RFQ
          </Button>
        </CardFooter>
      </form>
    </Card>
    </TooltipProvider>
  )
}
