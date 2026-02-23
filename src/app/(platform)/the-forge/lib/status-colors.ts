/**
 * @file status-colors.ts
 *
 * @description Shared status dot colors for the Forge X-Ray views.
 * Centralises the mapping so system-blueprint, xray-module-node, and
 * xray-schematic stay in sync without duplicating hex values.
 */

// ─── Status Dot Colors ──────────────────────────────────────────────

/** Maps module status → hex color for status indicator dots */
export const STATUS_DOT_COLORS: Record<string, string> = {
  complete: "#10b981",
  "needs-diagnostic": "#f59e0b",
  partial: "#3b82f6",
}

const DEFAULT_STATUS_COLOR = "#94a3b8"

/**
 * Returns the hex color for a module status dot.
 *
 * @param status - The module status string
 * @returns A hex color string
 */
export function getStatusDotColor(status: string): string {
  return STATUS_DOT_COLORS[status] ?? DEFAULT_STATUS_COLOR
}

// ─── Edge Accent ────────────────────────────────────────────────────

/** Stroke color for schematic edges connecting modules */
export const SCHEMATIC_ACCENT_STROKE = "#ff4500"

// ─── Legend ──────────────────────────────────────────────────────────

/** Status legend entries for rendering color legends in UI */
export const STATUS_LEGEND = [
  { label: "Complete", color: "#10b981" },
  { label: "In progress", color: "#3b82f6" },
  { label: "Needs diagnostic", color: "#f59e0b" },
  { label: "Not started", color: "#94a3b8" },
] as const
