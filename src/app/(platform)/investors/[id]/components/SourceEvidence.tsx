"use client"

/**
 * @file SourceEvidence.tsx
 *
 * @description Client component showing chunk-level website evidence for an
 * investor. Fetches via the `getChunkEvidence` server action using the
 * founder's search query text (from URL `?q=` param) and the investor's
 * forge_capital_id. Shows top 8 matching website excerpts with source URLs
 * and match percentage.
 *
 * Three states: loading spinner, indexing-in-progress, matched excerpts.
 * Returns null when no query text is available (nothing to match against).
 */

import React from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getChunkEvidence, type ChunkEvidence } from '@/actions/investors'
import { Loader2 } from 'lucide-react'

interface SourceEvidenceProps {
  forgeCapitalId: number | undefined
}

/**
 * Clean raw scraped text by stripping common website noise:
 * navigation menus, footers, cookie banners, social links, etc.
 */
function cleanChunkText(text: string): string {
  let cleaned = text
  // Strip common navigation/menu patterns
  cleaned = cleaned.replace(/menu\s*/gi, '')
  cleaned = cleaned.replace(/kickass\s*companies\s*meet\s*the\s*team\s*get\s*off\s*the\s*couch/gi, '')
  cleaned = cleaned.replace(/overview\s*slashing\s*co\s*2/gi, '')
  // Strip footer boilerplate
  cleaned = cleaned.replace(/©\s*\d{4}[^.]*?\./g, '')
  cleaned = cleaned.replace(/linkedin\s*privacy/gi, '')
  cleaned = cleaned.replace(/put me in,?\s*coach[\s\S]*$/gi, '')
  cleaned = cleaned.replace(/my people will call your people[\s\S]*$/gi, '')
  // Strip "I want to work for" / "I want to connect with" patterns
  cleaned = cleaned.replace(/i want to work for\s+\w+/gi, '')
  cleaned = cleaned.replace(/i want to connect with\s+\w+/gi, '')
  // Collapse whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  return cleaned
}

/**
 * Split cleaned text into meaningful paragraphs at sentence boundaries
 * when the text is long enough to warrant it.
 */
function formatChunkText(text: string): string[] {
  const cleaned = cleanChunkText(text)
  if (cleaned.length < 200) return [cleaned]
  // Split on sentence boundaries, grouping into ~150-char paragraphs
  const sentences = cleaned.split(/(?<=[.!?])\s+/)
  const paragraphs: string[] = []
  let current = ""
  for (const s of sentences) {
    if (current.length + s.length > 180 && current.length > 0) {
      paragraphs.push(current.trim())
      current = ""
    }
    current += (current ? " " : "") + s
  }
  if (current.trim()) paragraphs.push(current.trim())
  return paragraphs.length > 0 ? paragraphs : [cleaned]
}

/**
 * Extract meaningful search terms from hero text — skip common stopwords
 * and short tokens. Returns lowercase terms for case-insensitive matching.
 */
function extractSearchTerms(heroText: string): string[] {
  const stopwords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "and", "but", "or", "nor", "not", "so", "very", "just",
    "than", "too", "also", "about", "up", "that", "this", "these", "those",
    "what", "which", "who", "whom", "when", "where", "why", "how", "all",
    "each", "every", "both", "few", "more", "most", "other", "some", "such",
    "no", "only", "own", "same", "its", "it", "they", "them", "their",
    "we", "our", "you", "your", "he", "she", "him", "her", "his",
    "looking", "seeking", "find", "investors", "funds", "venture",
    "capital", "investment", "fund", "backing", "portfolio",
  ])
  return heroText
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopwords.has(t))
    .filter((t, i, arr) => arr.indexOf(t) === i) // deduplicate
}

/**
 * Highlight matching search terms in text. Wraps each match in a <mark> tag.
 */
function highlightMatches(
  text: string,
  terms: string[],
): React.ReactNode[] {
  if (terms.length === 0) return [text]
  // Build a single regex that matches any term (word boundary aware)
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  )
  const parts = text.split(pattern)
  return parts.map((part, i) => {
    const isMatch = terms.some((t) => part.toLowerCase() === t)
    if (isMatch) {
      return (
        <mark
          key={i}
          style={{
            background: "var(--accent-soft, #fff3cd)",
            color: "var(--text, #333)",
            borderRadius: 2,
            padding: "0 2px",
          }}
        >
          {part}
        </mark>
      )
    }
    return part
  })
}

export function SourceEvidence({ forgeCapitalId }: SourceEvidenceProps) {
  const searchParams = useSearchParams()
  const queryText = searchParams.get('q')

  const [chunks, setChunks] = useState<ChunkEvidence[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [indexing, setIndexing] = useState(false)

  useEffect(() => {
    if (!forgeCapitalId || !queryText) return

    setLoading(true)
    getChunkEvidence({ investorId: forgeCapitalId, queryText, limit: 8 })
      .then((res) => {
        if (res.ok && res.chunks.length > 0) {
          setChunks(res.chunks)
        } else if (res.ok && res.indexing) {
          setIndexing(true)
        } else if (!res.ok) {
          setError(res.error)
        }
      })
      .catch(() => setError('Failed to load evidence'))
      .finally(() => setLoading(false))
  }, [forgeCapitalId, queryText])

  if (!forgeCapitalId || !queryText) return null
  if (!loading && !chunks && !indexing && !error) return null

  const searchTerms = queryText ? extractSearchTerms(queryText) : []

  return (
    <div>
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching scraped website pages for relevant excerpts…
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : indexing ? (
        <p className="text-sm text-muted-foreground italic py-2">
          No website excerpts yet — this investor&apos;s pages are still being
          indexed. Check back shortly.
        </p>
      ) : chunks ? (
        <div className="space-y-2.5">
          <p className="text-xs text-muted-foreground">
            Excerpts from this investor&apos;s website pages that best match your search. Used to assess thesis fit.
          </p>
          {chunks.map((chunk, i) => {
            const domain = chunk.page_url
              .replace(/^https?:\/\//, '')
              .split('/')[0]
            const path = chunk.page_url
              .replace(/^https?:\/\/[^/]+/, '')
              .slice(0, 50)
            const paragraphs = formatChunkText(chunk.chunk_text)
            return (
              <div
                key={`${chunk.page_url}-${chunk.chunk_index}`}
                className="rounded-lg border border-border border-l-[3px] border-l-international-orange bg-muted/30 p-3 text-sm leading-relaxed"
              >
                {paragraphs.map((p, pi) => (
                  <p key={pi} style={{ margin: pi < paragraphs.length - 1 ? "0 0 6px 0" : 0 }} className="text-foreground">
                    &ldquo;{highlightMatches(p, searchTerms)}&rdquo;
                  </p>
                ))}
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                  <a
                    href={chunk.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-international-orange hover:underline"
                  >
                    {domain}{path} ↗
                  </a>
                  <span>{Math.round(chunk.cosine_similarity * 100)}% match</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
