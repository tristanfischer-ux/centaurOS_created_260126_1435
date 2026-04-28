'use client'

/**
 * @file connection-brief-card.tsx
 *
 * Warm-intro intel for the firm — `attributes.connection_brief` is prose;
 * `attributes.warm_intro_paths` is an optional array of suggested routes.
 * When both are empty the card is hidden.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Handshake } from 'lucide-react'

export function ConnectionBriefCard({
  connectionBrief,
  warmIntroPaths,
}: {
  connectionBrief: string | null | undefined
  warmIntroPaths: unknown
}) {
  const prose =
    typeof connectionBrief === 'string' && connectionBrief.trim().length > 0
      ? connectionBrief
      : null
  const paths = Array.isArray(warmIntroPaths)
    ? (warmIntroPaths as unknown[]).filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0,
      )
    : []

  if (!prose && paths.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Handshake className="h-4 w-4 text-muted-foreground" aria-hidden />
          Connection brief
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prose && (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{prose}</p>
        )}
        {paths.length > 0 && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Warm-intro paths
            </p>
            <ul className="space-y-1">
              {paths.map((path, i) => (
                <li key={i} className="text-sm text-foreground">
                  · {path}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
