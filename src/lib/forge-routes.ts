/**
 * @file forge-routes.ts — Centralized route constants for The Forge.
 *
 * @description Single source of truth for all Forge navigation paths.
 * Prevents hardcoded string drift across components.
 */

export const FORGE_ROUTES = {
  home: "/the-forge",
  cadLab: "/the-forge/cad-lab",
  cadLabBuild: "/the-forge/cad-lab/build",
  cadLabReview: "/the-forge/cad-lab/review",
  cadLabTemplates: "/the-forge/cad-lab/templates",
  cadLabMashup: "/the-forge/cad-lab/mashup",
} as const

export function cadLabProjectUrl(projectId: string): string {
  return `${FORGE_ROUTES.cadLab}?project=${projectId}`
}
