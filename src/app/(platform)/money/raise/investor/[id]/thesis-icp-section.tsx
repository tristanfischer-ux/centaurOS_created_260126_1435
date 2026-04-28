'use client'

/**
 * @file thesis-icp-section.tsx
 *
 * Long-form prose cards for the investor detail page: Investment thesis,
 * Ideal Company Profile, and Value-add. Each card collapses to ~800 chars
 * with a "Show more" disclosure. Source fields all live inside
 * `marketplace_listings.attributes`. Cards with no data are hidden entirely.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const PREVIEW_CHARS = 800

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const needsToggle = text.length > PREVIEW_CHARS
  const visible = !needsToggle || expanded ? text : `${text.slice(0, PREVIEW_CHARS).trimEnd()}…`
  return (
    <>
      <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{visible}</p>
      {needsToggle && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-auto p-0 text-international-orange hover:bg-transparent hover:underline"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </>
  )
}

function ProseCard({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ExpandableText text={text} />
      </CardContent>
    </Card>
  )
}

function hasProse(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim().length > 0
}

export function ThesisIcpSection({
  investmentThesis,
  idealCompanyProfile,
  valueAdd,
}: {
  investmentThesis: string | null | undefined
  idealCompanyProfile: string | null | undefined
  valueAdd: string | null | undefined
}) {
  const hasThesis = hasProse(investmentThesis)
  const hasIcp = hasProse(idealCompanyProfile)
  const hasValueAdd = hasProse(valueAdd)

  if (!hasThesis && !hasIcp && !hasValueAdd) return null

  return (
    <div className="space-y-4">
      {hasThesis && <ProseCard title="Investment thesis" text={investmentThesis} />}
      {hasIcp && <ProseCard title="Ideal company profile" text={idealCompanyProfile} />}
      {hasValueAdd && <ProseCard title="Value-add" text={valueAdd} />}
    </div>
  )
}
