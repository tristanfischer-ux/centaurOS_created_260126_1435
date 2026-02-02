/**
 * Types for QA Test Runs
 */

export type QATestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'cancelled'
export type QATestEnvironment = 'staging' | 'production'

export interface QATestResults {
  executive?: 'passed' | 'failed' | 'skipped'
  founder?: 'passed' | 'failed' | 'skipped'
  apprentice?: 'passed' | 'failed' | 'skipped'
}

export interface QATestRun {
  id: string
  github_run_id: string | null
  github_run_url: string | null
  environment: QATestEnvironment
  triggered_by: string | null
  triggered_by_name: string | null
  status: QATestStatus
  results: QATestResults
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  artifacts_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  foundry_id: string
}

export interface TriggerQATestRequest {
  environment: QATestEnvironment
}

export interface TriggerQATestResponse {
  success: boolean
  test_run_id: string
  github_run_id?: string
  message: string
}

export interface QATestWebhookPayload {
  run_id: string
  environment: QATestEnvironment
  triggered_by: string
  status: 'passed' | 'failed'
  results: QATestResults
  artifacts_url: string
  completed_at: string
}
