'use client'

/**
 * @file page.tsx — Reports page (Phase 2)
 *
 * @description Premium report generation page with AI-powered narratives,
 * tone/detail controls, share links, email delivery, and report history.
 *
 * FLOW: Template card → tone/detail → section toggles → generate → preview → share/email
 *
 * @related
 * - src/actions/report-generator.ts — Server action for data collection + AI narrative
 * - src/actions/report-share.ts — Share link creation
 * - src/actions/report-email.ts — Email delivery
 * - src/components/reports/ReportDocument.tsx — Document renderer
 * - src/components/reports/ReportHistory.tsx — Past reports browser
 */

import { useState, useCallback, useRef } from 'react'

import {
  CalendarDays,
  Briefcase,
  Sliders,
  FileDown,
  FileText,
  Loader2,
  Check,
  AlignLeft,
  TrendingUp,
  Target,
  Users,
  AlertTriangle,
  BarChart3,
  Printer,
  Share2,
  Mail,
  Link2,
  Copy,
  CheckCheck,
  MessageSquareText,
  Gauge,
} from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import {
  REPORT_TEMPLATES,
  SECTION_META,
  getTemplate,
  getDateRangeFromPreset,
} from '@/lib/reports/templates'
import { generateReport, saveReportSnapshot } from '@/actions/report-generator'
import { createReportShareLink } from '@/actions/report-share'
import { sendReportEmail } from '@/actions/report-email'
import { ReportDocument } from '@/components/reports/ReportDocument'
import { ReportHistory } from '@/components/reports/ReportHistory'

import { exportReportAsPDF, printReport } from '@/lib/reports/export-pdf'

import type {
  ReportDocument as ReportDocumentType,
  ReportTemplateId,
  ReportSectionType,
  ReportTone,
  ReportDetailLevel,
} from '@/lib/reports/report-document-types'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  AlignLeft,
  TrendingUp,
  Target,
  Users,
  AlertTriangle,
  BarChart3,
  CalendarDays,
}

const TEMPLATE_ICONS: Record<ReportTemplateId, React.ComponentType<{ className?: string }>> = {
  'weekly-update': CalendarDays,
  'board-pack': Briefcase,
  'custom': Sliders,
}

const TONE_OPTIONS: { value: ReportTone; label: string; description: string }[] = [
  { value: 'internal', label: 'Internal', description: 'Casual and team-oriented' },
  { value: 'board', label: 'Board', description: 'Formal and professional' },
  { value: 'investor', label: 'Investor', description: 'Metrics-forward and concise' },
]

const DETAIL_OPTIONS: { value: ReportDetailLevel; label: string; description: string }[] = [
  { value: 'brief', label: 'Brief', description: '1-2 sentences, headlines only' },
  { value: 'standard', label: 'Standard', description: '2-3 paragraphs with context' },
  { value: 'detailed', label: 'Detailed', description: 'Full analysis with metrics' },
]

export default function ReportsPage(): React.JSX.Element {
  const defaultTemplate = getTemplate('weekly-update')
  const defaultDateRange = getDateRangeFromPreset(defaultTemplate.defaultDateRange)
  const defaultSections = new Set(
    defaultTemplate.defaultSections.filter(s => s.enabled).map(s => s.type)
  )

  const reportRef = useRef<HTMLDivElement>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateId>('weekly-update')
  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [enabledSections, setEnabledSections] = useState<Set<ReportSectionType>>(defaultSections)
  const [tone, setTone] = useState<ReportTone>('internal')
  const [detailLevel, setDetailLevel] = useState<ReportDetailLevel>('standard')
  const [isGenerating, setIsGenerating] = useState(false)
  const [reportDocument, setReportDocument] = useState<ReportDocumentType | null>(null)
  const [lastSnapshotId, setLastSnapshotId] = useState<string | null>(null)

  // Share dialog state
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  // Email dialog state
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState('')

  const handleTemplateSelect = useCallback((templateId: ReportTemplateId) => {
    setSelectedTemplate(templateId)
    const template = getTemplate(templateId)
    const range = getDateRangeFromPreset(template.defaultDateRange)
    setDateRange(range)
    setEnabledSections(
      new Set(template.defaultSections.filter(s => s.enabled).map(s => s.type))
    )
    if (templateId === 'board-pack') {
      setTone('board')
      setDetailLevel('standard')
    } else if (templateId === 'weekly-update') {
      setTone('internal')
      setDetailLevel('standard')
    }
    setReportDocument(null)
    setShareUrl(null)
    setLastSnapshotId(null)
  }, [])

  const handleSectionToggle = useCallback((sectionType: ReportSectionType, checked: boolean) => {
    setEnabledSections(prev => {
      const next = new Set(prev)
      if (checked) {
        next.add(sectionType)
      } else {
        next.delete(sectionType)
      }
      return next
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setReportDocument(null)
    setShareUrl(null)
    setLastSnapshotId(null)

    try {
      const sections = Array.from(enabledSections)
      const result = await generateReport({
        templateId: selectedTemplate,
        sections,
        dateRange,
        tone,
        detailLevel,
      })

      if (!result.success || !result.document) {
        toast.error(result.error ?? 'Failed to generate report')
        return
      }

      setReportDocument(result.document)
      toast.success('Report generated successfully')

      saveReportSnapshot(result.document)
        .then((saveResult) => {
          if (saveResult.success && saveResult.snapshotId) {
            setLastSnapshotId(saveResult.snapshotId)
          }
        })
        .catch(err => {
          console.warn('[Reports] Failed to save snapshot:', err)
        })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error'
      toast.error(`Report generation failed: ${message}`)
    } finally {
      setIsGenerating(false)
    }
  }, [enabledSections, selectedTemplate, dateRange, tone, detailLevel])

  const handleExportPDF = useCallback(async () => {
    if (!reportRef.current || !reportDocument) return
    try {
      toast.info('Generating PDF…')
      const filename = `${reportDocument.foundryName.replace(/\s+/g, '-')}-${reportDocument.title.replace(/\s+/g, '-')}-${reportDocument.dateRange.start}.pdf`
      await exportReportAsPDF(reportRef.current, filename)
      toast.success('PDF downloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF generation failed'
      toast.error(message)
    }
  }, [reportDocument])

  const handlePrint = useCallback(() => {
    if (!reportRef.current || !reportDocument) return
    try {
      printReport(reportRef.current, `${reportDocument.foundryName} — ${reportDocument.title}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print failed'
      toast.error(message)
    }
  }, [reportDocument])

  const handleExportDOCX = useCallback(() => {
    toast.info('DOCX export coming soon — use Print for the best quality output')
  }, [])

  const handleCreateShareLink = useCallback(async () => {
    if (!lastSnapshotId) {
      toast.error('Report must be saved before sharing')
      return
    }
    setIsCreatingShareLink(true)
    try {
      const result = await createReportShareLink(lastSnapshotId)
      if (result.success && result.shareUrl) {
        setShareUrl(result.shareUrl)
        setIsShareDialogOpen(true)
      } else {
        toast.error(result.error ?? 'Failed to create share link')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create share link'
      toast.error(message)
    } finally {
      setIsCreatingShareLink(false)
    }
  }, [lastSnapshotId])

  const handleCopyShareLink = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setIsCopied(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }, [shareUrl])

  const handleSendEmail = useCallback(async () => {
    if (!reportDocument) return
    const recipients = emailRecipients
      .split(/[,;\s]+/)
      .map(e => e.trim())
      .filter(Boolean)

    if (recipients.length === 0) {
      toast.error('Enter at least one email address')
      return
    }

    setIsSendingEmail(true)
    try {
      const result = await sendReportEmail(recipients, reportDocument, shareUrl ?? undefined)
      if (result.success) {
        toast.success(`Report sent to ${result.sentCount} recipient${result.sentCount !== 1 ? 's' : ''}`)
        setIsEmailDialogOpen(false)
        setEmailRecipients('')
      } else {
        toast.error(result.error ?? 'Failed to send email')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send email'
      toast.error(message)
    } finally {
      setIsSendingEmail(false)
    }
  }, [reportDocument, emailRecipients, shareUrl])

  const handleLoadHistoricReport = useCallback((document: ReportDocumentType) => {
    setReportDocument(document)
    toast.success('Report loaded from history')
    setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [])

  const allSectionTypes = getTemplate(selectedTemplate).defaultSections
    .sort((a, b) => a.order - b.order)
    .map(s => s.type)

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Reports</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Generate polished reports from your live data — ready to share with your team, board, or investors.
          </p>
        </div>
      </div>

      {/* Report History */}
      <ReportHistory onLoadReport={handleLoadHistoricReport} />

      {/* Template Selector */}
      <section className="space-y-4">
        <h2 className={typography.h3}>Choose a Template</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {REPORT_TEMPLATES.map(template => {
            const isSelected = selectedTemplate === template.id
            const TemplateIcon = TEMPLATE_ICONS[template.id]

            return (
              <Card
                key={template.id}
                className={cn(
                  'cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5',
                  isSelected && 'ring-2 ring-international-orange'
                )}
                onClick={() => handleTemplateSelect(template.id)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg',
                      isSelected ? 'bg-international-orange/10' : 'bg-muted'
                    )}>
                      <TemplateIcon className={cn(
                        'h-5 w-5',
                        isSelected ? 'text-international-orange' : 'text-muted-foreground'
                      )} />
                    </div>

                    {isSelected && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-international-orange">
                        <Check className="h-3.5 w-3.5 text-background" />
                      </div>
                    )}
                  </div>

                  <h3 className="mt-4 font-display font-semibold text-foreground">
                    {template.name}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {template.description}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* Tone & Detail Controls */}
      <section className="space-y-4">
        <h2 className={typography.h3}>Narrative Style</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tone Selector */}
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Tone</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTone(option.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm transition-all',
                      tone === option.value
                        ? 'border-international-orange bg-international-orange/5 text-foreground font-medium'
                        : 'border-input bg-background text-muted-foreground hover:border-foreground/20'
                    )}
                  >
                    <span className="block">{option.label}</span>
                    <span className="block text-xs opacity-70">{option.description}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Detail Level Selector */}
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Detail Level</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {DETAIL_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDetailLevel(option.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm transition-all',
                      detailLevel === option.value
                        ? 'border-international-orange bg-international-orange/5 text-foreground font-medium'
                        : 'border-input bg-background text-muted-foreground hover:border-foreground/20'
                    )}
                  >
                    <span className="block">{option.label}</span>
                    <span className="block text-xs opacity-70">{option.description}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Date Range */}
      <section className="space-y-4">
        <h2 className={typography.h3}>Date Range</h2>
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="w-full sm:flex-1">
                <label htmlFor="date-start" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Start
                </label>
                <Input
                  id="date-start"
                  type="date"
                  value={dateRange.start}
                  onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>
              <span className="hidden sm:block text-sm text-muted-foreground pt-5">to</span>
              <div className="w-full sm:flex-1">
                <label htmlFor="date-end" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  End
                </label>
                <Input
                  id="date-end"
                  type="date"
                  value={dateRange.end}
                  onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section Toggles */}
      <section className="space-y-4">
        <h2 className={typography.h3}>Sections</h2>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-1">
              {allSectionTypes.map(sectionType => {
                const meta = SECTION_META[sectionType]
                const isCover = sectionType === 'cover'
                const isEnabled = enabledSections.has(sectionType)
                const SectionIcon = ICON_MAP[meta.icon]

                return (
                  <label
                    key={sectionType}
                    className={cn(
                      'flex items-center gap-4 rounded-lg px-3 py-3 transition-colors',
                      !isCover && 'cursor-pointer hover:bg-muted/50',
                      isCover && 'opacity-80'
                    )}
                  >
                    <Checkbox
                      checked={isEnabled}
                      disabled={isCover}
                      onCheckedChange={(checked) => {
                        if (!isCover) handleSectionToggle(sectionType, checked === true)
                      }}
                    />

                    {SectionIcon && (
                      <SectionIcon className={cn(
                        'h-4 w-4 shrink-0',
                        isEnabled ? 'text-foreground' : 'text-muted-foreground'
                      )} />
                    )}

                    <div className="min-w-0 flex-1">
                      <span className={cn(
                        'block text-sm font-medium',
                        isEnabled ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {meta.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {meta.description}
                      </span>
                    </div>

                    {isCover && (
                      <span className="text-xs text-muted-foreground">Always included</span>
                    )}
                  </label>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Generate Button */}
      <Button
        className="w-full bg-international-orange hover:bg-international-orange-hover text-background font-semibold h-12 text-base"
        disabled={isGenerating || enabledSections.size === 0}
        onClick={handleGenerate}
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating report with narrative…
          </>
        ) : (
          'Generate Report'
        )}
      </Button>

      {/* Report Preview */}
      {reportDocument && (
        <section className="space-y-4">
          {/* Export + Share Toolbar */}
          <div className="sticky top-0 z-10 -mx-1 px-1 py-3 bg-background">
            <Card>
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                  <h2 className={typography.h3}>Report Preview</h2>
                  {tone !== 'internal' && (
                    <Badge variant="secondary" className="text-xs">
                      {TONE_OPTIONS.find(t => t.value === tone)?.label} tone
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handlePrint}>
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Print
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleExportPDF}>
                    <FileDown className="mr-1.5 h-3.5 w-3.5" />
                    PDF
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleExportDOCX}>
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    DOCX
                  </Button>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCreateShareLink}
                    disabled={isCreatingShareLink || !lastSnapshotId}
                  >
                    {isCreatingShareLink ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Share2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Share
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEmailDialogOpen(true)}
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                    Email
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Document Render */}
          <Card>
            <CardContent className="p-8 sm:p-12">
              <div ref={reportRef}>
                <ReportDocument document={reportDocument} />
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Share Link Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Share Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Anyone with this link can view the report. The link expires in 30 days.
            </p>
            {shareUrl && (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border bg-muted/50 px-3 py-2.5">
                  <p className="truncate text-sm font-mono text-foreground">{shareUrl}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={handleCopyShareLink}>
                  {isCopied ? (
                    <CheckCheck className="h-4 w-4 text-status-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsShareDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Email Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Send a beautifully formatted email with the executive summary and key metrics.
              {shareUrl && ' Recipients will also get a link to the full report.'}
            </p>
            <div>
              <label htmlFor="email-recipients" className="mb-1.5 block text-sm font-medium text-foreground">
                Recipients
              </label>
              <Input
                id="email-recipients"
                placeholder="Enter email addresses, separated by commas"
                value={emailRecipients}
                onChange={e => setEmailRecipients(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Separate multiple addresses with commas
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsEmailDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={isSendingEmail || !emailRecipients.trim()}
            >
              {isSendingEmail ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Report
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
