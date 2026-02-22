"use client"

/**
 * @file module-image-grid.tsx — Animated grid of module blueprint cards.
 *
 * @description Renders CadLabModules as a responsive grid with framer-motion
 * stagger animation on first appearance. Images fill in progressively as
 * each Gemini call completes — the stagger fires on mount for the card layout,
 * while image updates are handled per-card without re-triggering the animation.
 *
 * Animation variants are adapted from the proven system-blueprint.tsx component.
 *
 * @related
 * - Card component: src/app/(platform)/the-forge/cad-lab/components/module-image-card.tsx
 * - Original animation: src/app/(platform)/the-forge/components/system-blueprint.tsx
 */

import { motion, type Variants } from "framer-motion"
import { ModuleImageCard } from "./module-image-card"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Animation Variants (from system-blueprint.tsx) ───────────────────

const gridContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
}

const moduleCardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
}

// ─── Types ────────────────────────────────────────────────────────────

interface ModuleImageGridProps {
  modules: CadLabModule[]
  expandedModuleId: string | null
  onToggleExpand: (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────

export function ModuleImageGrid({
  modules,
  expandedModuleId,
  onToggleExpand,
}: ModuleImageGridProps): React.ReactNode {
  return (
    <motion.div
      variants={gridContainerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      {modules.map((module) => (
        <motion.div key={module.id} variants={moduleCardVariants}>
          <ModuleImageCard
            module={module}
            isExpanded={expandedModuleId === module.id}
            onToggleExpand={() => onToggleExpand(module.id)}
          />
        </motion.div>
      ))}
    </motion.div>
  )
}
