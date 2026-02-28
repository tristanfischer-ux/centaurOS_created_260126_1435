"use client"

/**
 * @file module-image-grid.tsx — Animated grid of module blueprint cards.
 *
 * @description Renders CadLabModules as a responsive grid with AnimatePresence
 * for progressive reveal. Each module animates in individually when it joins
 * the revealedModuleIds set (i.e., when its image completes or times out).
 *
 * Clicking a card opens a Dialog with full module details (description, IO,
 * key components, failure modes, unknowns, lead time).
 *
 * @related
 * - Card component: src/app/(platform)/the-forge/cad-lab/components/module-image-card.tsx
 * - Original animation: src/app/(platform)/the-forge/components/system-blueprint.tsx
 * - Build detail layout: src/app/(platform)/the-forge/cad-lab/build/page.tsx
 */

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, ArrowRight, ArrowRightLeft, Clock, Download, Info, Maximize2, Pencil, Wrench, X } from "lucide-react"
import { ModuleImageCard } from "./module-image-card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { EditableList } from "../../components/editable-list"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ────────────────────────────────────────────────────────────

interface ModuleImageGridProps {
  modules: CadLabModule[]
  revealedModuleIds: Set<string>
  expandedModuleId: string | null
  onToggleExpand: (id: string) => void
  onModuleSave?: (updated: CadLabModule) => void
  onRetryModule?: (moduleId: string) => void
}

// ─── Module Detail Dialog ─────────────────────────────────────────────

function ModuleDetailDialog({
  module,
  open,
  onOpenChange,
  onSave,
}: {
  module: CadLabModule
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: (updated: CadLabModule) => void
}): React.ReactNode {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<CadLabModule>(module)

  // Reset draft and exit edit mode when a different module opens
  useEffect(() => {
    setDraft(module)
    setIsEditing(false)
  }, [module])

  const updateDraft = <K extends keyof CadLabModule>(key: K, value: CadLabModule[K]): void => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleSaveEdit = (): void => {
    if (onSave) {
      // Filter empty strings from list fields
      const cleaned: CadLabModule = {
        ...draft,
        inputs: draft.inputs.filter((s) => s.trim()),
        outputs: draft.outputs.filter((s) => s.trim()),
        keyParts: draft.keyParts.filter((s) => s.trim()),
        failureModes: draft.failureModes.filter((s) => s.trim()),
        unknowns: draft.unknowns.filter((s) => s.trim()),
      }
      onSave(cleaned)
    }
    setIsEditing(false)
  }

  const handleCancelEdit = (): void => {
    setDraft(module)
    setIsEditing(false)
  }

  async function handleDownload() {
    if (!module.imageUrl) return
    try {
      const res = await fetch(module.imageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${module.name.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}-blueprint.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Fallback: open in new tab
      window.open(module.imageUrl, "_blank")
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          {isEditing ? (
            <>
              <DialogTitle>
                <Input
                  value={draft.name}
                  onChange={(e) => updateDraft("name", e.target.value)}
                  className="text-lg font-semibold"
                />
              </DialogTitle>
              <DialogDescription className="sr-only">Edit module details</DialogDescription>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <DialogTitle>{module.name}</DialogTitle>
                {onSave && (
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
              <DialogDescription>{module.purpose}</DialogDescription>
            </>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          <div className="space-y-6">
            {/* Illustration (view-only in both modes) */}
            {module.imageStatus === "complete" && module.imageUrl && !isEditing && (
              <div className="rounded-lg overflow-hidden border bg-muted/5">
                <div className="relative group">
                  <button
                    onClick={() => setLightboxOpen(true)}
                    className="w-full cursor-zoom-in"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={module.imageUrl}
                      alt={`Engineering blueprint of ${module.name}`}
                      className="w-full h-auto object-contain"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 rounded-full p-2 shadow-sm">
                        <Maximize2 className="h-4 w-4 text-foreground" />
                      </div>
                    </div>
                  </button>
                </div>
                <div className="flex items-center justify-between px-3 py-2 border-t">
                  <p className="text-[10px] text-muted-foreground italic">
                    Conceptual illustration — not an engineering drawing
                  </p>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleDownload}>
                    <Download className="h-3 w-3" />
                    Download
                  </Button>
                </div>
              </div>
            )}
            {module.imageStatus === "generating" && (
              <div className="rounded-lg overflow-hidden border bg-muted/5 p-3 h-48 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Generating illustration...</p>
              </div>
            )}

            {/* Purpose (edit mode only — in view mode it's the DialogDescription) */}
            {isEditing && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Purpose</p>
                <Textarea
                  value={draft.purpose}
                  onChange={(e) => updateDraft("purpose", e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            )}

            {/* Description */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
              {isEditing ? (
                <Textarea
                  value={draft.description}
                  onChange={(e) => updateDraft("description", e.target.value)}
                  rows={4}
                  className="resize-y text-sm"
                />
              ) : (
                <p className="text-sm text-foreground">{module.description}</p>
              )}
            </div>

            {/* Why This Module Matters */}
            {(isEditing || module.whyItMatters) && (
              <div className={isEditing ? undefined : "border-l-2 border-international-orange pl-3"}>
                <p className="text-xs font-semibold text-foreground mb-0.5">Why This Module Matters</p>
                {isEditing ? (
                  <Textarea
                    value={draft.whyItMatters || ""}
                    onChange={(e) => updateDraft("whyItMatters", e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                    placeholder="Why is this module critical to the system?"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{module.whyItMatters}</p>
                )}
              </div>
            )}

            {/* IO Flow */}
            {isEditing ? (
              <div className="space-y-4">
                <EditableList
                  items={draft.inputs}
                  onChange={(items) => updateDraft("inputs", items)}
                  placeholder="e.g. Pressurised feed stream"
                  label="Inputs"
                  icon={ArrowRightLeft}
                />
                <EditableList
                  items={draft.outputs}
                  onChange={(items) => updateDraft("outputs", items)}
                  placeholder="e.g. Filtered output"
                  label="Outputs"
                  icon={ArrowRightLeft}
                />
              </div>
            ) : (module.inputs.length > 0 || module.outputs.length > 0) ? (
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <p className="font-semibold text-muted-foreground mb-1">Inputs</p>
                  {module.inputs.map((inp, i) => (
                    <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{inp}</span>
                  ))}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="font-semibold text-muted-foreground mb-1">Outputs</p>
                  {module.outputs.map((out, i) => (
                    <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{out}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Key Components */}
            {isEditing ? (
              <EditableList
                items={draft.keyParts}
                onChange={(items) => updateDraft("keyParts", items)}
                placeholder="e.g. Chemical-resistant pump, 316L"
                label="Key Components"
                icon={Wrench}
              />
            ) : module.keyParts.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Key Components</p>
                <div className="flex flex-wrap gap-1.5">
                  {module.keyParts.map((part, i) => (
                    <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{part}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Failure Modes & Unknowns */}
            {isEditing ? (
              <div className="space-y-4">
                <EditableList
                  items={draft.failureModes}
                  onChange={(items) => updateDraft("failureModes", items)}
                  placeholder="e.g. Seal degradation"
                  label="Failure Modes"
                  icon={AlertTriangle}
                />
                <EditableList
                  items={draft.unknowns}
                  onChange={(items) => updateDraft("unknowns", items)}
                  placeholder="e.g. Operating temperature range"
                  label="Unknowns"
                  icon={Info}
                />
              </div>
            ) : (module.failureModes.length > 0 || module.unknowns.length > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {module.failureModes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Failure Modes</p>
                    <ul className="space-y-1">
                      {module.failureModes.map((fm, i) => (
                        <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />{fm}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {module.unknowns.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Unknowns</p>
                    <ul className="space-y-1">
                      {module.unknowns.map((u, i) => (
                        <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                          <Info className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />{u}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            {/* Lead Time */}
            {isEditing ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Lead Time (weeks)</p>
                <Input
                  type="number"
                  min={0}
                  max={104}
                  value={draft.leadWeeks}
                  onChange={(e) => updateDraft("leadWeeks", Number(e.target.value) || 0)}
                  className="w-32 text-sm"
                />
              </div>
            ) : module.leadWeeks > 0 ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {module.leadWeeks} week{module.leadWeeks !== 1 ? "s" : ""} lead time
                </Badge>
              </div>
            ) : null}
          </div>
        </div>

        {/* Edit mode footer */}
        {isEditing && (
          <DialogFooter>
            <div className="flex w-full items-center justify-between">
              <Button variant="secondary" onClick={handleCancelEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                Save changes
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>

    {/* Full-screen lightbox */}
    <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
      <DialogContent size="xl" className="max-w-[95vw] max-h-[95vh] p-0">
        <div className="relative">
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="bg-background/90 hover:bg-background shadow-sm"
              onClick={handleDownload}
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="bg-background/90 hover:bg-background shadow-sm"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="overflow-auto max-h-[95vh] p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={module.imageUrl || ""}
              alt={`Technical blueprint: ${module.name}`}
              className="w-full h-auto"
            />
          </div>
        </div>
        <DialogTitle className="sr-only">{module.name} Technical Blueprint</DialogTitle>
      </DialogContent>
    </Dialog>
    </>
  )
}

// ─── Component ────────────────────────────────────────────────────────

export function ModuleImageGrid({
  modules,
  revealedModuleIds,
  expandedModuleId,
  onToggleExpand,
  onModuleSave,
  onRetryModule,
}: ModuleImageGridProps): React.ReactNode {
  const visibleModules = modules.filter((m) => revealedModuleIds.has(m.id))
  const selectedModule = expandedModuleId
    ? modules.find((m) => m.id === expandedModuleId) ?? null
    : null

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {visibleModules.map((module) => (
            <motion.div
              key={module.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { type: "spring", stiffness: 300, damping: 24 },
              }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
              layout
            >
              <ModuleImageCard
                module={module}
                isExpanded={expandedModuleId === module.id}
                onToggleExpand={() => onToggleExpand(module.id)}
                onRetry={onRetryModule ? () => onRetryModule(module.id) : undefined}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Module detail dialog */}
      {selectedModule && (
        <ModuleDetailDialog
          module={selectedModule}
          open={true}
          onOpenChange={(open) => {
            if (!open) onToggleExpand(selectedModule.id)
          }}
          onSave={onModuleSave}
        />
      )}
    </>
  )
}
