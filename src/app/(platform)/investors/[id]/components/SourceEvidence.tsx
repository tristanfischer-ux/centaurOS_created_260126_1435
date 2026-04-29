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

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getChunkEvidence, type ChunkEvidence } from '@/actions/investors'
import { Loader2 } from 'lucide-react'

interface SourceEvidenceProps {
  forgeCapitalId: number | undefined
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
            {chunks.length} relevant excerpt{chunks.length !== 1 ? 's' : ''} from their website
          </p>
          {chunks.map((chunk, i) => {
            const domain = chunk.page_url
              .replace(/^https?:\/\//, '')
              .split('/')[0]
            const path = chunk.page_url
              .replace(/^https?:\/\/[^/]+/, '')
              .slice(0, 50)
            return (
              <div
                key={`${chunk.page_url}-${chunk.chunk_index}`}
                className="rounded-lg border border-border border-l-[3px] border-l-international-orange bg-muted/30 p-3 text-sm leading-relaxed"
              >
                <p className="italic text-foreground">
                  &ldquo;{chunk.chunk_text}&rdquo;
                </p>
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
