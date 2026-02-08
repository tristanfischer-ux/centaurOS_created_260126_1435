/**
 * @file chart-colors.ts
 *
 * @description Centralised chart color palette for use with Recharts and
 * other visualisation libraries. Values match the chart-1 through chart-6
 * tokens defined in tailwind.config.ts.
 *
 * @example
 * import { chartColors, getChartColor } from '@/lib/chart-colors'
 * <Bar dataKey="value" fill={chartColors[0]} />
 * <Pie data={data} fill={getChartColor(index)} />
 */

/** HSL strings matching tailwind chart tokens (chart-1 … chart-6) */
export const chartColors: readonly string[] = [
  'hsl(14, 100%, 50%)',   // chart-1: International Orange
  'hsl(217, 91%, 60%)',   // chart-2: Electric Blue
  'hsl(160, 84%, 39%)',   // chart-3: Emerald
  'hsl(38, 92%, 50%)',    // chart-4: Amber
  'hsl(258, 90%, 66%)',   // chart-5: Purple
  'hsl(330, 81%, 60%)',   // chart-6: Pink
] as const

/** Extended palette for when 6 colours aren't enough */
export const chartColorsExtended: readonly string[] = [
  ...chartColors,
  'hsl(195, 74%, 53%)',   // Cyan
  'hsl(350, 89%, 60%)',   // Rose
  'hsl(80, 68%, 46%)',    // Lime
  'hsl(270, 60%, 50%)',   // Indigo
] as const

/**
 * Get a chart color by index, cycling through the palette.
 *
 * @param index - The data series index
 * @param extended - Use the extended (10-colour) palette
 * @returns HSL colour string
 */
export function getChartColor(index: number, extended = false): string {
  const palette = extended ? chartColorsExtended : chartColors
  return palette[index % palette.length]
}

/** Named semantic chart colors for the Money Map */
export const moneyMapColors = {
  revenue: 'hsl(160, 84%, 39%)',        // Emerald — income feels green
  directCost: 'hsl(14, 100%, 50%)',     // Orange — direct spend
  indirectCost: 'hsl(38, 92%, 50%)',    // Amber — shared costs
  overhead: 'hsl(258, 90%, 66%)',       // Purple — org overhead
  profit: 'hsl(160, 84%, 39%)',         // Emerald — positive margin
  loss: 'hsl(0, 84%, 60%)',             // Red — negative margin
} as const
