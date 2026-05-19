import type { ArchitectureReadiness, ProductDossier } from '../schema/types'

export type InterfaceGraphNodeKind = 'module' | 'submodule'
export type InterfaceGraphEdgeKind = 'contains' | 'shared_interface' | 'required_interface'

export interface InterfaceGraphNode {
  id: string
  label: string
  kind: InterfaceGraphNodeKind
  moduleId?: string
}

export interface InterfaceGraphEdge {
  id: string
  from: string
  to: string
  via: string
  kind: InterfaceGraphEdgeKind
  present: boolean
  rationale: string
}

export interface InterfaceGraphModel {
  nodes: InterfaceGraphNode[]
  edges: InterfaceGraphEdge[]
  summary: {
    moduleNodes: number
    subModuleNodes: number
    containsEdges: number
    sharedInterfaceEdges: number
    requiredInterfaceEdges: number
    missingRequiredInterfaceEdges: number
  }
}

export function buildInterfaceGraph(dossier: ProductDossier, readiness: ArchitectureReadiness): InterfaceGraphModel {
  const nodes: InterfaceGraphNode[] = []
  const edges: InterfaceGraphEdge[] = []
  const moduleInterfaceMap = new Map<string, Set<string>>()

  for (const module of dossier.architecture.modules) {
    nodes.push({ id: module.id, label: module.displayName, kind: 'module' })
    moduleInterfaceMap.set(module.id, new Set([
      ...module.interfaces,
      ...module.subModules.flatMap(subModule => subModule.interfaces),
    ]))

    for (const subModule of module.subModules) {
      const subNodeId = subModuleNodeId(module.id, subModule.id)
      nodes.push({ id: subNodeId, label: subModule.name, kind: 'submodule', moduleId: module.id })
      edges.push({
        id: edgeId(module.id, subNodeId, 'contains', subModule.id),
        from: module.id,
        to: subNodeId,
        via: 'contains',
        kind: 'contains',
        present: true,
        rationale: `${subModule.name} is contained by ${module.displayName}.`,
      })
    }
  }

  for (const interfaceId of dossier.architecture.crossModuleInterfaces) {
    const moduleIds = dossier.architecture.modules
      .filter(module => moduleInterfaceMap.get(module.id)?.has(interfaceId))
      .map(module => module.id)
    for (let index = 0; index < moduleIds.length - 1; index += 1) {
      const from = moduleIds[index]
      const to = moduleIds[index + 1]
      edges.push({
        id: edgeId(from, to, 'shared_interface', interfaceId),
        from,
        to,
        via: interfaceId,
        kind: 'shared_interface',
        present: true,
        rationale: `Both modules declare ${interfaceId}.`,
      })
    }
  }

  for (const link of readiness.requiredInterfaceLinks) {
    edges.push({
      id: edgeId(link.fromModuleId, link.toModuleId, 'required_interface', link.via),
      from: link.fromModuleId,
      to: link.toModuleId,
      via: link.via,
      kind: 'required_interface',
      present: link.present,
      rationale: link.reason,
    })
  }

  return {
    nodes,
    edges,
    summary: {
      moduleNodes: nodes.filter(node => node.kind === 'module').length,
      subModuleNodes: nodes.filter(node => node.kind === 'submodule').length,
      containsEdges: edges.filter(edge => edge.kind === 'contains').length,
      sharedInterfaceEdges: edges.filter(edge => edge.kind === 'shared_interface').length,
      requiredInterfaceEdges: edges.filter(edge => edge.kind === 'required_interface').length,
      missingRequiredInterfaceEdges: edges.filter(edge => edge.kind === 'required_interface' && !edge.present).length,
    },
  }
}

export function renderInterfaceGraphMermaid(graph: InterfaceGraphModel): string {
  const lines = ['flowchart LR']
  for (const node of graph.nodes.filter(item => item.kind === 'module')) {
    lines.push(`  ${mermaidId(node.id)}["${escapeMermaid(node.label)}"]`)
  }
  for (const edge of graph.edges.filter(item => item.kind === 'required_interface')) {
    const label = `${edge.via}${edge.present ? '' : ' missing'}`
    lines.push(`  ${mermaidId(edge.from)} -->|"${escapeMermaid(label)}"| ${mermaidId(edge.to)}`)
  }
  lines.push('  classDef missing stroke:#a32626,stroke-width:3px,color:#a32626;')
  for (const edge of graph.edges.filter(item => item.kind === 'required_interface' && !item.present)) {
    lines.push(`  class ${mermaidId(edge.from)},${mermaidId(edge.to)} missing;`)
  }
  return lines.join('\n') + '\n'
}

function subModuleNodeId(moduleId: string, subModuleId: string): string {
  return `${moduleId}.${subModuleId}`
}

function edgeId(from: string, to: string, kind: InterfaceGraphEdgeKind, via: string): string {
  return `${kind}:${from}:${to}:${via}`
}

function mermaidId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '_')
}

function escapeMermaid(value: string): string {
  return value.replaceAll('"', '\\"')
}
