/**
 * @file generate-infographic-image.ts
 *
 * @description Server action that generates a single A4 infographic image
 * from a ReportDocument using Gemini image generation. The image is uploaded
 * to Supabase Storage and the public URL is returned.
 *
 * INTENT: Offered as "Download AI Infographic" alongside existing export options.
 * The AI produces a visually rich, illustrated infographic rather than the
 * structured HTML infographic in ReportInfographic.tsx.
 *
 * @related
 * - src/lib/reports/report-image-generator.ts — Core image generation functions
 * - src/components/reports/ReportInfographic.tsx — HTML-based infographic
 */

'use server'

import { generateInfographicImage } from './report-image-generator'

import type { ReportDocument } from './report-document-types'

/**
 * Extract key metrics and highlights from a ReportDocument to feed
 * as context to the image generator.
 */
function extractMetricsSnapshot(document: ReportDocument): string {
  const lines: string[] = []

  for (const section of document.sections) {
    switch (section.type) {
      case 'key-metrics': {
        const data = section.data
        lines.push('KEY METRICS:')
        for (const m of data.metrics) {
          const trend = m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→'
          lines.push(`  ${m.label}: ${m.value} (${trend} ${m.changePercent}%)`)
        }
        break
      }
      case 'objectives-progress': {
        const data = section.data
        lines.push(`OBJECTIVES: ${data.totalActive} active, ${data.totalCompleted} completed`)
        const onTrack = data.objectives.filter(o => o.health === 'on-track').length
        const atRisk = data.objectives.filter(o => o.health === 'at-risk').length
        lines.push(`  ${onTrack} on-track, ${atRisk} at-risk`)
        break
      }
      case 'completion-trend': {
        const data = section.data
        const total = data.dataPoints.reduce((s, d) => s + d.completed, 0)
        lines.push(`COMPLETION: ${total} tasks completed over ${data.dataPoints.length} days`)
        break
      }
      case 'financial-snapshot': {
        const data = section.data
        lines.push(`FINANCIALS: Revenue ${data.periodRevenue}, Expenses ${data.periodExpenses}, Net ${data.netPosition}`)
        break
      }
      case 'executive-summary': {
        const data = section.data
        if (data.highlights.length > 0) {
          lines.push('HIGHLIGHTS:')
          for (const h of data.highlights.slice(0, 3)) {
            lines.push(`  • ${h}`)
          }
        }
        break
      }
    }
  }

  return lines.join('\n') || 'Business performance summary'
}

/**
 * Generate an AI infographic image from a ReportDocument.
 *
 * @returns Object with success status and optional image URL
 */
export async function generateAIInfographic(
  document: ReportDocument,
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    const metricsSnapshot = extractMetricsSnapshot(document)
    const url = await generateInfographicImage(
      document.id,
      metricsSnapshot,
      document.foundryName,
      document.branding,
    )

    if (!url) {
      return { success: false, error: 'Image generation failed — check GOOGLE_AI_API_KEY' }
    }

    return { success: true, imageUrl: url }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[InfographicGen] Failed:', message)
    return { success: false, error: message }
  }
}
