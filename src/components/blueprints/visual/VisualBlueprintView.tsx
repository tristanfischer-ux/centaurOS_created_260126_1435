'use client'

import React, { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { BlueprintCanvas } from './BlueprintCanvas'
import { KnowledgeSidebar } from './KnowledgeSidebar'
import type { BlueprintNode, Archetype } from './types'
import { ROCKET_ARCHETYPE } from './data/rocket-archetype'
import { cn } from '@/lib/utils'

interface VisualBlueprintViewProps {
  blueprintId?: string
  templateId?: string
  className?: string
  onCreateObjective?: (title: string, description: string) => void
}

// Map template IDs to archetypes
const ARCHETYPES: Record<string, Archetype> = {
  'rocket': ROCKET_ARCHETYPE,
  'hardware-startup': ROCKET_ARCHETYPE, // Default to rocket for now
  'default': ROCKET_ARCHETYPE,
}

export function VisualBlueprintView({
  blueprintId,
  templateId = 'rocket',
  className,
  onCreateObjective,
}: VisualBlueprintViewProps) {
  const [selectedNode, setSelectedNode] = useState<BlueprintNode | null>(null)
  
  // Get the archetype based on template
  const archetype = ARCHETYPES[templateId] || ARCHETYPES['default']
  
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
