/**
 * @file InvestorSearchHero.tsx
 *
 * @description Prominent semantic search hero for the investor page.
 * Users describe their startup (text, file upload) to find matching investors.
 * Uses semantic embeddings for AI-powered matching.
 */

'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, Search, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { extractDocumentText } from '@/actions/extract-document-text'

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
  /** Whether search is currently in progress */
  isSearching?: boolean
  /** Company profile data for auto-filling the search textarea */
  companyContext?: { sector?: string | null; stage?: string | null; fundingStatus?: string | null; seekingFunding?: boolean }
}

export function InvestorSearchHero({ onSearch, isSearching = false, companyContext }: InvestorSearchHeroProps) {
  // INTENT: Build a description from company profile to pre-fill the search textarea
  const initialDescription = useMemo(() => {
    if (!companyContext) return ''
    const parts: string[] = []
    if (companyContext.stage) parts.push(companyContext.stage.replace(/_/g, ' '))
    if (companyContext.sector) parts.push(companyContext.sector)
    if (companyContext.fundingStatus) parts.push(companyContext.fundingStatus)
    if (companyContext.seekingFunding) parts.push('seeking funding')
    return parts.join(', ')
  }, [companyContext])

  const [searchQuery, setSearchQuery] = useState(initialDescription)
  const [uploadedText, setUploadedText] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragOverRef = useRef(false)
  const hasAutoSearched = useRef(false)

  // INTENT: Auto-trigger semantic search on mount if company context provides a meaningful query
  useEffect(() => {
    if (initialDescription && initialDescription.length > 5 && !hasAutoSearched.current) {
      hasAutoSearched.current = true
      onSearch(initialDescription)
    }
  }, [initialDescription, onSearch])

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
    setSearchQuery('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  return (
    <Card className="bg-background border-border">
      <CardContent className="pt-8 pb-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Find your ideal investors</h2>
            <p className="text-sm text-muted-foreground">
              Describe your startup for investor matching
            </p>
          </div>

          {/* Search input or uploaded text display */}
          {uploadedText ? (
            // INTENT: Show uploaded text with option to clear and try again
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted p-4">
                <p className="text-sm text-foreground line-clamp-4">{uploadedText}</p>
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
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Cmd/Ctrl + Enter to search
                </p>
              </div>

              {/* Example chips */}
              <div className="space-y-2">
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
                  'rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer',
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
                  accept=".txt,.pdf,.docx,.pptx,.xlsx,.md,.csv"
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
                  <>
                    <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium text-foreground">
                      Drop your pitch deck or business plan
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Text, PDF, DOCX, PPTX, XLSX
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Search button */}
          <Button
            onClick={handleSearch}
            disabled={isSearching || (!searchQuery.trim() && !uploadedText)}
            className="w-full bg-international-orange hover:bg-international-orange/90"
            size="lg"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search investors
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
