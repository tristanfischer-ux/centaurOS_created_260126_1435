'use client'

/**
 * @file SkillDocumentSection.tsx
 *
 * @description Sub-component for the Document Writer template on the Reports page.
 * Handles skill picker, context input, tone/length controls, SSE streaming
 * generation, Markdown preview, and export (PDF/DOCX).
 *
 * @related
 * - src/lib/document-skills/ — Skill definitions and types
 * - src/app/api/reports/generate-document/route.ts — SSE endpoint
 * - src/components/reports/SkillDocumentRenderer.tsx — Markdown renderer
 * - src/lib/reports/export-skill-docx.ts — DOCX export
 */

import { useState, useCallback, useRef } from 'react'
import {
  Loader2,
  Check,
  FileDown,
  Printer,
  FileSpreadsheet,
  Crosshair,
  Lightbulb,
  ClipboardList,
  Scale,
  Search,
  ShieldCheck,
  TrendingUp,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { exportReportAsPDF, printReport } from '@/lib/reports/export-pdf'
import { SkillDocumentRenderer } from '@/components/reports/SkillDocumentRenderer'
import { DOCUMENT_SKILLS } from '@/lib/document-skills'
import { SKILL_CATEGORY_META } from '@/lib/document-skills/types'

import type { DocumentSkill, DocumentTone, DocumentLength, SkillDocumentResult, SkillCategory } from '@/lib/document-skills/types'

// ─── Icon map ───────────────────────────────────────────────────────

const SKILL_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Crosshair,
  Lightbulb,
  ClipboardList,
  Scale,
  Search,
  ShieldCheck,
  TrendingUp,
  UserPlus,
}

// ─── Tone & Length options ──────────────────────────────────────────

const TONE_OPTIONS: { value: DocumentTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'executive', label: 'Executive' },
  { value: 'technical', label: 'Technical' },
  { value: 'conversational', label: 'Conversational' },
]

const LENGTH_OPTIONS: { value: DocumentLength; label: string; description: string }[] = [
  { value: 'brief', label: 'Brief', description: '~800-1,500 words' },
  { value: 'standard', label: 'Standard', description: '~2,000-4,000 words' },
  { value: 'comprehensive', label: 'Comprehensive', description: '~4,000-6,000 words' },
]

// ─── Component ──────────────────────────────────────────────────────

export function SkillDocumentSection() {
  const documentRef = useRef<HTMLDivElement>(null)

  // Skill selection
  const [selectedSkill, setSelectedSkill] = useState<DocumentSkill | null>(null)

  // Input
  const [userContext, setUserContext] = useState('')
  const [includeAutoData, setIncludeAutoData] = useState(true)

  // Controls
  const [tone, setTone] = useState<DocumentTone>('professional')
  const [length, setLength] = useState<DocumentLength>('standard')

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [progressMessage, setProgressMessage] = useState('')
  const [streamedContent, setStreamedContent] = useState('')
  const [result, setResult] = useState<SkillDocumentResult | null>(null)

  const handleSelectSkill = useCallback((skill: DocumentSkill) => {
    setSelectedSkill(skill)
    setTone(skill.defaultTone)
    setStreamedContent('')
    setResult(null)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!selectedSkill || !userContext.trim()) {
      toast.error('Select a skill and provide context')
      return
    }

    setIsGenerating(true)
    setStreamedContent('')
    setResult(null)
    setProgressMessage('Starting…')

    try {
      const response = await fetch('/api/reports/generate-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          skillId: selectedSkill.id,
          userContext: userContext.trim(),
          tone,
          length,
          includeAutoData,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as
              | { type: 'progress'; message: string }
              | { type: 'chunk'; text: string }
              | { type: 'complete'; result: SkillDocumentResult }
              | { type: 'error'; message: string }

            switch (event.type) {
              case 'progress':
                setProgressMessage(event.message)
                break
              case 'chunk':
                setStreamedContent(prev => prev + event.text)
                break
              case 'complete':
                setResult(event.result)
                setProgressMessage('')
                toast.success(`Document generated — ${event.result.wordCount.toLocaleString()} words`)
                // Scroll to preview
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    documentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }, 100)
                })
                break
              case 'error':
                throw new Error(event.message)
            }
          } catch (parseErr) {
            // GOTCHA: Non-JSON lines are normal SSE keepalives — skip them
            if (parseErr instanceof SyntaxError) continue
            throw parseErr
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document generation failed'
      toast.error(message)
    } finally {
      setIsGenerating(false)
      setProgressMessage('')
    }
  }, [selectedSkill, userContext, tone, length, includeAutoData])

  const handleExportPDF = useCallback(async () => {
    if (!documentRef.current) return
    try {
      toast.info('Generating PDF…')
      const filename = result
        ? `${result.foundryName.replace(/\s+/g, '-')}-${result.title.replace(/\s+/g, '-')}.pdf`
        : 'document.pdf'
      await exportReportAsPDF(documentRef.current, filename)
      toast.success('PDF downloaded')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed'
      toast.error(message)
    }
  }, [result])

  const handleExportDOCX = useCallback(async () => {
    if (!result) return
    try {
      toast.info('Generating Word document…')
      const { exportSkillDocumentAsDOCX } = await import('@/lib/reports/export-skill-docx')
      await exportSkillDocumentAsDOCX(result)
      toast.success('DOCX downloaded')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'DOCX generation failed'
      toast.error(message)
    }
  }, [result])

  const handlePrint = useCallback(() => {
    if (!documentRef.current) return
    try {
      printReport(documentRef.current, result?.title ?? 'Document')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Print failed'
      toast.error(message)
    }
  }, [result])

  // Content to display: final result content, or streamed content during generation
  const displayContent = result?.content ?? streamedContent

  // Group skills by category
  const categories = Object.keys(SKILL_CATEGORY_META) as SkillCategory[]

  return (
    <>
      {/* Skill Picker */}
      <section className="space-y-4">
        <h2 className={typography.h3}>Choose a Document Type</h2>
        {categories.map(category => {
          const meta = SKILL_CATEGORY_META[category]
          const skills = DOCUMENT_SKILLS.filter(s => s.category === category)
          if (skills.length === 0) return null

          return (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">{meta.label}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {skills.map(skill => {
                  const isSelected = selectedSkill?.id === skill.id
                  const SkillIcon = SKILL_ICON_MAP[skill.icon]

                  return (
                    <Card
                      key={skill.id}
                      className={cn(
                        'cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
                        isSelected && 'ring-2 ring-international-orange'
                      )}
                      onClick={() => handleSelectSkill(skill)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            isSelected ? 'bg-international-orange/10' : 'bg-muted'
                          )}>
                            {SkillIcon && (
                              <SkillIcon className={cn(
                                'h-4 w-4',
                                isSelected ? 'text-international-orange' : 'text-muted-foreground'
                              )} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {skill.title}
                              </span>
                              {isSelected && (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-international-orange">
                                  <Check className="h-3 w-3 text-background" />
                                </div>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                              {skill.description}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {/* Context Input + Controls (visible once a skill is selected) */}
      {selectedSkill && (
        <>
          <section className="space-y-4">
            <h2 className={typography.h3}>{selectedSkill.inputLabel}</h2>
            <Card>
              <CardContent className="p-6 space-y-4">
                <textarea
                  className="w-full min-h-[160px] rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange resize-y"
                  placeholder={selectedSkill.inputHint}
                  value={userContext}
                  onChange={e => setUserContext(e.target.value)}
                  maxLength={20000}
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="include-auto-data"
                      checked={includeAutoData}
                      onCheckedChange={(checked) => setIncludeAutoData(checked === true)}
                    />
                    <label htmlFor="include-auto-data" className="text-sm text-foreground cursor-pointer">
                      Enrich with company data
                    </label>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {userContext.length.toLocaleString()} / 20,000
                  </span>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tone & Length */}
          <section className="space-y-4">
            <h2 className={typography.h3}>Style</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tone */}
              <Card>
                <CardContent className="p-6 space-y-3">
                  <span className="text-sm font-medium text-foreground">Tone</span>
                  <div className="flex flex-wrap gap-2">
                    {TONE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTone(option.value)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                          tone === option.value
                            ? 'border-international-orange bg-international-orange/5 text-foreground'
                            : 'border-input bg-background text-muted-foreground hover:border-foreground/20'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Length */}
              <Card>
                <CardContent className="p-6 space-y-3">
                  <span className="text-sm font-medium text-foreground">Length</span>
                  <div className="flex flex-wrap gap-2">
                    {LENGTH_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLength(option.value)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm transition-all',
                          length === option.value
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

          {/* Generate Button */}
          <Button
            className="w-full bg-international-orange hover:bg-international-orange-hover text-background font-semibold h-12 text-base"
            disabled={isGenerating || !userContext.trim()}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {progressMessage || 'Generating…'}
              </>
            ) : (
              `Generate ${selectedSkill.title}`
            )}
          </Button>
        </>
      )}

      {/* Document Preview */}
      {displayContent && (
        <section className="space-y-4">
          {/* Export Toolbar */}
          <div className="sticky top-0 z-10 -mx-1 px-1 py-3 bg-background">
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className={typography.h3}>Document Preview</h2>
                    {result && (
                      <>
                        <Badge variant="secondary" className="text-xs">
                          {result.wordCount.toLocaleString()} words
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {TONE_OPTIONS.find(t => t.value === result.tone)?.label} tone
                        </Badge>
                      </>
                    )}
                    {isGenerating && (
                      <Badge variant="secondary" className="text-xs">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Streaming…
                      </Badge>
                    )}
                  </div>
                </div>

                {result && (
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
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Rendered Document */}
          <Card>
            <CardContent className="p-8 sm:p-12">
              <div ref={documentRef}>
                <SkillDocumentRenderer content={displayContent} />
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </>
  )
}
