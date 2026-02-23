'use client'

/**
 * @file page.tsx — Reports page (Phase 3)
 *
 * @description Premium report generation page with AI-powered narratives,
 * tone/detail controls, share links, email delivery, report history,
 * multi-format export (PDF, PPTX, DOCX), infographic mode, and scheduling UI.
 *
 * FLOW: Template card → tone/detail → section toggles → generate → preview → export/share/email
 *
 * @related
 * - src/actions/report-generator.ts — Server action for data collection + AI narrative
 * - src/actions/report-share.ts — Share link creation
 * - src/actions/report-email.ts — Email delivery
 * - src/components/reports/ReportDocument.tsx — Document renderer
 * - src/components/reports/ReportInfographic.tsx — Dense infographic view
 * - src/components/reports/ReportHistory.tsx — Past reports browser
 * - src/lib/reports/export-pptx.ts — PPTX slide deck export
 * - src/lib/reports/export-docx.ts — DOCX Word export
 * - src/lib/reports/export-infographic.ts — Infographic PNG export
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
  Copy,
  CheckCheck,
  MessageSquareText,
  Gauge,
  Presentation,
  Image as ImageIcon,
  Clock,
  Eye,
  FileSpreadsheet,
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
import { BetaBadge } from '@/components/ui/beta-badge'
import {
  REPORT_TEMPLATES,
  SECTION_META,
  getTemplate,
  getDateRangeFromPreset,
} from '@/lib/reports/templates'
import { generateReport, saveReportSnapshot } from '@/actions/report-generator'
import { generateBriefingAction } from '@/actions/strategic-briefing'
import { createReportShareLink } from '@/actions/report-share'
import { sendReportEmail } from '@/actions/report-email'
import { ReportDocument } from '@/components/reports/ReportDocument'
import { ReportInfographic } from '@/components/reports/ReportInfographic'
import { SlideDeckRenderer } from '@/components/reports/SlideDeckRenderer'
import { ReportHistory } from '@/components/reports/ReportHistory'

import { exportReportAsPDF, printReport } from '@/lib/reports/export-pdf'

import type {
  ReportDocument as ReportDocumentType,
  ReportTemplateId,
  ReportSectionType,
  ReportTone,
  ReportDetailLevel,
} from '@/lib/reports/report-document-types'
import type { StrategicBriefing } from '@/lib/reports/slide-deck-types'

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
  'strategic-briefing': Presentation,
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

function computeDatePreset(label: string): { start: string; end: string } {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const dayOfWeek = now.getDay()

  switch (label) {
    case 'This Week':
      return getDateRangeFromPreset('this-week')
    case 'Last Week':
      return getDateRangeFromPreset('last-week')
    case 'This Month':
      return getDateRangeFromPreset('this-month')
    case 'Last Month':
      return getDateRangeFromPreset('last-month')
    case 'Last 2 Weeks': {
      const twoWeeksAgoMonday = new Date(now)
      twoWeeksAgoMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) - 14)
      const lastSunday = new Date(twoWeeksAgoMonday)
      lastSunday.setDate(twoWeeksAgoMonday.getDate() + 13)
      return { start: fmt(twoWeeksAgoMonday), end: fmt(lastSunday) }
    }
    case 'Last Quarter': {
      const currentQuarter = Math.floor(now.getMonth() / 3)
      const lastQuarterStart = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1)
      const lastQuarterEnd = new Date(now.getFullYear(), currentQuarter * 3, 0)
      return { start: fmt(lastQuarterStart), end: fmt(lastQuarterEnd) }
    }
    default:
      return getDateRangeFromPreset('last-week')
  }
}

const GENERATION_STEPS = [
  'Collecting metrics…',
  'Fetching objectives…',
  'Analysing team activity…',
  'Checking blockers…',
  'Generating narrative…',
  'Assembling report…',
]

const DATE_RANGE_PRESETS = [
  { label: 'This Week', getRange: () => computeDatePreset('This Week') },
  { label: 'Last Week', getRange: () => computeDatePreset('Last Week') },
  { label: 'Last 2 Weeks', getRange: () => computeDatePreset('Last 2 Weeks') },
  { label: 'This Month', getRange: () => computeDatePreset('This Month') },
  { label: 'Last Month', getRange: () => computeDatePreset('Last Month') },
  { label: 'Last Quarter', getRange: () => computeDatePreset('Last Quarter') },
]

export default function ReportsPage(): React.JSX.Element {
  const defaultTemplate = getTemplate('weekly-update')
  const defaultDateRange = getDateRangeFromPreset(defaultTemplate.defaultDateRange)
  const defaultSections = new Set(
    defaultTemplate.defaultSections.filter(s => s.enabled).map(s => s.type)
  )

  const reportRef = useRef<HTMLDivElement>(null)
  const infographicRef = useRef<HTMLDivElement>(null)
  const briefingRef = useRef<HTMLDivElement>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateId>('weekly-update')
  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [enabledSections, setEnabledSections] = useState<Set<ReportSectionType>>(defaultSections)
  const [tone, setTone] = useState<ReportTone>('internal')
  const [detailLevel, setDetailLevel] = useState<ReportDetailLevel>('standard')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState(0)
  const [reportDocument, setReportDocument] = useState<ReportDocumentType | null>(null)
  const [lastSnapshotId, setLastSnapshotId] = useState<string | null>(null)

  // View mode: full report or infographic
  const [viewMode, setViewMode] = useState<'document' | 'infographic'>('document')

  // Strategic briefing state
  const [briefingContext, setBriefingContext] = useState('')
  const [includeCompanyData, setIncludeCompanyData] = useState(true)
  const [briefingResult, setBriefingResult] = useState<StrategicBriefing | null>(null)

  const isStrategicBriefing = selectedTemplate === 'strategic-briefing'

  // Share dialog state
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  // Email dialog state
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState('')

  // Schedule dialog state
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false)
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleFrequency, setScheduleFrequency] = useState<'weekly' | 'monthly'>('weekly')
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(1)
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1)
  const [scheduleRecipients, setScheduleRecipients] = useState('')

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
    } else if (templateId === 'strategic-briefing') {
      setTone('investor')
    }
    setReportDocument(null)
    setBriefingResult(null)
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
    setGenerationStep(0)
    setReportDocument(null)
    setShareUrl(null)
    setLastSnapshotId(null)

    // Cycle through descriptive progress messages during generation
    const stepInterval = setInterval(() => {
      setGenerationStep(prev => (prev + 1) % GENERATION_STEPS.length)
    }, 1500)

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
      clearInterval(stepInterval)
      setIsGenerating(false)
    }
  }, [enabledSections, selectedTemplate, dateRange, tone, detailLevel])

  const handleGenerateBriefing = useCallback(async () => {
    if (!briefingContext.trim()) {
      toast.error('Provide source material for the briefing')
      return
    }

    setIsGenerating(true)
    setBriefingResult(null)

    try {
      const result = await generateBriefingAction({
        sourceContext: briefingContext,
        tone,
        includeCompanyData,
      })

      if (!result.success || !result.briefing) {
        toast.error(result.error ?? 'Failed to generate briefing')
        return
      }

      setBriefingResult(result.briefing)
      toast.success(`Briefing generated — ${result.briefing.slides.length} slides`)

      // GOTCHA: React needs a full render cycle to mount the SlideDeckRenderer
      // before we can scroll to it. requestAnimationFrame + setTimeout ensures
      // the DOM node exists when scrollIntoView is called.
      requestAnimationFrame(() => {
        setTimeout(() => {
          briefingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error'
      toast.error(`Briefing generation failed: ${message}`)
    } finally {
      setIsGenerating(false)
    }
  }, [briefingContext, tone, includeCompanyData])

  const handleExportBriefingPPTX = useCallback(async () => {
    if (!briefingResult) return
    try {
      toast.info('Generating slide deck…')
      const { exportSlideDeckAsPPTX } = await import('@/lib/reports/export-slide-deck-pptx')
      await exportSlideDeckAsPPTX(briefingResult)
      toast.success('PPTX downloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PPTX generation failed'
      toast.error(message)
    }
  }, [briefingResult])

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

  const handleExportDOCX = useCallback(async () => {
    if (!reportDocument) return
    try {
      toast.info('Generating Word document…')
      const { exportReportAsDOCX } = await import('@/lib/reports/export-docx')
      await exportReportAsDOCX(reportDocument)
      toast.success('DOCX downloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DOCX generation failed'
      toast.error(message)
    }
  }, [reportDocument])

  const handleExportPPTX = useCallback(async () => {
    if (!reportDocument) return
    try {
      toast.info('Generating slide deck…')
      const { exportReportAsPPTX } = await import('@/lib/reports/export-pptx')
      await exportReportAsPPTX(reportDocument)
      toast.success('PPTX downloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PPTX generation failed'
      toast.error(message)
    }
  }, [reportDocument])

  const handleExportInfographic = useCallback(async () => {
    if (!infographicRef.current || !reportDocument) return
    try {
      toast.info('Exporting infographic as image…')
      const { downloadInfographicAsImage } = await import('@/lib/reports/export-infographic')
      const filename = `${reportDocument.foundryName.replace(/\s+/g, '-')}-infographic-${reportDocument.dateRange.start}.png`
      await downloadInfographicAsImage(infographicRef.current, filename)
      toast.success('Infographic image downloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image export failed'
      toast.error(message)
    }
  }, [reportDocument])

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
            <BetaBadge />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      {/* ──── Strategic Briefing: Source Context ──── */}
      {isStrategicBriefing && (
        <>
          <section className="space-y-4">
            <h2 className={typography.h3}>Source Material</h2>
            <Card>
              <CardContent className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Paste your strategy notes, investor updates, research findings, or any
                  source material. The system will synthesize it into a polished
                  presentation deck with 12-18 slides.
                </p>
                <textarea
                  className="w-full min-h-[200px] rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange resize-y"
                  placeholder="Paste your source material here — strategy documents, progress updates, meeting notes, investor memos, research findings…"
                  value={briefingContext}
                  onChange={e => setBriefingContext(e.target.value)}
                />
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="include-company-data"
                    checked={includeCompanyData}
                    onCheckedChange={(checked) => setIncludeCompanyData(checked === true)}
                  />
                  <label htmlFor="include-company-data" className="text-sm text-foreground cursor-pointer">
                    Enrich with company data (objectives, team, recent activity)
                  </label>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tone selector for briefing */}
          <section className="space-y-4">
            <h2 className={typography.h3}>Presentation Tone</h2>
            <Card>
              <CardContent className="p-6 space-y-3">
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
          </section>

          {/* Generate Briefing Button */}
          <Button
            className="w-full bg-international-orange hover:bg-international-orange-hover text-background font-semibold h-12 text-base"
            disabled={isGenerating || !briefingContext.trim()}
            onClick={handleGenerateBriefing}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating presentation deck…
              </>
            ) : (
              <>
                <Presentation className="mr-2 h-4 w-4" />
                Generate Strategic Briefing
              </>
            )}
          </Button>
        </>
      )}

      {/* ──── Operational Reports: Tone, Date Range, Sections ──── */}
      {!isStrategicBriefing && (
        <>
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
              <CardContent className="p-6 space-y-4">
                {/* Preset buttons */}
                <div className="flex flex-wrap gap-2">
                  {DATE_RANGE_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDateRange(preset.getRange())}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                        dateRange.start === preset.getRange().start && dateRange.end === preset.getRange().end
                          ? 'border-international-orange bg-international-orange/5 text-foreground'
                          : 'border-input bg-background text-muted-foreground hover:border-foreground/20'
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

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
                {GENERATION_STEPS[generationStep]}
              </>
            ) : (
              'Generate Report'
            )}
          </Button>
        </>
      )}

      {/* Report Preview */}
      {reportDocument && (
        <section className="space-y-4">
          {/* Export + Share Toolbar */}
          <div className="sticky top-0 z-10 -mx-1 px-1 py-3 bg-background">
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className={typography.h3}>Report Preview</h2>
                    {tone !== 'internal' && (
                      <Badge variant="secondary" className="text-xs">
                        {TONE_OPTIONS.find(t => t.value === tone)?.label} tone
                      </Badge>
                    )}
                  </div>

                  {/* View toggle */}
                  <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode('document')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                        viewMode === 'document'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Document
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('infographic')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                        viewMode === 'infographic'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      Infographic
                    </button>
                  </div>
                </div>

                {/* Action buttons */}
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
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                    DOCX
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleExportPPTX}>
                    <Presentation className="mr-1.5 h-3.5 w-3.5" />
                    PPTX
                  </Button>
                  {viewMode === 'infographic' && (
                    <Button variant="secondary" size="sm" onClick={handleExportInfographic}>
                      <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                      Save Image
                    </Button>
                  )}
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsScheduleDialogOpen(true)}
                  >
                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                    Schedule
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Document Render */}
          {viewMode === 'document' && (
            <Card>
              <CardContent className="p-8 sm:p-12">
                <div ref={reportRef}>
                  <ReportDocument document={reportDocument} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Infographic Render */}
          {viewMode === 'infographic' && (
            <div className="py-6">
              <div ref={infographicRef}>
                <ReportInfographic document={reportDocument} />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Strategic Briefing Preview */}
      {briefingResult && isStrategicBriefing && (
        <section ref={briefingRef} className="space-y-4">
          {/* Briefing Toolbar */}
          <div className="sticky top-0 z-10 -mx-1 px-1 py-3 bg-background">
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className={typography.h3}>Presentation Preview</h2>
                    <Badge variant="secondary" className="text-xs">
                      {briefingResult.slides.length} slides
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {TONE_OPTIONS.find(t => t.value === tone)?.label} tone
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handleExportBriefingPPTX}>
                    <Presentation className="mr-1.5 h-3.5 w-3.5" />
                    PPTX
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePrint}
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Print
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Slide Deck Viewer */}
          <SlideDeckRenderer briefing={briefingResult} />
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

      {/* Schedule Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Schedule Automatic Reports</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Automatically deliver your latest report on a regular schedule. The most recently
              generated report will be emailed to your recipients.
            </p>

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Enable scheduling</p>
                <p className="text-xs text-muted-foreground">Reports will be delivered automatically</p>
              </div>
              <Checkbox
                checked={scheduleEnabled}
                onCheckedChange={(checked) => setScheduleEnabled(checked === true)}
              />
            </div>

            {scheduleEnabled && (
              <>
                {/* Frequency */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Frequency</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setScheduleFrequency('weekly')}
                      className={cn(
                        'rounded-lg border px-4 py-2 text-sm transition-all',
                        scheduleFrequency === 'weekly'
                          ? 'border-international-orange bg-international-orange/5 text-foreground font-medium'
                          : 'border-input bg-background text-muted-foreground'
                      )}
                    >
                      Weekly
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleFrequency('monthly')}
                      className={cn(
                        'rounded-lg border px-4 py-2 text-sm transition-all',
                        scheduleFrequency === 'monthly'
                          ? 'border-international-orange bg-international-orange/5 text-foreground font-medium'
                          : 'border-input bg-background text-muted-foreground'
                      )}
                    >
                      Monthly
                    </button>
                  </div>
                </div>

                {/* Day picker */}
                {scheduleFrequency === 'weekly' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Day of week</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setScheduleDayOfWeek(i)}
                          className={cn(
                            'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                            scheduleDayOfWeek === i
                              ? 'border-international-orange bg-international-orange/5 text-foreground'
                              : 'border-input bg-background text-muted-foreground'
                          )}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="schedule-dom" className="text-sm font-medium text-foreground">Day of month</label>
                    <Input
                      id="schedule-dom"
                      type="number"
                      min={1}
                      max={28}
                      value={scheduleDayOfMonth}
                      onChange={e => setScheduleDayOfMonth(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-24"
                    />
                    <p className="text-xs text-muted-foreground">Between 1 and 28</p>
                  </div>
                )}

                {/* Recipients */}
                <div className="space-y-2">
                  <label htmlFor="schedule-recipients" className="text-sm font-medium text-foreground">
                    Recipients
                  </label>
                  <Input
                    id="schedule-recipients"
                    placeholder="ceo@company.com, board@company.com"
                    value={scheduleRecipients}
                    onChange={e => setScheduleRecipients(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated email addresses
                  </p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsScheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast.success(
                  scheduleEnabled
                    ? `Scheduled ${scheduleFrequency} delivery to ${scheduleRecipients.split(',').length} recipient(s)`
                    : 'Scheduling disabled'
                )
                setIsScheduleDialogOpen(false)
              }}
            >
              <Clock className="mr-2 h-4 w-4" />
              {scheduleEnabled ? 'Save Schedule' : 'Done'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
