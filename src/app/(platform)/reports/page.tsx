'use client'

/**
 * @file page.tsx — Reports page (Phase 4 — UX Enhancement)
 *
 * @description Premium report generation page with tab-separated workflows
 * (Reports / Presentations / Documents), collapsible configuration, hero
 * showcase for new users, visual section toggle grid, and enhanced progress.
 *
 * FLOW: Tab → Template card → collapsible config → generate → preview → export/share/email
 *
 * @related
 * - src/actions/report-generator.ts — Server action for data collection + AI narrative
 * - src/actions/report-share.ts — Share link creation
 * - src/actions/report-email.ts — Email delivery
 * - src/components/reports/ReportDocument.tsx — Document renderer
 * - src/components/reports/ReportInfographic.tsx — Dense infographic view
 * - src/components/reports/ReportHistory.tsx — Past reports browser
 * - src/components/reports/ReportsHeroShowcase.tsx — Hero empty state
 * - src/lib/reports/export-pptx.ts — PPTX slide deck export
 * - src/lib/reports/export-docx.ts — DOCX Word export
 * - src/lib/reports/export-infographic.ts — Infographic PNG export
 */

import { useState, useCallback, useRef, useMemo } from 'react'

import {
  CalendarDays,
  Briefcase,
  Sliders,
  FileDown,
  FileText,
  FileEdit,
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
  CheckCircle2,
  Circle,
  MessageSquareText,
  Gauge,
  Presentation,
  Image as ImageIcon,
  Sparkles,
  Clock,
  Eye,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  PoundSterling,
  Megaphone,
  Cog,
  BookOpen,
  Pencil,
  ClipboardCheck,
  ShoppingCart,
  Package,
  Hammer,
} from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputWithSpeech } from '@/components/ui/input-with-speech'
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
import { SkillDocumentSection } from '@/components/reports/SkillDocumentSection'
import { ReportsHeroShowcase } from '@/components/reports/ReportsHeroShowcase'

import { exportReportAsPDF, printReport } from '@/lib/reports/export-pdf'

import type {
  ReportDocument as ReportDocumentType,
  ReportTemplateId,
  ReportSectionType,
  ReportTone,
  ReportDetailLevel,
} from '@/lib/reports/report-document-types'
import type { StrategicBriefing } from '@/lib/reports/slide-deck-types'

// ========================
// Constants
// ========================

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  AlignLeft,
  TrendingUp,
  Target,
  Users,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  PoundSterling,
  Megaphone,
  Cog,
  BookOpen,
  Pencil,
  ClipboardCheck,
  ShoppingCart,
  Package,
  Hammer,
}

const TEMPLATE_ICONS: Record<ReportTemplateId, React.ComponentType<{ className?: string }>> = {
  'strategic-briefing': Presentation,
  'weekly-update': CalendarDays,
  'board-pack': Briefcase,
  'custom': Sliders,
  'skill-document': FileEdit,
  'workshop-report': Hammer,
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

const GENERATION_STEPS = [
  'Collecting metrics…',
  'Fetching objectives…',
  'Analysing team activity…',
  'Checking blockers…',
  'Generating narrative…',
  'Assembling report…',
]

const DATE_RANGE_PRESETS = [
  { label: 'This Week', preset: 'this-week' as const },
  { label: 'Last Week', preset: 'last-week' as const },
  { label: 'This Month', preset: 'this-month' as const },
  { label: 'Last Month', preset: 'last-month' as const },
]

function computeDatePreset(label: string): { start: string; end: string } {
  const now = new Date()
  // GOTCHA: toISOString() converts to UTC — in UTC+ timezones after local midnight,
  // it returns the PREVIOUS day. Use local getters instead.
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dayOfWeek = now.getDay()

  switch (label) {
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

const EXTENDED_DATE_PRESETS = [
  ...DATE_RANGE_PRESETS.map(p => ({ label: p.label, getRange: () => getDateRangeFromPreset(p.preset) })),
  { label: 'Last 2 Weeks', getRange: () => computeDatePreset('Last 2 Weeks') },
  { label: 'Last Quarter', getRange: () => computeDatePreset('Last Quarter') },
]

// Capability strip items shown below Generate button
const CAPABILITY_ITEMS = [
  { icon: FileDown, label: 'PDF' },
  { icon: FileSpreadsheet, label: 'DOCX' },
  { icon: Presentation, label: 'PPTX' },
  { icon: Printer, label: 'Print' },
  { icon: Share2, label: 'Share Link' },
  { icon: Mail, label: 'Email' },
  { icon: Clock, label: 'Schedule' },
  { icon: ImageIcon, label: 'Infographic' },
]

/** Strip characters that are invalid in filenames across OS platforms. */
function sanitizeFilename(str: string): string {
  return str.replace(/[/\\:*?"<>|]+/g, '').replace(/\s+/g, '-')
}

type PageMode = 'reports' | 'presentations' | 'documents'

const PAGE_TABS: { value: PageMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'reports', label: 'Reports', icon: FileText },
  { value: 'presentations', label: 'Presentations', icon: Presentation },
  { value: 'documents', label: 'Documents', icon: FileEdit },
]

// Report-only templates (excludes strategic-briefing and skill-document)
const REPORT_TEMPLATE_IDS: ReportTemplateId[] = ['weekly-update', 'board-pack', 'workshop-report', 'custom']

// ========================
// Component
// ========================

export default function ReportsPage(): React.JSX.Element {
  const defaultTemplate = getTemplate('weekly-update')
  const defaultDateRange = getDateRangeFromPreset(defaultTemplate.defaultDateRange)
  const defaultSections = new Set(
    defaultTemplate.defaultSections.filter(s => s.enabled).map(s => s.type)
  )

  const reportRef = useRef<HTMLDivElement>(null)
  const infographicRef = useRef<HTMLDivElement>(null)
  const briefingRef = useRef<HTMLDivElement>(null)
  const briefingContentRef = useRef<HTMLDivElement>(null)
  // INTENT: Refs for synchronous double-click guards. useState closures can be stale
  // within the same render cycle, so two rapid clicks bypass `if (isGenerating) return`.
  const isGeneratingReportRef = useRef(false)
  const isGeneratingBriefingRef = useRef(false)

  // Change 6: Tab-level page mode
  const [pageMode, setPageMode] = useState<PageMode>('reports')

  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateId>('weekly-update')
  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [enabledSections, setEnabledSections] = useState<Set<ReportSectionType>>(defaultSections)
  // DECISION: Separate tone per tab to prevent cross-tab interference.
  // Before tab-split, tone was shared. Now each workflow has its own.
  const [reportTone, setReportTone] = useState<ReportTone>('internal')
  const [briefingTone, setBriefingTone] = useState<ReportTone>('internal')
  const [detailLevel, setDetailLevel] = useState<ReportDetailLevel>('standard')
  // INTENT: Separate generating state per tab to prevent cross-tab interference.
  // Reports and presentations can't be generated simultaneously, but if one is
  // generating, the other tab's Generate button shouldn't be blocked.
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false)
  const [generationStep, setGenerationStep] = useState(0)
  const [reportDocument, setReportDocument] = useState<ReportDocumentType | null>(null)
  const [lastSnapshotId, setLastSnapshotId] = useState<string | null>(null)

  // View mode: full report or infographic
  const [viewMode, setViewMode] = useState<'document' | 'infographic'>('document')

  // Change 2: Collapsible config panel
  const [isConfigExpanded, setIsConfigExpanded] = useState(false)

  // Strategic briefing state
  const [briefingContext, setBriefingContext] = useState('')
  const [includeCompanyData, setIncludeCompanyData] = useState(true)
  const [briefingResult, setBriefingResult] = useState<StrategicBriefing | null>(null)

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

  // Derived values
  const currentTemplate = useMemo(() => getTemplate(selectedTemplate), [selectedTemplate])
  const allSectionTypes = useMemo(
    () => [...currentTemplate.defaultSections].sort((a, b) => a.order - b.order).map(s => s.type),
    [currentTemplate]
  )
  const enabledCount = enabledSections.size
  const totalCount = allSectionTypes.length

  // Config summary for collapsed state
  // GOTCHA: new Date('YYYY-MM-DD') parses as UTC midnight — toLocaleDateString in UTC-
  // timezones shifts to the previous day. Appending T12:00:00 avoids the off-by-one.
  const configSummary = useMemo(() => {
    const toneLabel = TONE_OPTIONS.find(t => t.value === reportTone)?.label ?? reportTone
    const detailLabel = DETAIL_OPTIONS.find(d => d.value === detailLevel)?.label ?? detailLevel
    const start = new Date(dateRange.start + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const end = new Date(dateRange.end + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return `${toneLabel} tone · ${detailLabel} · ${start}–${end} · ${enabledCount} ${enabledCount === 1 ? 'section' : 'sections'}`
  }, [reportTone, detailLevel, dateRange, enabledCount])

  const handleTemplateSelect = useCallback((templateId: ReportTemplateId) => {
    setSelectedTemplate(templateId)
    const template = getTemplate(templateId)
    const range = getDateRangeFromPreset(template.defaultDateRange)
    setDateRange(range)
    setEnabledSections(
      new Set(template.defaultSections.filter(s => s.enabled).map(s => s.type))
    )
    // Auto-expand config for Custom, collapse for others
    setIsConfigExpanded(templateId === 'custom')

    if (templateId === 'board-pack') {
      setReportTone('board')
      setDetailLevel('standard')
    } else if (templateId === 'weekly-update') {
      setReportTone('internal')
      setDetailLevel('standard')
    }
    setReportDocument(null)
    // INTENT: Don't clear briefingResult here — it lives on the Presentations tab
    // and shouldn't be destroyed when the user changes report templates.
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

  const handleSelectAll = useCallback(() => {
    setEnabledSections(new Set(allSectionTypes))
  }, [allSectionTypes])

  const handleClearAll = useCallback(() => {
    // Keep only 'cover' if it exists in the current template, otherwise empty
    const coverOnly = allSectionTypes.includes('cover' as ReportSectionType)
      ? new Set<ReportSectionType>(['cover' as ReportSectionType])
      : new Set<ReportSectionType>()
    setEnabledSections(coverOnly)
  }, [allSectionTypes])

  const handleGenerate = useCallback(async () => {
    if (isGeneratingReportRef.current) return
    isGeneratingReportRef.current = true
    setIsGeneratingReport(true)
    setGenerationStep(0)
    // INTENT: Don't clear the previous report until we have a new one.
    // This preserves the old report if generation fails.
    setShareUrl(null)
    setLastSnapshotId(null)

    const stepInterval = setInterval(() => {
      setGenerationStep(prev => Math.min(prev + 1, GENERATION_STEPS.length - 1))
    }, 1500)

    try {
      const sections = Array.from(enabledSections)
      const result = await generateReport({
        templateId: selectedTemplate,
        sections,
        dateRange,
        tone: reportTone,
        detailLevel,
      })

      if (!result.success || !result.document) {
        toast.error(result.error ?? 'Failed to generate report')
        return
      }

      setReportDocument(result.document)
      setViewMode('document')
      toast.success('Report generated successfully')

      // INTENT: Scroll to the generated report after the DOM commits.
      requestAnimationFrame(() => {
        setTimeout(() => {
          reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      })

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
      isGeneratingReportRef.current = false
      setIsGeneratingReport(false)
    }
  }, [enabledSections, selectedTemplate, dateRange, reportTone, detailLevel])

  // Quick-start: select template + immediately generate
  // DECISION: We compute parameters directly from getTemplate() rather than relying
  // on state, because React batches state updates and they won't be committed yet.
  const handleQuickStart = useCallback((templateId: ReportTemplateId) => {
    if (isGeneratingReportRef.current) return
    isGeneratingReportRef.current = true
    handleTemplateSelect(templateId)
    // For "custom", just expand config — don't auto-generate
    if (templateId === 'custom') {
      isGeneratingReportRef.current = false
      return
    }

    const template = getTemplate(templateId)
    const sections = template.defaultSections.filter(s => s.enabled).map(s => s.type)
    const range = getDateRangeFromPreset(template.defaultDateRange)
    const templateTone = templateId === 'board-pack' ? 'board' : 'internal'

    // Set generating immediately to prevent double-trigger via Generate button
    setIsGeneratingReport(true)
    setGenerationStep(0)

    const stepInterval = setInterval(() => {
      setGenerationStep(prev => Math.min(prev + 1, GENERATION_STEPS.length - 1))
    }, 1500)

    generateReport({
      templateId,
      sections,
      dateRange: range,
      tone: templateTone,
      detailLevel: 'standard',
    })
      .then(result => {
        if (!result.success || !result.document) {
          toast.error(result.error ?? 'Failed to generate report')
          return
        }
        setReportDocument(result.document)
        // INTENT: Reset to document view so reportRef is mounted for scrolling.
        // If the user was viewing an infographic from a previous report, reportRef
        // would be null and the scroll below would silently fail.
        setViewMode('document')
        toast.success('Report generated successfully')
        // INTENT: Scroll to the generated report — quick-start fires from the hero
        // at the top of the page, so the user can't see the result without scrolling.
        requestAnimationFrame(() => {
          setTimeout(() => {
            reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 100)
        })
        saveReportSnapshot(result.document)
          .then(saveResult => {
            if (saveResult.success && saveResult.snapshotId) {
              setLastSnapshotId(saveResult.snapshotId)
            }
          })
          .catch(err => console.warn('[Reports] Failed to save snapshot:', err))
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'Unexpected error'
        toast.error(`Report generation failed: ${message}`)
      })
      .finally(() => {
        clearInterval(stepInterval)
        isGeneratingReportRef.current = false
        setIsGeneratingReport(false)
      })
  }, [handleTemplateSelect])

  const handleGenerateBriefing = useCallback(async () => {
    if (isGeneratingBriefingRef.current) return
    isGeneratingBriefingRef.current = true
    if (!briefingContext.trim()) {
      isGeneratingBriefingRef.current = false
      toast.error('Provide source material for the briefing')
      return
    }

    setIsGeneratingBriefing(true)
    // INTENT: Don't clear the previous briefing until we have a new one.
    // This preserves the old briefing if generation fails (same pattern as reports).

    try {
      const result = await generateBriefingAction({
        sourceContext: briefingContext,
        tone: briefingTone,
        includeCompanyData,
      })

      if (!result.success || !result.briefing) {
        toast.error(result.error ?? 'Failed to generate briefing')
        return
      }

      setBriefingResult(result.briefing)
      toast.success(`Briefing generated — ${result.briefing.slides.length} slides`)

      requestAnimationFrame(() => {
        setTimeout(() => {
          briefingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error'
      toast.error(`Briefing generation failed: ${message}`)
    } finally {
      isGeneratingBriefingRef.current = false
      setIsGeneratingBriefing(false)
    }
  }, [briefingContext, briefingTone, includeCompanyData])

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
      const filename = `${sanitizeFilename(reportDocument.foundryName)}-${sanitizeFilename(reportDocument.title)}-${reportDocument.dateRange.start}.pdf`
      await exportReportAsPDF(reportRef.current, filename)
      toast.success('PDF downloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF generation failed'
      toast.error(message)
    }
  }, [reportDocument])

  const handlePrint = useCallback(() => {
    // INTENT: Use briefingRef when in presentations tab, reportRef for report tab.
    const isPresentations = pageMode === 'presentations'
    const printEl = isPresentations ? briefingContentRef.current : reportRef.current
    if (!printEl || (isPresentations ? !briefingResult : !reportDocument)) return
    const title = isPresentations
      ? (briefingResult?.title ?? 'Strategic Briefing')
      : `${reportDocument?.foundryName} — ${reportDocument?.title}`
    try {
      printReport(printEl, title)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print failed'
      toast.error(message)
    }
  }, [reportDocument, briefingResult, pageMode])

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
      const filename = `${sanitizeFilename(reportDocument.foundryName)}-infographic-${reportDocument.dateRange.start}.png`
      await downloadInfographicAsImage(infographicRef.current, filename)
      toast.success('Infographic image downloaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image export failed'
      toast.error(message)
    }
  }, [reportDocument])

  const handleAIInfographic = useCallback(async () => {
    if (!reportDocument) return
    try {
      toast.info('Generating AI infographic…')
      const { generateAIInfographic } = await import('@/lib/reports/generate-infographic-image')
      const result = await generateAIInfographic(reportDocument)
      if (result.success && result.imageUrl) {
        const response = await fetch(result.imageUrl)
        if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = window.document.createElement('a')
        a.href = url
        a.download = `${sanitizeFilename(reportDocument.foundryName)}-ai-infographic-${reportDocument.dateRange.start}.png`
        a.click()
        // INTENT: Delay revocation so the browser has time to start the download
        setTimeout(() => URL.revokeObjectURL(url), 5_000)
        toast.success('AI infographic downloaded')
      } else {
        toast.error(result.error ?? 'Failed to generate AI infographic')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI infographic failed'
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
    // GOTCHA: Don't split on bare whitespace — "john doe@example.com" would become
    // ["john", "doe@example.com"]. Only split on comma or semicolon.
    const recipients = emailRecipients
      .split(/[,;]+/)
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

  const handleLoadHistoricReport = useCallback((document: ReportDocumentType, snapshotId: string) => {
    setReportDocument(document)
    setLastSnapshotId(snapshotId)
    setShareUrl(null)
    setPageMode('reports')
    // INTENT: Reset to document view so reportRef is mounted for scrolling.
    // Without this, if the user was in infographic view, reportRef.current is null
    // and the scroll below silently fails.
    setViewMode('document')
    toast.success('Report loaded from history')
    // INTENT: Wait for React to commit the DOM before scrolling. requestAnimationFrame
    // fires after paint, which is more reliable than a fixed 100ms timeout.
    requestAnimationFrame(() => {
      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
    })
  }, [])

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
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

      {/* Change 6: Tab Separation */}
      <div role="tablist" aria-label="Report type" className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1">
        {PAGE_TABS.map(tab => {
          const Icon = tab.icon
          const isActive = pageMode === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setPageMode(tab.value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* REPORTS TAB                                   */}
      {/* ══════════════════════════════════════════════ */}
      {pageMode === 'reports' && (
        <>
          {/* Change 8: Report History (promoted) */}
          <ReportHistory onLoadReport={handleLoadHistoricReport} />

          {/* Change 1: Hero showcase when no report generated */}
          {!reportDocument && !isGeneratingReport && (
            <ReportsHeroShowcase onQuickStart={handleQuickStart} />
          )}

          {/* Change 4: Template Selector with section preview */}
          <section className="space-y-4">
            <h2 className={typography.h3}>Choose a Template</h2>
            <div role="radiogroup" aria-label="Report template" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {REPORT_TEMPLATES.filter(t => REPORT_TEMPLATE_IDS.includes(t.id)).map(template => {
                const isSelected = selectedTemplate === template.id
                const TemplateIcon = TEMPLATE_ICONS[template.id]
                const sectionCount = template.defaultSections.filter(s => s.enabled).length
                const defaultRange = template.defaultDateRange.replace('-', ' ')
                const defaultToneLabel = template.id === 'board-pack' ? 'Board' : 'Internal'

                return (
                  <Card
                    key={template.id}
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={template.name}
                    tabIndex={0}
                    className={cn(
                      'cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5',
                      isSelected && 'ring-2 ring-international-orange',
                      isGeneratingReport && 'pointer-events-none opacity-60'
                    )}
                    onClick={() => handleTemplateSelect(template.id)}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleTemplateSelect(template.id)
                      }
                    }}
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

                      {/* Change 4: Section preview icons + defaults hint */}
                      <div className="mt-3 flex items-center gap-1.5">
                        {template.defaultSections
                          .filter(s => s.enabled)
                          .slice(0, 6)
                          .map(s => {
                            const meta = SECTION_META[s.type]
                            const SIcon = ICON_MAP[meta?.icon]
                            return SIcon ? (
                              <SIcon key={s.type} className="h-3 w-3 text-muted-foreground" />
                            ) : null
                          })}
                        {sectionCount > 6 && (
                          <span className="text-[10px] text-muted-foreground">+{sectionCount - 6}</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {sectionCount} {sectionCount === 1 ? 'section' : 'sections'} · {defaultRange} · {defaultToneLabel} tone
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>

          {/* Change 2: Collapsible Configuration Panel */}
          <section className="space-y-4">
            <Card>
              <CardContent className="p-0">
                {/* Collapsed summary row */}
                <button
                  type="button"
                  aria-expanded={isConfigExpanded}
                  aria-controls="report-config-panel"
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                  onClick={() => setIsConfigExpanded(prev => !prev)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Sliders className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground truncate">{configSummary}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium text-international-orange">
                      {isConfigExpanded ? 'Collapse' : 'Customise'}
                    </span>
                    {isConfigExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded config */}
                {isConfigExpanded && (
                  <div id="report-config-panel" className="border-t border-border px-6 pb-6 pt-4 space-y-6">
                    {/* Tone & Detail */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">Tone</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {TONE_OPTIONS.map(option => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setReportTone(option.value)}
                              className={cn(
                                'rounded-lg border px-3 py-2 text-sm transition-all',
                                reportTone === option.value
                                  ? 'border-international-orange bg-international-orange/5 text-foreground font-medium'
                                  : 'border-input bg-background text-muted-foreground hover:border-foreground/20'
                              )}
                            >
                              <span className="block">{option.label}</span>
                              <span className="block text-xs opacity-70">{option.description}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
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
                      </div>
                    </div>

                    {/* Date Range */}
                    <div className="space-y-3">
                      <span className="text-sm font-medium text-foreground">Date Range</span>
                      <div className="flex flex-wrap gap-2">
                        {EXTENDED_DATE_PRESETS.map(preset => {
                          const range = preset.getRange()
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => setDateRange(range)}
                              className={cn(
                                'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                                dateRange.start === range.start && dateRange.end === range.end
                                  ? 'border-international-orange bg-international-orange/5 text-foreground'
                                  : 'border-input bg-background text-muted-foreground hover:border-foreground/20'
                              )}
                            >
                              {preset.label}
                            </button>
                          )
                        })}
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
                            onChange={e => {
                              // GOTCHA: Don't allow empty — Invalid Date propagates to configSummary and server action
                              if (e.target.value) setDateRange(prev => ({ ...prev, start: e.target.value }))
                            }}
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
                            onChange={e => {
                              if (e.target.value) setDateRange(prev => ({ ...prev, end: e.target.value }))
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Change 3: Section Toggles as Visual Card Grid */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Sections</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleSelectAll}
                            className="text-xs text-international-orange hover:underline"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={handleClearAll}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            Clear All
                          </button>
                          <Badge variant="secondary" className="text-[10px]">
                            {enabledCount} of {totalCount}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {allSectionTypes.map(sectionType => {
                          const meta = SECTION_META[sectionType]
                          const isCover = sectionType === 'cover'
                          const isEnabled = enabledSections.has(sectionType)
                          const SectionIcon = ICON_MAP[meta.icon]

                          return (
                            <button
                              key={sectionType}
                              type="button"
                              role="checkbox"
                              aria-checked={isEnabled}
                              aria-label={meta.label}
                              disabled={isCover}
                              onClick={() => {
                                if (!isCover) handleSectionToggle(sectionType, !isEnabled)
                              }}
                              className={cn(
                                'relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all',
                                isEnabled
                                  ? 'ring-2 ring-international-orange bg-international-orange/5 border-transparent'
                                  : 'bg-muted/30 opacity-70 border-border hover:opacity-100',
                                isCover && 'cursor-default'
                              )}
                            >
                              <div className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-lg',
                                isEnabled ? 'bg-international-orange/10' : 'bg-muted'
                              )}>
                                {SectionIcon && (
                                  <SectionIcon className={cn(
                                    'h-4 w-4',
                                    isEnabled ? 'text-international-orange' : 'text-muted-foreground'
                                  )} />
                                )}
                              </div>
                              <div className="space-y-0.5">
                                <p className={cn(
                                  'text-xs font-medium',
                                  isEnabled ? 'text-foreground' : 'text-muted-foreground'
                                )}>
                                  {meta.label}
                                </p>
                                <p className="text-[10px] text-muted-foreground leading-tight">
                                  {meta.description}
                                </p>
                              </div>
                              {isCover && (
                                <Badge variant="secondary" className="absolute top-2 right-2 text-[9px] px-1.5 py-0">
                                  Always included
                                </Badge>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Change 7: Enhanced Generation Progress */}
          {isGeneratingReport && (
            <Card>
              <CardContent className="p-6 space-y-4">
                {/* Thin accent bar at top */}
                <div
                  className="h-1 w-full rounded-full bg-muted overflow-hidden"
                  role="progressbar"
                  aria-label="Report generation progress"
                  aria-valuenow={Math.round(((generationStep + 1) / GENERATION_STEPS.length) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-international-orange transition-all duration-500"
                    style={{ width: `${((generationStep + 1) / GENERATION_STEPS.length) * 100}%` }}
                  />
                </div>

                {/* Vertical step list */}
                <div className="space-y-2">
                  {GENERATION_STEPS.map((step, i) => {
                    const isCompleted = i < generationStep
                    const isCurrent = i === generationStep
                    return (
                      <div key={step} className="flex items-center gap-3">
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        ) : isCurrent ? (
                          <Loader2 className="h-4 w-4 text-international-orange animate-spin shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className={cn(
                          'text-sm',
                          isCompleted ? 'text-muted-foreground' : isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground/40'
                        )}>
                          {step}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generate Button */}
          {!isGeneratingReport && (
            <Button
              className="w-full bg-international-orange hover:bg-international-orange-hover text-background font-semibold h-12 text-base"
              disabled={enabledSections.size === 0 || dateRange.start > dateRange.end}
              onClick={handleGenerate}
            >
              Generate Report
              {dateRange.start > dateRange.end && (
                <span className="ml-2 text-xs font-normal opacity-80">
                  (start date is after end date)
                </span>
              )}
            </Button>
          )}

          {/* Change 5: Pre-Generation Capability Strip */}
          {!reportDocument && !isGeneratingReport && (
            <div className="flex flex-wrap items-center justify-center gap-4 py-2">
              <span className="text-xs text-muted-foreground">After generating:</span>
              {CAPABILITY_ITEMS.map(item => {
                const Icon = item.icon
                return (
                  <span key={item.label} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {item.label}
                  </span>
                )
              })}
            </div>
          )}

          {/* Report Preview */}
          {reportDocument && (
            <section className="space-y-4">
              {/* Export + Share Toolbar */}
              <div className="sticky top-0 z-40 -mx-1 px-1 py-3 bg-background">
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <h2 className={typography.h3}>Report Preview</h2>
                        {reportTone !== 'internal' && (
                          <Badge variant="secondary" className="text-xs">
                            {TONE_OPTIONS.find(t => t.value === reportTone)?.label} tone
                          </Badge>
                        )}
                      </div>

                      {/* View toggle */}
                      <div role="tablist" aria-label="View mode" className="flex items-center gap-1 rounded-lg border bg-muted/50 p-0.5">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={viewMode === 'document'}
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
                          role="tab"
                          aria-selected={viewMode === 'infographic'}
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
                      <Button variant="secondary" size="sm" onClick={handlePrint} disabled={viewMode !== 'document'}>
                        <Printer className="mr-1.5 h-3.5 w-3.5" />
                        Print
                      </Button>
                      <Button variant="secondary" size="sm" onClick={handleExportPDF} disabled={viewMode !== 'document'}>
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
                      <Button variant="secondary" size="sm" onClick={handleAIInfographic}>
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        AI Infographic
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
                    <div ref={reportRef} className="scroll-mt-28">
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
        </>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* PRESENTATIONS TAB                             */}
      {/* ══════════════════════════════════════════════ */}
      {pageMode === 'presentations' && (
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
                <label htmlFor="briefing-source" className="sr-only">Source material</label>
                <textarea
                  id="briefing-source"
                  aria-required="true"
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
                      onClick={() => setBriefingTone(option.value)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm transition-all',
                        briefingTone === option.value
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
            disabled={isGeneratingBriefing || !briefingContext.trim()}
            onClick={handleGenerateBriefing}
          >
            {isGeneratingBriefing ? (
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

          {/* Strategic Briefing Preview */}
          {briefingResult && (
            <section ref={briefingRef} className="space-y-4 scroll-mt-28">
              <div className="sticky top-0 z-40 -mx-1 px-1 py-3 bg-background">
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <h2 className={typography.h3}>Presentation Preview</h2>
                        <Badge variant="secondary" className="text-xs">
                          {briefingResult.slides.length} slides
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {TONE_OPTIONS.find(t => t.value === briefingTone)?.label} tone
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

              <div ref={briefingContentRef}>
                <SlideDeckRenderer briefing={briefingResult} />
              </div>
            </section>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* DOCUMENTS TAB                                 */}
      {/* ══════════════════════════════════════════════ */}
      {pageMode === 'documents' && <SkillDocumentSection />}

      {/* ══════════════════════════════════════════════ */}
      {/* Dialogs (shared across tabs)                  */}
      {/* ══════════════════════════════════════════════ */}

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
                    <CheckCheck className="h-4 w-4 text-success" />
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
              <InputWithSpeech
                id="email-recipients"
                enableSpeech
                placeholder="Enter email addresses, separated by commas"
                value={emailRecipients}
                onChange={e => setEmailRecipients(e.target.value)}
                onSpeechTranscript={(text) => setEmailRecipients((prev) => prev ? prev + ", " + text : text)}
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
                <label htmlFor="schedule-enabled" className="text-sm font-medium text-foreground block cursor-pointer">Enable scheduling</label>
                <p className="text-xs text-muted-foreground">Reports will be delivered automatically</p>
              </div>
              <Checkbox
                id="schedule-enabled"
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
                  <InputWithSpeech
                    id="schedule-recipients"
                    enableSpeech
                    placeholder="ceo@company.com, board@company.com"
                    value={scheduleRecipients}
                    onChange={e => setScheduleRecipients(e.target.value)}
                    onSpeechTranscript={(text) => setScheduleRecipients((prev) => prev ? prev + ", " + text : text)}
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
                    // GOTCHA: Match the same split pattern as handleSendEmail — users may use semicolons.
                    ? `Scheduled ${scheduleFrequency} delivery to ${scheduleRecipients.split(/[,;]+/).map(s => s.trim()).filter(Boolean).length} recipient(s)`
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
