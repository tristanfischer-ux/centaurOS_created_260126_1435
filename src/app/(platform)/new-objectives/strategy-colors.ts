/**
 * Per-strategy color palette for visual distinction between strategy groups.
 *
 * @description Provides a cycling set of soft color combinations so each
 * strategic objective section gets a unique visual identity in Board and Tree views.
 * Colors are intentionally light (50-level tints) with 400-level accents to stay
 * airy and bright while creating clear visual grouping.
 *
 * @see SO_COLORS in src/lib/canvas/strategy-river-adapter.ts for the equivalent
 * palette used in the StrategyRiver canvas.
 */

export interface StrategyColor {
  /** Soft tinted background for the strategy section container */
  bg: string
  /** Left border accent color */
  border: string
  /** Flag icon color matching the strategy */
  icon: string
  /** Slightly stronger background for hover/header emphasis */
  headerBg: string
  /** Solid color class for legend swatches (derived from border) */
  swatch: string
}

const STRATEGY_COLORS: StrategyColor[] = [
  { bg: 'bg-orange-50/60',  border: 'border-l-orange-400',  icon: 'text-orange-500',  headerBg: 'bg-orange-50',  swatch: 'bg-orange-400' },
  { bg: 'bg-indigo-50/60',  border: 'border-l-indigo-400',  icon: 'text-indigo-500',  headerBg: 'bg-indigo-50',  swatch: 'bg-indigo-400' },
  { bg: 'bg-teal-50/60',    border: 'border-l-teal-400',    icon: 'text-teal-500',    headerBg: 'bg-teal-50',    swatch: 'bg-teal-400' },
  { bg: 'bg-violet-50/60',  border: 'border-l-violet-400',  icon: 'text-violet-500',  headerBg: 'bg-violet-50',  swatch: 'bg-violet-400' },
  { bg: 'bg-pink-50/60',    border: 'border-l-pink-400',    icon: 'text-pink-500',    headerBg: 'bg-pink-50',    swatch: 'bg-pink-400' },
  { bg: 'bg-cyan-50/60',    border: 'border-l-cyan-400',    icon: 'text-cyan-500',    headerBg: 'bg-cyan-50',    swatch: 'bg-cyan-400' },
  { bg: 'bg-amber-50/60',   border: 'border-l-amber-400',   icon: 'text-amber-500',   headerBg: 'bg-amber-50',   swatch: 'bg-amber-400' },
  { bg: 'bg-rose-50/60',    border: 'border-l-rose-400',    icon: 'text-rose-500',    headerBg: 'bg-rose-50',    swatch: 'bg-rose-400' },
]

/**
 * Returns the color set for a strategy at the given index.
 * Cycles through the palette for more strategies than colors.
 *
 * @param index - The strategy's position in the list (0-based)
 * @returns The color set for that strategy
 */
export function getStrategyColor(index: number): StrategyColor {
  return STRATEGY_COLORS[index % STRATEGY_COLORS.length]
}
