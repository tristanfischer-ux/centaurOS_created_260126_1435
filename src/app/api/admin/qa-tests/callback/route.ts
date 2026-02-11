import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { QATestWebhookPayload, QATestResults } from '@/types/qa.types'

/**
 * POST /api/admin/qa-tests/callback
 * Webhook endpoint for GitHub Actions to report test results.
 *
 * @security Requires QA_CALLBACK_SECRET in Authorization header to prevent
 *   unauthorized test result fabrication.
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify webhook secret before processing any data
    const callbackSecret = process.env.QA_CALLBACK_SECRET
    if (!callbackSecret) {
      console.error('[QACallback] QA_CALLBACK_SECRET not configured — rejecting all requests')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
    }

    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${callbackSecret}`) {
      console.warn('[QACallback] Invalid or missing authorization header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get test run ID from query params
    const testRunId = request.nextUrl.searchParams.get('test_run_id')
    
    if (!testRunId) {
      return NextResponse.json({ error: 'Missing test_run_id' }, { status: 400 })
    }
    
    // Parse the callback payload
    const payload: QATestWebhookPayload = await request.json()
    
    // Validate required fields
    if (!payload.status || !payload.results) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    
    // Use admin client to bypass RLS (this is a server-to-server callback)
    const supabase = createAdminClient()
    
    // Map GitHub status to our status
    const status = payload.status === 'passed' ? 'passed' : 'failed'
    
    // Calculate duration if we have timestamps
    let durationSeconds: number | undefined
    if (payload.completed_at) {
      const { data: testRun } = await supabase
        .from('qa_test_runs')
        .select('started_at')
        .eq('id', testRunId)
        .single()
      
      if (testRun?.started_at) {
        const startTime = new Date(testRun.started_at).getTime()
        const endTime = new Date(payload.completed_at).getTime()
        durationSeconds = Math.round((endTime - startTime) / 1000)
      }
    }
    
    // Update the test run record
    const { error: updateError } = await supabase
      .from('qa_test_runs')
      .update({
        status,
        results: payload.results as unknown as QATestResults,
        github_run_id: payload.run_id,
        artifacts_url: payload.artifacts_url,
        completed_at: payload.completed_at || new Date().toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq('id', testRunId)
    
    if (updateError) {
      console.error('[QACallback] Failed to update test run:', {
        testRunId,
        error: updateError.message,
      })
      return NextResponse.json({ error: 'Failed to update test run' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, message: 'Test results recorded' })
    
  } catch (error) {
    console.error('[QACallback] Unexpected error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Also support GET for verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'QA Test callback endpoint',
    status: 'ready',
  })
}
