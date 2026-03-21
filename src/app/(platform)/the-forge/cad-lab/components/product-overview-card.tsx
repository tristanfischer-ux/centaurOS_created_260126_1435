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
import { Pencil, Check, X, ShieldCheck, ChevronDown, Layers, Wrench, Cog, Building2 } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

// ─── Display Name Lookup ──────────────────────────────────────────────

/** Maps raw model IDs to human-friendly display names */
function getModelDisplayName(modelId: string): string {
  const DISPLAY_NAMES: Record<string, string> = {
    "claude-opus-4-6": "Claude Opus 4.6",
    "claude-sonnet-4-6": "Claude Sonnet 4.6",
    "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5",
    "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
    "gemini-3.1-flash-image-preview": "Nano Banana 2 (Gemini)",
    "gpt-image-1": "GPT Image 1 (OpenAI)",
    // Short labels from the decomposition race
    "Opus": "Claude Opus 4.6",
    "Sonnet": "Claude Sonnet 4.6",
    "Haiku": "Claude Haiku 4.5",
    "Gemini": "Gemini Pro",
    "GPT-4o": "GPT-4o",
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
  standardCodes?: string[]
  industryDomain?: string
  totalStandardsMatched?: number
  engineeringData?: {
    materialsApplied: string[]
    materialFamilies: string[]
    hardwareItemCount: number
    processesApplied: string[]
    supplierTechniques: number
    totalDataPoints: number
  }
}

function formatDomainLabel(domain: string): string {
  return domain.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Component ───────────────────────────────────────────────────────

export function ProductOverviewCard({
  overview,
  onSave,
  modelAudit,
  standardCodes,
  industryDomain,
  totalStandardsMatched,
  engineeringData,
}: ProductOverviewCardProps): React.ReactNode {
  const [engExpanded, setEngExpanded] = useState(false)
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
        {/* ── Engineering Intelligence Panel ── */}
        {((standardCodes && standardCodes.length > 0) || (engineeringData && engineeringData.totalDataPoints > 0)) && (
          <div className="border-t border-border mt-4 pt-3">
            <Collapsible open={engExpanded} onOpenChange={setEngExpanded}>
              <CollapsibleTrigger className="flex items-center justify-between w-full group" aria-label="Toggle engineering intelligence details">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Engineering Intelligence Applied
                  </h4>
                  {engineeringData && (
                    <span className="text-xs text-muted-foreground font-normal normal-case ml-1">
                      — {engineeringData.totalDataPoints}+ data points
                    </span>
                  )}
                </div>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${engExpanded ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-3 space-y-3">
                {/* Standards */}
                {standardCodes && standardCodes.length > 0 && (
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">Design Standards</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {standardCodes.slice(0, 5).map((code) => (
                          <span key={code} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-foreground max-w-[200px] truncate">
                            {code}
                          </span>
                        ))}
                        {standardCodes.length > 5 && (
                          <span className="text-[11px] text-muted-foreground py-0.5">+{standardCodes.length - 5} more</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {industryDomain && <>{formatDomainLabel(industryDomain)} domain</>}
                        {totalStandardsMatched != null && standardCodes && totalStandardsMatched > standardCodes.length && (
                          <> — {totalStandardsMatched} matched</>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Materials */}
                {engineeringData?.materialsApplied && engineeringData.materialsApplied.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">Material Properties</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {engineeringData.materialsApplied.slice(0, 4).map((code) => (
                          <span key={code} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-foreground">
                            {code}
                          </span>
                        ))}
                        {engineeringData.materialsApplied.length > 4 && (
                          <span className="text-[11px] text-muted-foreground py-0.5">+{engineeringData.materialsApplied.length - 4} more</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {engineeringData.materialFamilies.length > 0
                          ? `${engineeringData.materialFamilies.map(f => f.replace(/_/g, " ")).join(", ")} — verified handbook data`
                          : "Verified handbook data"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Hardware */}
                {engineeringData && engineeringData.hardwareItemCount > 0 && (
                  <div className="flex items-start gap-2">
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Hardware Library</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {engineeringData.hardwareItemCount} items — ISO 4762 bolts, ISO 4032 nuts, ISO 7089 washers, bearings
                      </p>
                    </div>
                  </div>
                )}

                {/* Processes */}
                {engineeringData?.processesApplied && engineeringData.processesApplied.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Cog className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">Process Capabilities</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {engineeringData.processesApplied.map((name) => (
                          <span key={name} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-foreground">
                            {name}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Real tolerances, min wall thicknesses, draft angles
                      </p>
                    </div>
                  </div>
                )}

                {/* Supplier Intelligence */}
                {engineeringData && engineeringData.supplierTechniques > 0 && (
                  <div className="flex items-start gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Supplier Intelligence</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {engineeringData.supplierTechniques} manufacturing techniques enriched from real supplier data
                      </p>
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
