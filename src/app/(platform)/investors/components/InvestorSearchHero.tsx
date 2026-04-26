/**
 * @file InvestorSearchHero.tsx
 *
 * @description Prominent semantic search hero for the investor page.
 * Users describe their startup (text, file upload) to find matching investors.
 * Uses semantic embeddings for AI-powered matching.
 */

'use client'

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, Search, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { extractDocumentText, type ExtractedProfile } from '@/actions/extract-document-text'

/**
 * Example search queries to inspire users.
 * These showcase the diversity of investor-company matching.
 */
const EXAMPLE_QUERIES = [
  'Pre-seed hardware startup, UK-based, climate tech',
  'Series A AI robotics company, Europe, seed capital raised',
  'Deep tech manufacturing, $2-5M series seed, London',
]

interface InvestorSearchHeroProps {
  /** Called when user submits a search query */
  onSearch: (query: string) => void
  /** Called when user cancels an in-flight search */
  onCancel?: () => void
  /** Whether search is currently in progress */
  isSearching?: boolean
  /** Company profile data — kept for potential future use. NOT used to auto-fill
   * the search input: user feedback confirmed that the sticky auto-populated
   * "Seed, manufacturing, Bootstrapped / Pre-seed" string was unwanted. */
  companyContext?: { sector?: string | null; stage?: string | null; fundingStatus?: string | null; seekingFunding?: boolean }
}

export function InvestorSearchHero({ onSearch, onCancel, isSearching = false }: InvestorSearchHeroProps) {
  // INTENT: Default empty search. Previously we auto-populated from companyContext
  // and auto-searched on mount, but it was impossible to clear — the memo re-fired
  // and the sticky value persisted as a filter chip. Starting empty gives the user
  // a clean blank slate matching the Forge Capital Dashboard behaviour.
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadedText, setUploadedText] = useState<string | null>(null)
  const [uploadedProfile, setUploadedProfile] = useState<ExtractedProfile | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragOverRef = useRef(false)

  // INTENT: Allow users to click example chips to populate search
  const handleExampleClick = useCallback((example: string) => {
    setSearchQuery(example)
  }, [])

  // INTENT: Submit the search query — prioritize uploaded text if available
  const handleSearch = useCallback(() => {
    const query = uploadedText || searchQuery
    if (!query.trim()) {
      toast.error('Please describe your startup or upload a document')
      return
    }
    onSearch(query)
  }, [searchQuery, uploadedText, onSearch])

  // INTENT: File upload handler — extract text from all supported document types
  const handleFileChange = useCallback(async (file: File) => {
    if (!file) return

    setIsExtracting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await extractDocumentText(formData)

      if (result.success) {
        setUploadedText(result.text.slice(0, 2000)) // Cap for search context
        setUploadedProfile(result.profile)
        toast.success(`Text extracted from ${result.fileName}`)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Failed to extract text from file')
    } finally {
      setIsExtracting(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragOverRef.current = true
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragOverRef.current = false
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragOverRef.current = false

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleFileChange(files[0])
    }
  }, [handleFileChange])

  // INTENT: Allow file picker via ref
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // INTENT: Clear uploaded text to go back to manual input
  const handleClearUpload = useCallback(() => {
    setUploadedText(null)
    setUploadedProfile(null)
    setSearchQuery('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  return (
    <Card className="bg-background border-border">
      <CardContent className="pt-4 pb-4">
        <div className="space-y-3">
          {/* Header — compact */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Find your ideal investors</h2>
            <p className="text-xs text-muted-foreground">
              Describe your startup for semantic matching
            </p>
          </div>

          {/* Search input or extracted profile display */}
          {uploadedText && uploadedProfile ? (
            // INTENT: Show the structured profile extracted from the pitch deck
            // as editable chips (ported from Forge-Capital-Dashboard.html:2054-2069),
            // instead of a wall of concatenated raw text which is unreadable.
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 p-4 space-y-3">
                {uploadedProfile.description && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                    <p className="text-sm text-foreground leading-snug">{uploadedProfile.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {uploadedProfile.stage && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Stage</p>
                      <Badge variant="outline" className="text-xs">{uploadedProfile.stage}</Badge>
                    </div>
                  )}
                  {uploadedProfile.geo && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Geo</p>
                      <Badge variant="outline" className="text-xs">{uploadedProfile.geo}</Badge>
                    </div>
                  )}
                  {uploadedProfile.raiseAmount && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Raise</p>
                      <Badge variant="outline" className="text-xs">{uploadedProfile.raiseAmount}</Badge>
                    </div>
                  )}
                  {uploadedProfile.sectors.length > 0 && (
                    <div className="col-span-2 md:col-span-4">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Sectors</p>
                      <div className="flex flex-wrap gap-1">
                        {uploadedProfile.sectors.map(s => (
                          <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearUpload}
                className="w-full"
              >
                <X className="h-4 w-4 mr-2" />
                Clear and try again
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Text input */}
              <div>
                <textarea
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      handleSearch()
                    }
                  }}
                  placeholder="Describe your company, stage, sector, location, and what you're looking for in an investor..."
                  className={cn(
                    'w-full rounded-lg border px-4 py-3 text-sm',
                    'bg-background text-foreground placeholder:text-muted-foreground',
                    'border-input focus:border-international-orange focus:outline-none focus:ring-1 focus:ring-international-orange',
                    'resize-none'
                  )}
                  rows={2}
                />
              </div>

              {/* Example chips */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Examples:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_QUERIES.map((example) => (
                    <button
                      key={example}
                      onClick={() => handleExampleClick(example)}
                      className="inline-block"
                    >
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-secondary transition-colors"
                      >
                        {example}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>

              {/* File upload zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleUploadClick}
                className={cn(
                  'rounded-lg border-2 border-dashed px-4 py-3 text-center cursor-pointer',
                  'transition-colors duration-200',
                  dragOverRef.current
                    ? 'border-international-orange bg-international-orange/5'
                    : 'border-border bg-muted hover:border-international-orange hover:bg-muted/50'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                  accept=".txt,.pdf,.docx,.pptx,.xlsx,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                />
                {isExtracting ? (
                  <>
                    <Loader2 className="h-5 w-5 mx-auto text-muted-foreground mb-2 animate-spin" />
                    <p className="text-sm font-medium text-foreground">
                      Extracting text...
                    </p>
                  </>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop pitch deck or plan (PDF, DOCX, PPTX)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search / Cancel button — cancel takes over while a search is in flight */}
          {isSearching ? (
            <div className="flex gap-2">
              <Button
                disabled
                className="flex-1 bg-international-orange/70"
                size="lg"
              >
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Searching…
              </Button>
              <Button
                onClick={() => {
                  setSearchQuery('')
                  onCancel?.()
                }}
                variant="outline"
                size="lg"
                aria-label="Cancel search"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleSearch}
              disabled={!searchQuery.trim() && !uploadedText}
              className="w-full bg-international-orange hover:bg-international-orange/90"
              size="lg"
            >
              <Search className="h-4 w-4 mr-2" />
              Search investors
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
