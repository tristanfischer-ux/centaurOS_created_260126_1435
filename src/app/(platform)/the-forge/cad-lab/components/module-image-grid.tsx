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

import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, ArrowRight, Clock, Info } from "lucide-react"
import { ModuleImageCard } from "./module-image-card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ────────────────────────────────────────────────────────────

interface ModuleImageGridProps {
  modules: CadLabModule[]
  revealedModuleIds: Set<string>
  expandedModuleId: string | null
  onToggleExpand: (id: string) => void
}

// ─── Module Detail Dialog ─────────────────────────────────────────────

function ModuleDetailDialog({
  module,
  open,
  onOpenChange,
}: {
  module: CadLabModule
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{module.name}</DialogTitle>
          <DialogDescription>{module.purpose}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Image */}
          {module.imageStatus === "complete" && module.imageUrl && (
            <div className="rounded-lg overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={module.imageUrl}
                alt={`Engineering blueprint of ${module.name}`}
                className="w-full h-auto max-h-64 object-contain"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
            <p className="text-sm text-foreground">{module.description}</p>
          </div>

          {/* Why This Module Matters */}
          {module.whyItMatters && (
            <div className="border-l-2 border-international-orange pl-3">
              <p className="text-xs font-semibold text-foreground mb-0.5">Why This Module Matters</p>
              <p className="text-sm text-muted-foreground">{module.whyItMatters}</p>
            </div>
          )}

          {/* IO Flow */}
          {(module.inputs.length > 0 || module.outputs.length > 0) && (
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
          )}

          {/* Key Components */}
          {module.keyParts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Key Components</p>
              <div className="flex flex-wrap gap-1.5">
                {module.keyParts.map((part, i) => (
                  <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{part}</span>
                ))}
              </div>
            </div>
          )}

          {/* Failure Modes & Unknowns */}
          {(module.failureModes.length > 0 || module.unknowns.length > 0) && (
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
          )}

          {/* Lead Time */}
          {module.leadWeeks > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {module.leadWeeks} week{module.leadWeeks !== 1 ? "s" : ""} lead time
              </Badge>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Component ────────────────────────────────────────────────────────

export function ModuleImageGrid({
  modules,
  revealedModuleIds,
  expandedModuleId,
  onToggleExpand,
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
        />
      )}
    </>
  )
}
