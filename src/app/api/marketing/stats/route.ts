import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * @file marketing/stats/route.ts
 *
 * @description Public API endpoint returning aggregate marketing statistics.
 * Used by the marketing landing page to show a live founding member counter.
 *
 * @security No auth required — returns only aggregate counts, no PII.
 * Uses admin client to bypass RLS for a simple COUNT query.
 */

/**
 * Returns the current count of founding members (profiles) on the platform.
 *
 * @returns {Promise<NextResponse>} JSON with foundingMembers count
 *
 * @security No PII exposed — only aggregate count
 */
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createAdminClient()

    // SECURITY: Only returns aggregate count, no individual data
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('[MarketingStats] Failed to count profiles:', {
        error: error.message,
        code: error.code,
      })
      return NextResponse.json(
        { foundingMembers: 0, updatedAt: new Date().toISOString() },
        {
          status: 200,
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          },
        }
      )
    }

    return NextResponse.json(
      {
        foundingMembers: count ?? 0,
        updatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    )
  } catch (error) {
    console.error('[MarketingStats] Unexpected error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { foundingMembers: 0, updatedAt: new Date().toISOString() },
      { status: 200 }
    )
  }
}
