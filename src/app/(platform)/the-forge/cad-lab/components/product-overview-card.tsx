"use client"

/**
 * @file product-overview-card.tsx — Editable product overview card.
 *
 * @description Displays the executive summary extracted from the research
 * report with an inline edit toggle. User edits are stored separately from
 * the original report so the research artifact stays intact.
 *
 * Optional "Model Attribution" section shows which LLMs generated the
 * code and images, with per-module counts — enables quality traceability.
 */

import { useState, useRef, useEffect } from "react"
import { Pencil, Check, X, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

// ─── Display Name Lookup ──────────────────────────────────────────────

/** Maps raw model IDs to human-friendly display names */
function getModelDisplayName(modelId: string): string {
  const DISPLAY_NAMES: Record<string, string> = {
    "claude-opus-4-6": "Claude Opus 4.6",
    "claude-sonnet-4-6": "Claude Sonnet 4.6",
    "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
    "gemini-3.1-flash-image-preview": "Nano Banana 2 (Gemini)",
    "gpt-image-1": "GPT Image 1 (OpenAI)",
    // Short labels from the decomposition race
    "Opus": "Claude Opus 4.6",
    "Sonnet": "Claude Sonnet 4.6",
    "Haiku": "Claude Haiku 4.5",
    "Gemini": "Gemini Pro",
    "GPT-5.3": "GPT-5.3",
  }
  return DISPLAY_NAMES[modelId] ?? modelId
}

// ─── Types ────────────────────────────────────────────────────────────

export interface ModelAudit {
  /** Model ID used for code generation (e.g. "claude-opus-4-6") */
  codeModel: string
  /** Total module count */
  moduleCount: number
  /** Number of modules that have been generated (have code) */
  generatedCount: number
  /** Number of modules that have images */
  imageCount: number
  /** Distinct image model IDs used across modules */
  imageModels: string[]
  /** Which model synthesized the research/overview report */
  researchModel?: string
  /** Which model won the decomposition race */
  decompositionModel?: string
}

// ─── Props ───────────────────────────────────────────────────────────

interface ProductOverviewCardProps {
  overview: string
  onSave: (text: string) => void
  modelAudit?: ModelAudit
}

// ─── Component ───────────────────────────────────────────────────────

export function ProductOverviewCard({
  overview,
  onSave,
  modelAudit,
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
              {overview ? "Edit" : "Add"}
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
        ) : overview?.includes("synthesis failed") ? (
          <div className="rounded-lg border border-status-warning bg-status-warning-light p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-status-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Research report needs regeneration</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The original research synthesis failed. Hit <strong>Re-Research</strong> above to generate a full product overview with engineering standards and material data.
              </p>
            </div>
          </div>
        ) : overview ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {overview}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/60 italic">
            No product overview yet. Click Add to describe your product.
          </p>
        )}

        {/* ── Model Attribution ── */}
        {modelAudit && (modelAudit.researchModel || modelAudit.decompositionModel || modelAudit.generatedCount > 0 || modelAudit.imageCount > 0) && (
          <div className="border-t border-border mt-4 pt-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Model Attribution
            </h4>
            <div className="space-y-1">
              {modelAudit.researchModel && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Overview: <span className="text-foreground font-medium">{getModelDisplayName(modelAudit.researchModel)}</span>
                  </span>
                </div>
              )}
              {modelAudit.decompositionModel && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Breakdown: <span className="text-foreground font-medium">{getModelDisplayName(modelAudit.decompositionModel)}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {modelAudit.moduleCount} modules
                  </span>
                </div>
              )}
              {modelAudit.generatedCount > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Code: <span className="text-foreground font-medium">{getModelDisplayName(modelAudit.codeModel)}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {modelAudit.generatedCount}/{modelAudit.moduleCount} modules
                  </span>
                </div>
              )}
              {modelAudit.imageCount > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Images: <span className="text-foreground font-medium">
                      {modelAudit.imageModels.map(getModelDisplayName).join(", ")}
                    </span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {modelAudit.imageCount}/{modelAudit.moduleCount} modules
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
