'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, 
  Minus, 
  Maximize2, 
  Move,
  AlertCircle,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Cpu,
  Cog,
  FileCheck,
  Rocket,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { BlueprintNode, BlueprintNodeType, Archetype } from './types'
import { STATUS_COLORS, NODE_TYPE_STYLES } from './types'
import type { CoverageStatus } from '@/types/blueprints'

interface BlueprintCanvasProps {
  archetype: Archetype
  onNodeSelect: (node: BlueprintNode) => void
  selectedNodeId?: string | null
  className?: string
}

// Get the appropriate icon for node type
const getNodeTypeIcon = (type: BlueprintNodeType) => {
  switch (type) {
    case 'system': return Cpu
    case 'component': return Cog
    case 'compliance': return FileCheck
    case 'product': return Rocket
    default: return Circle
  }
}

// Get status icon
const getStatusIcon = (status: CoverageStatus) => {
  switch (status) {
    case 'gap': return AlertCircle
    case 'partial': return AlertTriangle
    case 'covered': return CheckCircle2
    case 'not_needed': return Circle
    default: return Circle
  }
}

export function BlueprintCanvas({ 
  archetype,
  onNodeSelect,
  selectedNodeId,
  className,
}: BlueprintCanvasProps) {
  // Canvas state
  const [scale, setScale] = useState(archetype.defaultZoom || 1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Center the canvas on mount
  useEffect(() => {
    if (containerRef.current && archetype.centerOffset) {
      setPosition({
        x: archetype.centerOffset.x,
        y: archetype.centerOffset.y,
      })
    }
  }, [archetype.centerOffset])

  // Wheel zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.001
    setScale(prev => Math.min(Math.max(prev + delta, 0.3), 2.5))
  }, [])

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't drag if clicking on a node
    if ((e.target as HTMLElement).closest('.blueprint-node')) return
    
    setIsDragging(true)
    setDragStart({ 
      x: e.clientX - position.x, 
      y: e.clientY - position.y 
    })
  }, [position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Zoom controls
  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 2.5))
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.3))
  const resetView = () => {
    setScale(archetype.defaultZoom || 1)
    setPosition(archetype.centerOffset || { x: 0, y: 0 })
  }

  // Get connection line path - improved for horizontal branches
  const getConnectionPath = (source: BlueprintNode, target: BlueprintNode) => {
    const sourceX = source.x + 100 // Center of node
    const sourceY = source.y + 45  // Slightly lower (mid-height of node)
    const targetX = target.x + 100
    const targetY = target.y + 45
    
    // Calculate horizontal distance to determine curve style
    const dx = Math.abs(targetX - sourceX)
    const dy = Math.abs(targetY - sourceY)
    
    // If horizontal distance is large (side branches), use horizontal-first curve
    if (dx > 150) {
      const midX = (sourceX + targetX) / 2
      return `M ${sourceX} ${sourceY} 
              C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`
    }
    
    // For vertical connections (central spine), use vertical curve
    const midY = (sourceY + targetY) / 2
    return `M ${sourceX} ${sourceY} 
            C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-slate-50/50", className)}>
      {/* Canvas Toolbar */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 bg-white/95 backdrop-blur-sm p-2 rounded-lg shadow-lg border border-slate-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={zoomIn}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Zoom In</TooltipContent>
          </Tooltip>
          
          <div className="text-center text-xs font-mono text-slate-500 py-1">
            {Math.round(scale * 100)}%
          </div>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={zoomOut}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Zoom Out</TooltipContent>
          </Tooltip>
          
          <div className="h-px bg-slate-200 my-1" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={resetView}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Reset View</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Legend - positioned to not be cut off */}
      <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-slate-200 min-w-[140px]">
        <div className="text-xs font-semibold text-slate-600 mb-2">Status Legend</div>
        <div className="space-y-1.5">
          {Object.entries(STATUS_COLORS).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-2 text-xs whitespace-nowrap">
              <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", colors.bg, "ring-1", colors.border)} />
              <span className="text-slate-600">{colors.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hint for first-time users */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-slate-200 text-xs text-slate-500">
          <Move className="h-3 w-3" />
          <span>Drag to pan • Scroll to zoom • Click nodes to explore</span>
        </div>
      </div>

      {/* The Interactive Canvas */}
      <div 
        ref={containerRef}
        className={cn(
          "h-[650px] relative cursor-grab active:cursor-grabbing select-none",
          // Beautiful blueprint grid pattern
          "bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)]",
          "[background-size:24px_24px]"
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div 
          ref={canvasRef}
          className="absolute origin-center transition-transform duration-75 ease-out"
          style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <svg 
            width="1100" 
            height="750" 
            className="pointer-events-none overflow-visible"
            viewBox={archetype.silhouetteViewBox || "0 0 1100 750"}
          >
            {/* ═══ VISUAL ZONES ═══ */}
            
            {/* Left Zone: Compliance & Regulatory */}
            <g className="zone-compliance">
              <rect 
                x="5" y="20" width="220" height="380" 
                rx="12"
                fill="#fef2f2"
                stroke="#fecaca"
                strokeWidth="1"
                strokeDasharray="4,2"
                opacity="0.6"
              />
              <text x="115" y="415" textAnchor="middle" className="fill-rose-400 text-[11px] font-medium">
                REGULATORY
              </text>
            </g>
            
            {/* Center Zone: Physical Systems */}
            <g className="zone-physical">
              <rect 
                x="195" y="10" width="510" height="710" 
                rx="16"
                fill="#f8fafc"
                stroke="#e2e8f0"
                strokeWidth="1"
                opacity="0.5"
              />
              <text x="450" y="735" textAnchor="middle" className="fill-slate-400 text-[11px] font-medium">
                PHYSICAL SYSTEMS
              </text>
            </g>
            
            {/* Right Zone: Additional Compliance */}
            <g className="zone-support">
              <rect 
                x="875" y="20" width="220" height="380" 
                rx="12"
                fill="#f0fdf4"
                stroke="#bbf7d0"
                strokeWidth="1"
                strokeDasharray="4,2"
                opacity="0.6"
              />
              <text x="985" y="415" textAnchor="middle" className="fill-emerald-400 text-[11px] font-medium">
                COMPLIANCE
              </text>
            </g>
            
            {/* Decorative Rocket Silhouette */}
            <g className="opacity-[0.06]" transform={archetype.silhouetteTransform}>
              <path 
                d={archetype.silhouette}
                fill="#334155"
                stroke="#334155"
                strokeWidth="2"
              />
            </g>

            {/* Connection Lines - improved visibility */}
            <g className="connections">
              {archetype.nodes.map(node => 
                node.connections.map(targetId => {
                  const target = archetype.nodes.find(n => n.id === targetId)
                  if (!target) return null
                  
                  const isHighlighted = 
                    hoveredNode === node.id || 
                    hoveredNode === targetId ||
                    selectedNodeId === node.id ||
                    selectedNodeId === targetId
                  
                  // Check if this is a cross-zone connection (compliance to physical)
                  const isCrossZone = node.type === 'compliance' || target.type === 'compliance'
                  
                  return (
                    <motion.path 
                      key={`${node.id}-${targetId}`}
                      d={getConnectionPath(node, target)}
                      fill="none"
                      stroke={isHighlighted ? "#f97316" : isCrossZone ? "#94a3b8" : "#64748b"}
                      strokeWidth={isHighlighted ? 3 : 2}
                      strokeDasharray={isCrossZone ? "8,4" : "0"}
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ 
                        pathLength: 1, 
                        opacity: isHighlighted ? 1 : isCrossZone ? 0.4 : 0.6,
                      }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  )
                })
              )}
            </g>

            {/* Nodes */}
            {archetype.nodes.map((node) => {
              const StatusIcon = getStatusIcon(node.status)
              const TypeIcon = getNodeTypeIcon(node.type)
              const statusColors = STATUS_COLORS[node.status]
              const typeStyles = NODE_TYPE_STYLES[node.type]
              const isSelected = selectedNodeId === node.id
              const isHovered = hoveredNode === node.id
              
              return (
                <foreignObject 
                  key={node.id} 
                  x={node.x} 
                  y={node.y} 
                  width="220" 
                  height="100"
                  className="pointer-events-auto overflow-visible"
                >
                  <motion.div 
                    className="blueprint-node"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: Math.random() * 0.3 }}
                  >
                    <div 
                      onClick={(e) => { 
                        e.stopPropagation()
                        onNodeSelect(node)
                      }}
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      className={cn(
                        "w-[200px] p-3 rounded-xl border-2 shadow-sm cursor-pointer",
                        "bg-white transition-all duration-200",
                        "hover:shadow-lg hover:scale-[1.03]",
                        isSelected && "ring-4 ring-international-orange/20 border-international-orange shadow-lg scale-[1.02]",
                        !isSelected && statusColors.border,
                        node.status === 'gap' && !isSelected && "border-l-4 border-l-international-orange"
                      )}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-2">
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0",
                            typeStyles.badge
                          )}
                        >
                          <TypeIcon className="h-2.5 w-2.5 mr-1" />
                          {node.type}
                        </Badge>
                        <StatusIcon className={cn("h-4 w-4", statusColors.icon)} />
                      </div>
                      
                      {/* Title */}
                      <div className="font-semibold text-sm text-slate-900 leading-tight">
                        {node.title}
                      </div>
                      
                      {/* Description preview */}
                      {node.description && (
                        <div className="text-xs text-slate-500 mt-1 line-clamp-1">
                          {node.description}
                        </div>
                      )}
                      
                      {/* Status indicator for gaps */}
                      {node.status === 'gap' && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-international-orange font-medium">
                          <Sparkles className="h-3 w-3" />
                          <span>Needs attention</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </foreignObject>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}
