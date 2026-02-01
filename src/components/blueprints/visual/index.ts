// Visual Blueprint Components
export { BlueprintCanvas } from './BlueprintCanvas'
export { KnowledgeSidebar } from './KnowledgeSidebar'
export { VisualBlueprintView } from './VisualBlueprintView'

// Types
export type {
  BlueprintNode,
  BlueprintNodeType,
  BlueprintEdge,
  Archetype,
  SkillNode,
  ExpertMatch,
  SupplierMatch,
  CanvasState,
} from './types'

export { STATUS_COLORS, NODE_TYPE_STYLES } from './types'

// Auto-Layout System
export { 
  generateArchetype, 
  getAvailableSilhouettes, 
  hasCustomSilhouette,
} from './auto-layout'
export type { GenerateArchetypeOptions } from './auto-layout'

// Pre-built Archetype Data
export { ROCKET_ARCHETYPE, ROCKET_NODES, ENGINE_SKILLS } from './data/rocket-archetype'
