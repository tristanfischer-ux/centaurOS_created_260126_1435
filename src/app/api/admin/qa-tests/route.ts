import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin/access'
import type { QATestEnvironment, TriggerQATestResponse } from '@/types/qa.types'

// GitHub API configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_REPO || 'your-org/forgeos'
const GITHUB_WORKFLOW_FILE = 'qa-day-in-life.yml'

/**
 * GET /api/admin/qa-tests
 * List recent QA test runs
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check admin access
    const hasAccess = await isAdmin(user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // Get user's foundry
    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()
    
    if (!profile?.foundry_id) {
      return NextResponse.json({ error: 'No foundry found' }, { status: 400 })
    }
    
    // Fetch recent test runs
    const { data: testRuns, error } = await supabase
      .from('qa_test_runs')
      .select('*')
      .eq('foundry_id', profile.foundry_id)
      .order('created_at', { ascending: false })
      .limit(20)
    
    if (error) {
      console.error('Error fetching test runs:', error)
      return NextResponse.json({ error: 'Failed to fetch test runs' }, { status: 500 })
    }
    
    return NextResponse.json({ data: testRuns || [] })
  } catch (error) {
    console.error('QA Tests GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/admin/qa-tests
 * Trigger a new QA test run
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check admin access
    const hasAccess = await isAdmin(user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // Parse request body
    const body = await request.json()
    const environment: QATestEnvironment = body.environment || 'staging'
    
    // Get user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id, full_name')
      .eq('id', user.id)
      .single()
    
    if (!profile?.foundry_id) {
      return NextResponse.json({ error: 'No foundry found' }, { status: 400 })
    }
    
    // Create test run record first
    const { data: testRun, error: insertError } = await supabase
      .from('qa_test_runs')
      .insert({
        environment,
        triggered_by: user.id,
        triggered_by_name: profile.full_name || user.email,
        status: 'pending',
        foundry_id: profile.foundry_id,
        results: {},
      })
      .select()
      .single()
    
    if (insertError || !testRun) {
      console.error('Error creating test run:', insertError)
      return NextResponse.json({ error: 'Failed to create test run' }, { status: 500 })
    }
    
    // Build callback URL for GitHub to report results
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const callbackUrl = `${baseUrl}/api/admin/qa-tests/callback?test_run_id=${testRun.id}`
    
    // Trigger GitHub Actions workflow
    let githubRunId: string | undefined
    
    if (GITHUB_TOKEN) {
      try {
        const response = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/vnd.github+json',
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: {
                environment,
                triggered_by: profile.full_name || user.email || 'Admin',
                callback_url: callbackUrl,
              },
            }),
          }
        )
        
        if (response.ok) {
          // GitHub doesn't return the run ID directly, we'll get it from the callback
          // Update status to running
          await supabase
            .from('qa_test_runs')
            .update({ status: 'running' })
            .eq('id', testRun.id)
          
          // Try to get the run ID from the recent runs
          await new Promise(resolve => setTimeout(resolve, 2000)) // Wait for workflow to start
          
          const runsResponse = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/runs?per_page=1`,
            {
              headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
              },
            }
          )
          
          if (runsResponse.ok) {
            const runsData = await runsResponse.json()
            if (runsData.workflow_runs?.[0]) {
              githubRunId = String(runsData.workflow_runs[0].id)
              await supabase
                .from('qa_test_runs')
                .update({
                  github_run_id: githubRunId,
                  github_run_url: runsData.workflow_runs[0].html_url,
                })
                .eq('id', testRun.id)
            }
          }
        } else {
          const errorText = await response.text()
          console.error('GitHub API error:', response.status, errorText)
          
          // Update test run with error
          await supabase
            .from('qa_test_runs')
            .update({
              status: 'failed',
              error_message: `GitHub API error: ${response.status}`,
              completed_at: new Date().toISOString(),
            })
            .eq('id', testRun.id)
          
          return NextResponse.json({
            success: false,
            test_run_id: testRun.id,
            message: 'Failed to trigger GitHub workflow. Check GitHub token configuration.',
          } satisfies TriggerQATestResponse, { status: 500 })
        }
      } catch (githubError) {
        console.error('GitHub trigger error:', githubError)
        
        await supabase
          .from('qa_test_runs')
          .update({
            status: 'failed',
            error_message: 'Failed to connect to GitHub API',
            completed_at: new Date().toISOString(),
          })
          .eq('id', testRun.id)
        
        return NextResponse.json({
          success: false,
          test_run_id: testRun.id,
          message: 'Failed to connect to GitHub API',
        } satisfies TriggerQATestResponse, { status: 500 })
      }
    } else {
      // No GitHub token - mark as failed
      await supabase
        .from('qa_test_runs')
        .update({
          status: 'failed',
          error_message: 'GitHub token not configured',
          completed_at: new Date().toISOString(),
        })
        .eq('id', testRun.id)
      
      return NextResponse.json({
        success: false,
        test_run_id: testRun.id,
        message: 'GitHub token not configured. Add GITHUB_TOKEN to environment variables.',
      } satisfies TriggerQATestResponse, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      test_run_id: testRun.id,
      github_run_id: githubRunId,
      message: 'QA tests triggered successfully',
    } satisfies TriggerQATestResponse)
    
  } catch (error) {
    console.error('QA Tests POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
