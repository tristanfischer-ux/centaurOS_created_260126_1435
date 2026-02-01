'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { BlueprintCanvas } from './BlueprintCanvas'
import { KnowledgeSidebar } from './KnowledgeSidebar'
import type { BlueprintNode, Archetype } from './types'
import { ROCKET_ARCHETYPE } from './data/rocket-archetype'
import { generateArchetype } from './auto-layout'
import type { KnowledgeDomain, DomainCoverageWithDetails } from '@/types/blueprints'
import { cn } from '@/lib/utils'

interface VisualBlueprintViewProps {
  blueprintId?: string
  templateId?: string
  templateSlug?: string
  templateName?: string
  /** If provided, auto-generates the visual layout from these domains */
  domains?: KnowledgeDomain[]
  /** Coverage data to show status on nodes */
  coverage?: DomainCoverageWithDetails[]
  className?: string
  onCreateObjective?: (title: string, description: string) => void
}

// Pre-built archetypes for specific templates (hand-crafted layouts)
const STATIC_ARCHETYPES: Record<string, Archetype> = {
  'rockets': ROCKET_ARCHETYPE,
  'rocket': ROCKET_ARCHETYPE, // Alias
}

export function VisualBlueprintView({
  blueprintId,
  templateId,
  templateSlug,
  templateName = 'Blueprint',
  domains,
  coverage = [],
  className,
  onCreateObjective,
}: VisualBlueprintViewProps) {
  const [selectedNode, setSelectedNode] = useState<BlueprintNode | null>(null)
  
  // Determine which slug to use
  const slug = templateSlug || templateId || 'default'
  
  // Get or generate the archetype
  const archetype = useMemo(() => {
    // 1. Check for a pre-built static archetype first
    if (STATIC_ARCHETYPES[slug]) {
      return STATIC_ARCHETYPES[slug]
    }
    
    // 2. If domains are provided, auto-generate the layout
    if (domains && domains.length > 0) {
      return generateArchetype({
        templateSlug: slug,
        templateName,
        domains,
        coverage,
      })
    }
    
    // 3. Fall back to rocket as default demo
    return ROCKET_ARCHETYPE
  }, [slug, templateName, domains, coverage])
  
  const handleNodeSelect = useCallback((node: BlueprintNode) => {
    setSelectedNode(node)
  }, [])
  
  const handleCloseSidebar = useCallback(() => {
    setSelectedNode(null)
  }, [])

  return (
    <div className={cn("flex h-[700px] relative", className)}>
      {/* Main Canvas Area */}
      <motion.div 
        className="flex-1 relative"
        animate={{ 
          marginRight: selectedNode ? 0 : 0,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      >
        <BlueprintCanvas
          archetype={archetype}
          onNodeSelect={handleNodeSelect}
          selectedNodeId={selectedNode?.id}
          className="h-full"
        />
      </motion.div>
      
      {/* Knowledge Sidebar */}
      {selectedNode && (
        <KnowledgeSidebar
          node={selectedNode}
          onClose={handleCloseSidebar}
          onCreateObjective={onCreateObjective}
        />
      )}
    </div>
  )
}
