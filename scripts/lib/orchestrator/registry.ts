/**
 * scripts/lib/orchestrator/registry.ts
 *
 * TOOL REGISTRY — global map of tool_id to Tool implementation.
 *
 * Per Phase 1 design: this file defines the registry interface + a
 * shared singleton. Individual tools (PyBaMM, CoolProp, ngspice, etc.)
 * register themselves at module load via `registerTool()` calls in
 * each tool wrapper file under `scripts/lib/orchestrator/tools/`.
 *
 * Phase 1 ships with the registry foundation; Phase 2 wires real tools.
 */

import type { Tool } from './types'

// ---------------------------------------------------------------------------
// SINGLETON REGISTRY
// ---------------------------------------------------------------------------

const _registry = new Map<string, Tool<unknown, unknown>>()

/** Register a tool with the global registry. Called from each tool
 *  wrapper at module load time. Throws on duplicate registration. */
export function registerTool<I, O>(tool: Tool<I, O>): void {
  if (_registry.has(tool.id)) {
    throw new Error(`Tool already registered: ${tool.id}`)
  }
  _registry.set(tool.id, tool as Tool<unknown, unknown>)
}

/** Get a registered tool by ID. Returns undefined if not found. */
export function getTool(id: string): Tool<unknown, unknown> | undefined {
  return _registry.get(id)
}

/** Get all registered tools (read-only view). */
export function listTools(): ReadonlyMap<string, Tool<unknown, unknown>> {
  return _registry
}

/** Test-only: clear the registry. */
export function _clearRegistryForTests(): void {
  _registry.clear()
}
