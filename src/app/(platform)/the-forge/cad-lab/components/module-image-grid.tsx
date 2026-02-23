"use client"

/**
 * @file module-image-grid.tsx — Animated grid of module blueprint cards.
 *
 * @description Renders CadLabModules as a responsive grid with AnimatePresence
 * for progressive reveal. Each module animates in individually when it joins
 * the revealedModuleIds set (i.e., when its image completes or times out).
 *
 * @related
 * - Card component: src/app/(platform)/the-forge/cad-lab/components/module-image-card.tsx
 * - Original animation: src/app/(platform)/the-forge/components/system-blueprint.tsx
 */

import { motion, AnimatePresence } from "framer-motion"
import { ModuleImageCard } from "./module-image-card"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ────────────────────────────────────────────────────────────

interface ModuleImageGridProps {
  modules: CadLabModule[]
  revealedModuleIds: Set<string>
  expandedModuleId: string | null
  onToggleExpand: (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────

export function ModuleImageGrid({
  modules,
  revealedModuleIds,
  expandedModuleId,
  onToggleExpand,
}: ModuleImageGridProps): React.ReactNode {
  const visibleModules = modules.filter((m) => revealedModuleIds.has(m.id))

  return (
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
  )
}
