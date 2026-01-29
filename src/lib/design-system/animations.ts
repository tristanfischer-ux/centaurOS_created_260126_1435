/**
 * Design System: Animations & Transitions
 * Standardized motion patterns for CentaurOS
 */

export const transitions = {
  default: 'transition-all duration-200 ease-in-out',
  fast: 'transition-all duration-150 ease-in-out',
  slow: 'transition-all duration-300 ease-in-out',
} as const

export const animations = {
  fadeIn: 'animate-fade-in',
  scaleIn: 'animate-scale-in',
} as const
