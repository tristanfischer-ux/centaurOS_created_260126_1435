"use client"

/**
 * @file product-overview-card.tsx — Editable product overview card.
 *
 * @description Displays the executive summary extracted from the research
 * report with an inline edit toggle. User edits are stored separately from
 * the original report so the research artifact stays intact.
 */

import { useState, useRef, useEffect } from "react"
import { Pencil, Check, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

// ─── Props ───────────────────────────────────────────────────────────

interface ProductOverviewCardProps {
  overview: string
  onSave: (text: string) => void
}

// ─── Component ───────────────────────────────────────────────────────

export function ProductOverviewCard({
  overview,
  onSave,
}: ProductOverviewCardProps): React.ReactNode {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(overview)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync draft when overview changes externally (e.g. project load)
  useEffect(() => {
    if (!isEditing) setDraft(overview)
  }, [overview, isEditing])

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
  }, [isEditing])

  const handleSave = (): void => {
    onSave(draft)
    setIsEditing(false)
  }

  const handleCancel = (): void => {
    setDraft(overview)
    setIsEditing(false)
  }

  if (!overview && !isEditing) return null

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Product Overview</h3>
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="resize-y text-sm"
              placeholder="Describe your product at a high level..."
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1.5">
                <X className="h-3 w-3" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} className="gap-1.5">
                <Check className="h-3 w-3" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {overview}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
