/**
 * @file edit-module-dialog.tsx — Edit Module Dialog
 *
 * @description Centered dialog for editing a module's fields in grouped
 * sections: Basic Info, Process Flow (IO), Components & Tests, Technical
 * Details, Procurement, and Risks & Unknowns. Supports manual editing
 * and AI-assisted refinement.
 *
 * @related
 * - Schema: ../services/xray-schema.ts (ModuleSpec type)
 * - Parent: xray-view.tsx (renders this dialog)
 * - Module explorer: module-explorer.tsx (edit button triggers this)
 */

"use client"

import React, { useState, useCallback, useEffect } from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  Sparkles,
  Save,
  Plus,
  X,
  Box,
  ArrowRightLeft,
  Wrench,
  ClipboardCheck,
  FileText,
  Truck,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

import type { ModuleSpec, XRaySpec } from "../services/xray-schema"

// ─── Props ───────────────────────────────────────────────────────────

interface EditModuleDialogProps {
  /** The module to edit */
  module: ModuleSpec
  /** Full spec for AI context */
  spec: XRaySpec
  /** Scan ID for server action calls */
  scanId: string | null
  /** Whether the dialog is open */
  open: boolean
  /** Called when dialog should close */
  onClose: () => void
  /** Called when user saves the edited module */
  onSave: (updated: ModuleSpec) => void
  /** Called when user requests AI refinement — returns the refined module */
  onRefineWithAI: (module: ModuleSpec) => Promise<ModuleSpec>
}

// ─── Editable List Field ─────────────────────────────────────────────

/**
 * A reusable inline list editor for string arrays (keyParts, tests, etc.).
 *
 * @description Renders items as editable rows with remove buttons,
 * plus an "Add" button at the bottom.
 */
function EditableList({
  items,
  onChange,
  placeholder,
  label,
  icon: Icon,
}: {
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
  label: string
  icon: React.ElementType
}): React.ReactNode {
  const handleItemChange = (index: number, value: string): void => {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  const handleRemove = (index: number): void => {
    onChange(items.filter((_, i) => i !== index))
  }

  const handleAdd = (): void => {
    onChange([...items, ""])
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label} ({items.length})
      </Label>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => handleItemChange(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleRemove(i)}
              aria-label={`Remove item ${i + 1}`}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground"
        onClick={handleAdd}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add {label.toLowerCase().replace(/\s*\(\d+\)/, "")}
      </Button>
    </div>
  )
}

// ─── Section Header ──────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  color,
}: {
  icon: React.ElementType
  title: string
  color: string
}): React.ReactNode {
  return (
    <div className="flex items-center gap-2 pt-2">
      <div className={cn("w-1 h-5 rounded-full", color)} />
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

/**
 * EditModuleDialog — Edit a single module with grouped sections.
 *
 * @description Centered dialog with sections for Basic Info, IO, Components,
 * Technical Details, Procurement, and Risks. Supports manual edits and
 * an AI "Refine" button that improves the module while preserving user intent.
 */
export function EditModuleDialog({
  module,
  spec,
  scanId,
  open,
  onClose,
  onSave,
  onRefineWithAI,
}: EditModuleDialogProps): React.ReactNode {
  // Local copy of module data for editing
  const [draft, setDraft] = useState<ModuleSpec>(module)
  const [isRefining, setIsRefining] = useState(false)

  // Reset draft when module prop changes (new module opened)
  useEffect(() => {
    setDraft(module)
  }, [module])

  // ── Field updaters ──────────────────────────────────────────────────

  const updateField = useCallback(<K extends keyof ModuleSpec>(
    key: K,
    value: ModuleSpec[K],
  ): void => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }, [])

  const updateDetail = useCallback(<K extends keyof ModuleSpec["detail"]>(
    key: K,
    value: ModuleSpec["detail"][K],
  ): void => {
    setDraft((prev) => ({
      ...prev,
      detail: { ...prev.detail, [key]: value },
    }))
  }, [])

  const updateRequirements = useCallback(<K extends keyof ModuleSpec["requirements"]>(
    key: K,
    value: ModuleSpec["requirements"][K],
  ): void => {
    setDraft((prev) => ({
      ...prev,
      requirements: { ...prev.requirements, [key]: value },
    }))
  }, [])

  const updateIO = useCallback((direction: "in" | "out", items: string[]): void => {
    setDraft((prev) => ({
      ...prev,
      io: { ...prev.io, [direction]: items },
    }))
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────

  const handleSave = (): void => {
    // Basic validation: name and purpose are required
    if (!draft.name.trim()) {
      toast.error("Module name is required")
      return
    }
    if (!draft.purpose.trim()) {
      toast.error("Module purpose is required")
      return
    }
    // Filter out empty strings from lists
    const cleaned: ModuleSpec = {
      ...draft,
      keyParts: draft.keyParts.filter((s) => s.trim()),
      tests: draft.tests.filter((s) => s.trim()),
      io: {
        in: draft.io.in.filter((s) => s.trim()),
        out: draft.io.out.filter((s) => s.trim()),
      },
      detail: {
        ...draft.detail,
        commonFailureModes: draft.detail.commonFailureModes.filter((s) => s.trim()),
        unknownsToResolve: draft.detail.unknownsToResolve.filter((s) => s.trim()),
      },
    }
    onSave(cleaned)
    onClose()
  }

  const handleRefineWithAI = async (): Promise<void> => {
    setIsRefining(true)
    try {
      const refined = await onRefineWithAI(draft)
      setDraft(refined)
      toast.success("Module refined — review changes before saving")
    } catch {
      // Error already toasted by the parent callback
    } finally {
      setIsRefining(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5 text-international-orange" />
            Edit: {module.name}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[65vh] pr-4">
          <div className="space-y-6 pb-4">

            {/* Section 1: Basic Info */}
            <div className="space-y-4">
              <SectionHeader icon={Box} title="Basic Info" color="bg-international-orange" />
              <div className="space-y-3 pl-3">
                <div className="space-y-2">
                  <Label htmlFor="module-name">
                    Name <span className="text-destructive" aria-label="required">*</span>
                  </Label>
                  <Input
                    id="module-name"
                    value={draft.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="e.g. Reaction / Transformation"
                    aria-required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="module-purpose">
                    Purpose <span className="text-destructive" aria-label="required">*</span>
                  </Label>
                  <Textarea
                    id="module-purpose"
                    value={draft.purpose}
                    onChange={(e) => updateField("purpose", e.target.value)}
                    placeholder="One-sentence purpose of this module"
                    rows={2}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {draft.purpose.length} / 300 characters
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 2: Process Flow (IO) */}
            <div className="space-y-4">
              <SectionHeader icon={ArrowRightLeft} title="Process Flow" color="bg-chart-2" />
              <div className="space-y-4 pl-3">
                <EditableList
                  items={draft.io.in}
                  onChange={(items) => updateIO("in", items)}
                  placeholder="e.g. Pressurised brine feed"
                  label="Inputs"
                  icon={ArrowRightLeft}
                />
                <EditableList
                  items={draft.io.out}
                  onChange={(items) => updateIO("out", items)}
                  placeholder="e.g. Converted stream"
                  label="Outputs"
                  icon={ArrowRightLeft}
                />
              </div>
            </div>

            <Separator />

            {/* Section 3: Components & Tests */}
            <div className="space-y-4">
              <SectionHeader icon={Wrench} title="Components & Tests" color="bg-chart-4" />
              <div className="space-y-4 pl-3">
                <EditableList
                  items={draft.keyParts}
                  onChange={(items) => updateField("keyParts", items)}
                  placeholder="e.g. Chemical-resistant centrifugal pump, 316L, 20 GPM"
                  label="Key Components"
                  icon={Wrench}
                />
                <EditableList
                  items={draft.tests}
                  onChange={(items) => updateField("tests", items)}
                  placeholder="e.g. Flow calibration, cavitation check"
                  label="Acceptance Tests"
                  icon={ClipboardCheck}
                />
              </div>
            </div>

            <Separator />

            {/* Section 4: Technical Details */}
            <div className="space-y-4">
              <SectionHeader icon={FileText} title="Technical Details" color="bg-chart-3" />
              <div className="space-y-3 pl-3">
                <div className="space-y-2">
                  <Label htmlFor="module-whatitis">What it is</Label>
                  <Textarea
                    id="module-whatitis"
                    value={draft.detail.whatItIs}
                    onChange={(e) => updateDetail("whatItIs", e.target.value)}
                    placeholder="2-3 sentence technical description"
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {draft.detail.whatItIs.length} / 500 characters
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="module-whyitmatters">Why it matters</Label>
                  <Textarea
                    id="module-whyitmatters"
                    value={draft.detail.whyItMatters}
                    onChange={(e) => updateDetail("whyItMatters", e.target.value)}
                    placeholder="Why this module is critical to the system"
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 5: Procurement */}
            <div className="space-y-4">
              <SectionHeader icon={Truck} title="Procurement" color="bg-chart-2" />
              <div className="space-y-3 pl-3">
                <div className="space-y-2">
                  <Label htmlFor="module-leadweeks">Lead time (weeks)</Label>
                  <Input
                    id="module-leadweeks"
                    type="number"
                    min={0}
                    max={104}
                    value={draft.requirements.leadWeeks}
                    onChange={(e) => updateRequirements("leadWeeks", Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="module-notes">Procurement notes</Label>
                  <Textarea
                    id="module-notes"
                    value={draft.requirements.notes}
                    onChange={(e) => updateRequirements("notes", e.target.value)}
                    placeholder="Key procurement/design notes"
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 6: Risks & Unknowns */}
            <div className="space-y-4">
              <SectionHeader icon={AlertTriangle} title="Risks & Unknowns" color="bg-status-warning" />
              <div className="space-y-4 pl-3">
                <EditableList
                  items={draft.detail.commonFailureModes}
                  onChange={(items) => updateDetail("commonFailureModes", items)}
                  placeholder="e.g. Seal degradation from aggressive chemistry"
                  label="Failure Modes"
                  icon={AlertTriangle}
                />
                <EditableList
                  items={draft.detail.unknownsToResolve}
                  onChange={(items) => updateDetail("unknownsToResolve", items)}
                  placeholder="e.g. Operating envelope (T, pH, TDS)"
                  label="Unknowns to Resolve"
                  icon={AlertTriangle}
                />
              </div>
            </div>

          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={handleRefineWithAI}
                disabled={isRefining}
              >
                {isRefining ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Refining...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Refine
                  </>
                )}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isRefining}
                className="bg-international-orange hover:bg-international-orange-hover text-white"
              >
                <Save className="h-4 w-4 mr-2" />
                Save changes
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
