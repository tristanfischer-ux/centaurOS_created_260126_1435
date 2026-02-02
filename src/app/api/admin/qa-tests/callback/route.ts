import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { QATestWebhookPayload, QATestResults } from '@/types/qa.types'

/**
 * POST /api/admin/qa-tests/callback
 * Webhook endpoint for GitHub Actions to report test results
 */
export async function POST(request: NextRequest) {
  try {
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
      console.error('Error updating test run:', updateError)
      return NextResponse.json({ error: 'Failed to update test run' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, message: 'Test results recorded' })
    
  } catch (error) {
    console.error('QA callback error:', error)
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
