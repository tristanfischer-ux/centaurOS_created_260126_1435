/**
 * Auto-Layout System for Visual Blueprints
 * 
 * Automatically generates node positions and connections from template domains.
 * Creates organized layouts with zones for different domain categories.
 */

import type { Archetype, BlueprintNode, BlueprintNodeType } from './types'
import type { KnowledgeDomain, DomainCategory, DomainCoverageWithDetails, CoverageStatus } from '@/types/blueprints'

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

interface LayoutConfig {
  canvasWidth: number
  canvasHeight: number
  nodeWidth: number
  nodeHeight: number
  verticalSpacing: number
  horizontalSpacing: number
  zones: {
    left: { x: number; width: number; categories: DomainCategory[] }
    center: { x: number; width: number; categories: DomainCategory[] }
    right: { x: number; width: number; categories: DomainCategory[] }
  }
}

const DEFAULT_LAYOUT: LayoutConfig = {
  canvasWidth: 1100,
  canvasHeight: 750,
  nodeWidth: 200,
  nodeHeight: 90,
  verticalSpacing: 130,
  horizontalSpacing: 240,
  zones: {
    left: { 
      x: 20, 
      width: 220, 
      categories: ['Regulatory'] 
    },
    center: { 
      x: 280, 
      width: 540, 
      categories: ['Electronics', 'Mechanical', 'Software', 'Manufacturing', 'Operations'] 
    },
    right: { 
      x: 860, 
      width: 220, 
      categories: ['Business'] 
    },
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE SILHOUETTES
// ═══════════════════════════════════════════════════════════════════════════

// SVG paths for different template types (centered at x=550)
const TEMPLATE_SILHOUETTES: Record<string, { path: string; viewBox: string }> = {
  // Rocket - existing
  'rockets': {
    path: `M 550 20 C 570 20, 600 50, 610 110 L 620 190 L 625 270 L 630 390 L 635 490 L 670 530 L 690 610 L 650 610 L 645 690 L 600 690 L 600 640 L 550 670 L 500 640 L 500 690 L 455 690 L 450 610 L 410 610 L 430 530 L 465 490 L 470 390 L 475 270 L 480 190 L 490 110 C 500 50, 530 20, 550 20 Z`,
    viewBox: '0 0 1100 750',
  },
  // Satellite - orbital spacecraft
  'satellites': {
    path: `M 450 350 L 450 300 L 350 300 L 350 250 L 300 250 L 300 450 L 350 450 L 350 400 L 450 400 L 450 350 M 550 280 L 750 280 L 750 420 L 550 420 Z M 750 320 L 850 280 L 850 420 L 750 380 Z`,
    viewBox: '0 0 1100 750',
  },
  // Server rack - AI Data Centre
  'ai-datacentre': {
    path: `M 400 100 L 700 100 L 700 650 L 400 650 Z M 420 130 L 680 130 L 680 180 L 420 180 Z M 420 200 L 680 200 L 680 250 L 420 250 Z M 420 270 L 680 270 L 680 320 L 420 320 Z M 420 340 L 680 340 L 680 390 L 420 390 Z M 420 410 L 680 410 L 680 460 L 420 460 Z M 420 480 L 680 480 L 680 530 L 420 530 Z`,
    viewBox: '0 0 1100 750',
  },
  // Pill/capsule - Pharmaceuticals
  'pharmaceuticals': {
    path: `M 400 200 C 400 100, 700 100, 700 200 L 700 550 C 700 650, 400 650, 400 550 Z M 400 375 L 700 375`,
    viewBox: '0 0 1100 750',
  },
  // Robot arm - Robotics
  'robotics': {
    path: `M 500 600 L 600 600 L 600 500 L 650 500 L 650 350 L 600 350 L 600 250 L 700 250 L 700 150 L 750 150 L 750 100 L 850 100 L 850 200 L 750 200 L 750 300 L 650 300 L 650 400 L 550 400 L 550 550 L 500 550 Z`,
    viewBox: '0 0 1100 750',
  },
  // Circuit board - Consumer Electronics
  'consumer-electronics': {
    path: `M 350 150 L 750 150 L 750 600 L 350 600 Z M 400 200 L 500 200 L 500 300 L 400 300 Z M 550 200 L 700 200 L 700 250 L 550 250 Z M 400 350 L 700 350 L 700 400 L 400 400 Z M 550 450 L 700 450 L 700 550 L 550 550 Z`,
    viewBox: '0 0 1100 750',
  },
  // Cloud - SaaS
  'saas': {
    path: `M 350 400 C 250 400, 250 300, 350 280 C 350 200, 450 150, 550 200 C 650 120, 800 180, 800 300 C 900 300, 900 400, 800 400 Z`,
    viewBox: '0 0 1100 750',
  },
  // Phone - Mobile App
  'mobile-app': {
    path: `M 450 80 L 650 80 C 680 80, 700 100, 700 130 L 700 620 C 700 650, 680 670, 650 670 L 450 670 C 420 670, 400 650, 400 620 L 400 130 C 400 100, 420 80, 450 80 Z M 520 110 L 580 110 M 550 630 L 550 630`,
    viewBox: '0 0 1100 750',
  },
  // Generic fallback - hexagon grid
  'default': {
    path: `M 550 150 L 650 200 L 650 300 L 550 350 L 450 300 L 450 200 Z M 550 400 L 650 450 L 650 550 L 550 600 L 450 550 L 450 450 Z`,
    viewBox: '0 0 1100 750',
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN → NODE CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a knowledge domain to a blueprint node type
 */
function domainToNodeType(domain: KnowledgeDomain): BlueprintNodeType {
  // Root domains (depth 0) are systems
  if (domain.depth === 0) return 'system'
  
  // Regulatory domains are compliance
  if (domain.category === 'Regulatory') return 'compliance'
  
  // Everything else is a component
  return 'component'
}

/**
 * Get coverage status for a domain, defaulting to 'gap' if no coverage exists
 */
function getDomainStatus(
  domain: KnowledgeDomain, 
  coverage: DomainCoverageWithDetails[]
): CoverageStatus {
  const cov = coverage.find(c => c.domain_id === domain.id)
  return cov?.status || 'gap'
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-LAYOUT ALGORITHM
// ═══════════════════════════════════════════════════════════════════════════

interface LayoutedNode extends BlueprintNode {
  zone: 'left' | 'center' | 'right'
  row: number
  col: number
}

/**
 * Auto-layout algorithm that positions nodes by category and hierarchy
 */
function autoLayoutNodes(
  domains: KnowledgeDomain[],
  coverage: DomainCoverageWithDetails[],
  config: LayoutConfig = DEFAULT_LAYOUT
): BlueprintNode[] {
  // Step 1: Filter to only root and first-level domains (depth 0 and 1)
  // This keeps the visual clean - deeper domains show in the sidebar
  const visibleDomains = domains.filter(d => d.depth <= 1)
  
  // Step 2: Group domains by zone based on category
  const leftDomains = visibleDomains.filter(d => 
    config.zones.left.categories.includes(d.category as DomainCategory)
  )
  const rightDomains = visibleDomains.filter(d => 
    config.zones.right.categories.includes(d.category as DomainCategory)
  )
  const centerDomains = visibleDomains.filter(d => 
    config.zones.center.categories.includes(d.category as DomainCategory)
  )
  
  // Step 3: Sort each zone - root domains first, then by display_order
  const sortDomains = (arr: KnowledgeDomain[]) => 
    arr.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth
      return (a.display_order || 0) - (b.display_order || 0)
    })
  
  sortDomains(leftDomains)
  sortDomains(rightDomains)
  sortDomains(centerDomains)
  
  // Step 4: Position nodes in each zone
  const nodes: BlueprintNode[] = []
  
  // Left zone - single column
  leftDomains.forEach((domain, index) => {
    nodes.push({
      id: domain.id,
      title: domain.name,
      description: domain.description || undefined,
      type: domainToNodeType(domain),
      category: domain.category as DomainCategory,
      x: config.zones.left.x,
      y: 50 + (index * config.verticalSpacing),
      status: getDomainStatus(domain, coverage),
      connections: domain.parent_id ? [domain.parent_id] : [],
      domainId: domain.id,
    })
  })
  
  // Right zone - single column
  rightDomains.forEach((domain, index) => {
    nodes.push({
      id: domain.id,
      title: domain.name,
      description: domain.description || undefined,
      type: domainToNodeType(domain),
      category: domain.category as DomainCategory,
      x: config.zones.right.x,
      y: 50 + (index * config.verticalSpacing),
      status: getDomainStatus(domain, coverage),
      connections: domain.parent_id ? [domain.parent_id] : [],
      domainId: domain.id,
    })
  })
  
  // Center zone - hierarchical layout
  // Root domains (depth 0) go down the center spine
  // Child domains (depth 1) branch left/right
  const centerRoots = centerDomains.filter(d => d.depth === 0)
  const centerChildren = centerDomains.filter(d => d.depth === 1)
  
  // Position root domains down the center
  const centerX = config.zones.center.x + config.zones.center.width / 2 - config.nodeWidth / 2
  
  centerRoots.forEach((domain, index) => {
    nodes.push({
      id: domain.id,
      title: domain.name,
      description: domain.description || undefined,
      type: domainToNodeType(domain),
      category: domain.category as DomainCategory,
      x: centerX,
      y: 30 + (index * config.verticalSpacing),
      status: getDomainStatus(domain, coverage),
      connections: [],
      domainId: domain.id,
    })
  })
  
  // Position child domains as branches
  // Group children by parent, then alternate left/right
  const childrenByParent: Record<string, KnowledgeDomain[]> = {}
  centerChildren.forEach(child => {
    if (child.parent_id) {
      if (!childrenByParent[child.parent_id]) {
        childrenByParent[child.parent_id] = []
      }
      childrenByParent[child.parent_id].push(child)
    }
  })
  
  Object.entries(childrenByParent).forEach(([parentId, children]) => {
    const parentNode = nodes.find(n => n.id === parentId)
    if (!parentNode) return
    
    children.forEach((child, index) => {
      // Alternate left/right
      const isLeft = index % 2 === 0
      const offsetX = isLeft ? -config.horizontalSpacing : config.horizontalSpacing
      const offsetY = Math.floor(index / 2) * (config.verticalSpacing * 0.7)
      
      nodes.push({
        id: child.id,
        title: child.name,
        description: child.description || undefined,
        type: domainToNodeType(child),
        category: child.category as DomainCategory,
        x: parentNode.x + offsetX,
        y: parentNode.y + 20 + offsetY,
        status: getDomainStatus(child, coverage),
        connections: [parentId],
        domainId: child.id,
      })
    })
  })
  
  return nodes
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerateArchetypeOptions {
  templateSlug: string
  templateName: string
  domains: KnowledgeDomain[]
  coverage?: DomainCoverageWithDetails[]
}

/**
 * Generate an archetype from template domains with auto-layout
 */
export function generateArchetype(options: GenerateArchetypeOptions): Archetype {
  const { templateSlug, templateName, domains, coverage = [] } = options
  
  // Get silhouette for this template type
  const silhouette = TEMPLATE_SILHOUETTES[templateSlug] || TEMPLATE_SILHOUETTES['default']
  
  // Generate nodes with auto-layout
  const nodes = autoLayoutNodes(domains, coverage)
  
  return {
    id: templateSlug,
    name: templateName,
    description: `Visual blueprint for ${templateName}`,
    nodes,
    silhouette: silhouette.path,
    silhouetteViewBox: silhouette.viewBox,
    defaultZoom: 0.85,
    centerOffset: { x: 0, y: 20 },
  }
}

/**
 * Get available silhouette templates
 */
export function getAvailableSilhouettes(): string[] {
  return Object.keys(TEMPLATE_SILHOUETTES)
}

/**
 * Check if a template has a custom silhouette
 */
export function hasCustomSilhouette(templateSlug: string): boolean {
  return templateSlug in TEMPLATE_SILHOUETTES && templateSlug !== 'default'
}
