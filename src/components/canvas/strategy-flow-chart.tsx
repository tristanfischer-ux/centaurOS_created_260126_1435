'use client'

/**
 * @file strategy-flow-chart.tsx
 *
 * @description SVG-based Sankey flow chart for visualizing strategic goal
 * decomposition. Renders nodes as rounded rectangles and links as curved
 * flow paths with proportional widths. Supports hover tooltips and click
 * interaction for drill-down.
 *
 * Follows the same custom SVG rendering pattern as the Money Map Sankey
 * chart (src/components/money-map/sankey-chart.tsx).
 *
 * @component
 *
 * @example
 * <StrategyFlowChart
 *   layout={sankeyLayout}
 *   onNodeClick={handleNodeClick}
 * />
 */

import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { SankeyLayout, SankeyNode, SankeyLink } from '@/lib/canvas/sankey-layout'

// ============================================================================
// TYPES
// ============================================================================

interface StrategyFlowChartProps {
  /** Computed Sankey layout with positioned nodes and links */
  layout: SankeyLayout
  /** Called when a node is clicked (e.g., for drill-down) */
  onNodeClick?: (node: SankeyNode) => void
  /** Additional CSS classes */
  className?: string
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  content: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LINK_OPACITY = 0.35
const LINK_HOVER_OPACITY = 0.6
const NODE_RADIUS = 6
const LABEL_FONT_SIZE = 11
const COUNT_FONT_SIZE = 10

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * StrategyFlowChart — Renders a Sankey-inspired flow diagram as an SVG.
 *
 * @description Layered rendering order:
 * 1. Links (flow paths with opacity)
 * 2. Nodes (rounded rectangles)
 * 3. Labels (node names and task counts)
 *
 * @param layout - Pre-computed Sankey layout
 * @param onNodeClick - Click handler for node interaction
 * @param className - Additional CSS classes
 */
export function StrategyFlowChart({
  layout,
  onNodeClick,
  className,
}: StrategyFlowChartProps) {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    content: '',
  })
  const svgRef = useRef<SVGSVGElement>(null)

  const handleNodeMouseEnter = useCallback(
    (node: SankeyNode, event: React.MouseEvent) => {
      setHoveredNode(node.id)
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect) {
        setTooltip({
          visible: true,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top - 10,
          content: `${node.label}\n${node.metadata.taskCount} task${node.metadata.taskCount !== 1 ? 's' : ''}`,
        })
      }
    },
    []
  )

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null)
    setTooltip((prev) => ({ ...prev, visible: false }))
  }, [])

  const handleNodeClick = useCallback(
    (node: SankeyNode) => {
      onNodeClick?.(node)
    },
    [onNodeClick]
  )

  if (layout.nodes.length === 0) {
    return null
  }

  const { nodes, links, width, height } = layout

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Strategy flow diagram showing goal decomposition"
      >
        {/* Layer 1: Links (flow paths) */}
        <g className="links">
          {links.map((link) => (
            <LinkPath
              key={link.id}
              link={link}
              isHovered={hoveredLink === link.id}
              isRelatedToHoveredNode={
                hoveredNode === link.sourceId ||
                hoveredNode === link.targetId
              }
              onMouseEnter={() => setHoveredLink(link.id)}
              onMouseLeave={() => setHoveredLink(null)}
            />
          ))}
        </g>

        {/* Layer 2: Nodes (rounded rectangles) */}
        <g className="nodes">
          {nodes.map((node) => (
            <NodeRect
              key={node.id}
              node={node}
              isHovered={hoveredNode === node.id}
              isClickable={
                node.metadata.type === 'goal' && !!onNodeClick
              }
              onMouseEnter={(e) => handleNodeMouseEnter(node, e)}
              onMouseLeave={handleNodeMouseLeave}
              onClick={() => handleNodeClick(node)}
            />
          ))}
        </g>

        {/* Layer 3: Labels */}
        <g className="labels">
          {nodes.map((node) => (
            <NodeLabel key={`label-${node.id}`} node={node} />
          ))}
        </g>
      </svg>

      {/* Tooltip overlay */}
      {tooltip.visible && (
        <div
          className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs shadow-lg whitespace-pre-line max-w-[200px]"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Renders a single flow link as an SVG path.
 */
function LinkPath({
  link,
  isHovered,
  isRelatedToHoveredNode,
  onMouseEnter,
  onMouseLeave,
}: {
  link: SankeyLink
  isHovered: boolean
  isRelatedToHoveredNode: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const opacity =
    isHovered || isRelatedToHoveredNode ? LINK_HOVER_OPACITY : LINK_OPACITY

  return (
    <path
      d={link.path}
      fill={link.color}
      opacity={opacity}
      className="transition-opacity duration-200"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <title>
        {link.value} task{link.value !== 1 ? 's' : ''}
      </title>
    </path>
  )
}

/**
 * Renders a single node as a rounded rectangle.
 */
function NodeRect({
  node,
  isHovered,
  isClickable,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  node: SankeyNode
  isHovered: boolean
  isClickable: boolean
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  onClick: () => void
}) {
  return (
    <rect
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      rx={NODE_RADIUS}
      ry={NODE_RADIUS}
      fill={node.color}
      opacity={isHovered ? 1 : 0.85}
      className={cn(
        'transition-opacity duration-200',
        isClickable && 'cursor-pointer'
      )}
      stroke={isHovered ? 'hsl(var(--foreground))' : 'none'}
      strokeWidth={isHovered ? 1.5 : 0}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={isClickable ? onClick : undefined}
    />
  )
}

/**
 * Renders a node's label (name + task count).
 */
function NodeLabel({ node }: { node: SankeyNode }) {
  const centerY = node.y + node.height / 2
  const isWideEnough = node.height >= 36

  // Truncate label to fit
  const maxChars = Math.floor(node.width / 7)
  const displayLabel =
    node.label.length > maxChars
      ? node.label.slice(0, maxChars - 2) + '...'
      : node.label

  return (
    <g>
      {/* Node label */}
      <text
        x={node.x + node.width / 2}
        y={isWideEnough ? centerY - 4 : centerY + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={LABEL_FONT_SIZE}
        fontWeight={600}
        fill="white"
        className="pointer-events-none select-none"
      >
        {displayLabel}
      </text>

      {/* Task count (only show if node is tall enough) */}
      {isWideEnough && (
        <text
          x={node.x + node.width / 2}
          y={centerY + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={COUNT_FONT_SIZE}
          fill="rgba(255, 255, 255, 0.75)"
          className="pointer-events-none select-none"
        >
          {node.metadata.taskCount} task
          {node.metadata.taskCount !== 1 ? 's' : ''}
        </text>
      )}
    </g>
  )
}
