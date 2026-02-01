'use client'

import type { CoverageStatus, DomainCategory } from '@/types/blueprints'

// Node types for the visual blueprint canvas
export type BlueprintNodeType = 'system' | 'component' | 'compliance' | 'product'

export interface BlueprintNode {
  id: string
  title: string
  description?: string
  type: BlueprintNodeType
  category?: DomainCategory
  x: number
  y: number
  status: CoverageStatus
  connections: string[]
  domainId?: string
  coverageId?: string
  // Visual properties
  icon?: string
  size?: 'sm' | 'md' | 'lg'
}

export interface BlueprintEdge {
  id: string
  source: string
  target: string
  label?: string
  style?: 'solid' | 'dashed' | 'dotted'
}

export interface Archetype {
  id: string
  name: string
  description: string
  nodes: BlueprintNode[]
  silhouette: string // SVG path
  silhouetteViewBox?: string
  silhouetteTransform?: string
  defaultZoom?: number
  centerOffset?: { x: number; y: number }
}

export interface SkillNode {
  id: string
  name: string
  description?: string
  status: 'mastered' | 'learning' | 'unknown' | 'needs_expert'
  parentId?: string
  children?: SkillNode[]
  questions?: string[]
  resources?: { title: string; url: string }[]
}

export interface ExpertMatch {
  id: string
  name: string
  avatar?: string
  title: string
  hourlyRate?: number
  rating?: number
  reviewCount?: number
  relevantSkills: string[]
  availability?: 'available' | 'busy' | 'unavailable'
}

export interface SupplierMatch {
  id: string
  name: string
  logo?: string
  leadTime?: string
  priceRange?: string
  rating?: number
  capabilities: string[]
  location?: string
}

// Canvas interaction state
export interface CanvasState {
  scale: number
  position: { x: number; y: number }
  isDragging: boolean
  selectedNodeId: string | null
}

// Status color mappings
export const STATUS_COLORS: Record<CoverageStatus, {
  bg: string
  text: string
  border: string
  icon: string
  label: string
}> = {
  gap: {
    bg: 'bg-orange-50',
    text: 'text-international-orange',
    border: 'border-international-orange/50',
    icon: 'text-international-orange',
    label: 'Knowledge Gap',
  },
  partial: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-300',
    icon: 'text-amber-500',
    label: 'Partial Coverage',
  },
  covered: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    icon: 'text-emerald-500',
    label: 'Covered',
  },
  not_needed: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border',
    icon: 'text-muted-foreground',
    label: 'Not Needed',
  },
}

// Node type visual mappings
export const NODE_TYPE_STYLES: Record<BlueprintNodeType, {
  badge: string
  defaultSize: 'sm' | 'md' | 'lg'
}> = {
  product: {
    badge: 'bg-slate-900 text-white',
    defaultSize: 'lg',
  },
  system: {
    badge: 'bg-blue-100 text-blue-700',
    defaultSize: 'md',
  },
  component: {
    badge: 'bg-purple-100 text-purple-700',
    defaultSize: 'md',
  },
  compliance: {
    badge: 'bg-rose-100 text-rose-700',
    defaultSize: 'sm',
  },
}
