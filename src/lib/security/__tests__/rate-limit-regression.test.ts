import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

async function getRouteFilesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return getRouteFilesRecursively(entryPath)
      }

      return entry.name === 'route.ts' ? [entryPath] : []
    })
  )

  return files.flat()
}

describe('rate-limit security regressions', () => {
  it('does not use second-based window values in API route rateLimit calls', async () => {
    const apiDirectory = path.join(process.cwd(), 'src/app/api')
    const routeFiles = await getRouteFilesRecursively(apiDirectory)
    const regressions: string[] = []

    const secondWindowRegex = /rateLimit\([\s\S]{0,240}?window:\s*(60|900|3600)\s*[,}]/g

    for (const routeFile of routeFiles) {
      const source = await readFile(routeFile, 'utf-8')
      const matches = [...source.matchAll(secondWindowRegex)]
      if (matches.length > 0) {
        regressions.push(
          `${path.relative(process.cwd(), routeFile)} => ${matches.map((match) => match[0]).join(' | ')}`
        )
      }
    }

    expect(regressions).toEqual([])
  })

  it('uses the correct getClientIP and rateLimit signature for message uploads', async () => {
    const messageUploadRoutePath = path.join(process.cwd(), 'src/app/api/messages/upload/route.ts')
    const source = await readFile(messageUploadRoutePath, 'utf-8')

    expect(source).toContain('const ip = getClientIP(request.headers)')
    expect(source).toMatch(
      /rateLimit\(\s*'upload'\s*,\s*`message-upload:\$\{user\.id\}:\$\{ip\}`\s*,\s*\{\s*limit:\s*10,\s*window:\s*60\s*\*\s*1000\s*\}\s*\)/
    )
  })

  it('requires conversation-scoped upload paths and avoids public URL generation', async () => {
    const messageUploadRoutePath = path.join(process.cwd(), 'src/app/api/messages/upload/route.ts')
    const source = await readFile(messageUploadRoutePath, 'utf-8')

    expect(source).toContain("const conversationId = formData.get('conversationId') as string | null")
    expect(source).toContain('const filePath = `messages/${conversationId}/${fileName}`')
    expect(source).toContain(".from('message-files')")
    expect(source).toContain('.createSignedUrl(uploadData.path, 60 * 60)')
    expect(source).not.toContain('.getPublicUrl(')
    expect(source).not.toContain(".from('message-attachments')")
  })
})

describe('cron authorization hardening regressions', () => {
  it('fails closed when CRON_SECRET is missing for morning brief', async () => {
    const morningBriefRoutePath = path.join(process.cwd(), 'src/app/api/cron/morning-brief/route.ts')
    const source = await readFile(morningBriefRoutePath, 'utf-8')

    // @audit Updated 2026-02-19: verifyCronSecret extracted to shared cron-auth.ts (Step 1 of 8).
    // Routes now import the shared function instead of inlining the check.
    expect(source).toContain("import { verifyCronSecret } from '@/lib/security/cron-auth'")
    expect(source).toContain('verifyCronSecret(')
  })

  it('shared cron-auth module fails closed when CRON_SECRET is missing', async () => {
    const cronAuthPath = path.join(process.cwd(), 'src/lib/security/cron-auth.ts')
    const source = await readFile(cronAuthPath, 'utf-8')

    expect(source).toContain('if (!cronSecret)')
    expect(source).toContain('error: "Cron secret not configured"')
    expect(source).toContain('status: 503')
    expect(source).toContain('error: "Unauthorized"')
    expect(source).toContain('status: 401')
  })

  it('uses admin client for morning brief and avoids broken server singleton imports', async () => {
    const morningBriefRoutePath = path.join(process.cwd(), 'src/app/api/cron/morning-brief/route.ts')
    const source = await readFile(morningBriefRoutePath, 'utf-8')

    expect(source).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(source).toContain('const supabase = createAdminClient()')
    expect(source).not.toContain("import { supabase } from '@/lib/supabase/server'")
  })

  it('uses admin clients for agent governance and collaboration modules', async () => {
    const permissionGuardPath = path.join(process.cwd(), 'src/lib/agents/permission-guard.ts')
    const collaborationHubPath = path.join(process.cwd(), 'src/lib/agents/collaboration-hub.ts')
    const [permissionGuardSource, collaborationHubSource] = await Promise.all([
      readFile(permissionGuardPath, 'utf-8'),
      readFile(collaborationHubPath, 'utf-8')
    ])

    expect(permissionGuardSource).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(permissionGuardSource).toContain('function getPermissionGuardAdminClient()')
    expect(permissionGuardSource).toContain('const supabase = new Proxy')
    expect(permissionGuardSource).not.toContain("import { supabase } from '@/lib/supabase/server'")

    expect(collaborationHubSource).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(collaborationHubSource).toContain('function getCollaborationAdminClient()')
    expect(collaborationHubSource).toContain('const supabase = new Proxy')
    expect(collaborationHubSource).not.toContain("import { supabase } from '@/lib/supabase/server'")
  })

  it('validates Slack webhook URLs before outbound cron fetch', async () => {
    const dailyReportsRoutePath = path.join(process.cwd(), 'src/app/api/cron/reports/daily/route.ts')
    const source = await readFile(dailyReportsRoutePath, 'utf-8')

    expect(source).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(source).toContain('const supabase = createAdminClient()')
    expect(source).not.toContain("import { createClient } from '@supabase/supabase-js'")
    expect(source).toContain('isValidSlackWebhookUrl(pref.slack_webhook_url)')
    expect(source).toContain("redirect: 'error'")
  })

  it('requires QA callback secret for both POST and GET handlers', async () => {
    const qaCallbackRoutePath = path.join(
      process.cwd(),
      'src/app/api/admin/qa-tests/callback/route.ts'
    )
    const source = await readFile(qaCallbackRoutePath, 'utf-8')

    expect(source).toContain('function verifyQaCallbackSecret')
    expect(source).toContain('const authFailureResponse = verifyQaCallbackSecret(request)')
    expect(source).toContain('if (authFailureResponse)')
    expect(source).toContain('export async function GET(request: NextRequest)')
    expect(source).toContain("await rateLimit('webhook', `qa-callback:${ip}`)")
    expect(source).toContain("return NextResponse.json({ error: 'Too many requests' }, { status: 429 })")
  })

  it('fails closed for all cron routes when CRON_SECRET is missing', async () => {
    // @audit Updated 2026-02-19: verifyCronSecret extracted to shared cron-auth.ts (Step 1 of 8).
    // Routes now import the shared function instead of inlining the check.
    const cronRoutes = [
      'src/app/api/cron/reports/daily/route.ts',
      'src/app/api/cron/weekly-synthesis/route.ts',
      'src/app/api/cron/agent-sweep/route.ts',
      'src/app/api/cron/telegram-briefings/route.ts',
    ]

    for (const routePath of cronRoutes) {
      const source = await readFile(path.join(process.cwd(), routePath), 'utf-8')
      expect(source).toContain("import { verifyCronSecret } from '@/lib/security/cron-auth'")
      expect(source).toContain('verifyCronSecret(')
    }
  })

  it('rate limits cron endpoints before authorization checks', async () => {
    const assertions: Array<{ routePath: string; keyPrefix: string }> = [
      { routePath: 'src/app/api/cron/morning-brief/route.ts', keyPrefix: 'cron-morning-brief' },
      { routePath: 'src/app/api/cron/reports/daily/route.ts', keyPrefix: 'cron-daily-reports' },
      { routePath: 'src/app/api/cron/weekly-synthesis/route.ts', keyPrefix: 'cron-weekly-synthesis' },
      { routePath: 'src/app/api/cron/agent-sweep/route.ts', keyPrefix: 'cron-agent-sweep' },
      { routePath: 'src/app/api/cron/telegram-briefings/route.ts', keyPrefix: 'cron-telegram-briefings' },
    ]

    for (const { routePath, keyPrefix } of assertions) {
      const source = await readFile(path.join(process.cwd(), routePath), 'utf-8')
      expect(source).toContain('getClientIP(')
      expect(source).toContain(`await rateLimit('webhook', \`${keyPrefix}:\${ip}\``)
      expect(source).toContain("return NextResponse.json({ error: 'Too many requests' }, { status: 429 })")
    }
  })

  it('fails closed for sweep-trigger webhook auth when secrets are missing', async () => {
    const sweepTriggerPath = path.join(process.cwd(), 'src/app/api/agents/sweep-trigger/route.ts')
    const source = await readFile(sweepTriggerPath, 'utf-8')

    expect(source).toContain('if (!webhookSecret)')
    expect(source).toContain("return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })")
    expect(source).toContain('const authFailure = verifyWebhookAuth(req)')
    expect(source).toContain("await rateLimit('webhook', `sweep-trigger:${ip}`)")
    expect(source).toContain("return NextResponse.json({ error: 'Too many requests' }, { status: 429 })")
  })

  it('fails closed for telegram webhook route and guards GET status endpoint', async () => {
    const telegramRoutePath = path.join(process.cwd(), 'src/app/api/bot/telegram/route.ts')
    const source = await readFile(telegramRoutePath, 'utf-8')

    expect(source).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(source).toContain('const getAdminClient = createAdminClient')
    expect(source).not.toContain("import { createClient } from '@supabase/supabase-js'")
    expect(source).toContain("await rateLimit('webhook', `telegram-webhook:${ip}`)")
    expect(source).toContain("return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })")
    expect(source).toContain('if (!secret)')
    expect(source).toContain("return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })")
    expect(source).toContain('export async function GET(req: NextRequest)')
    expect(source).toContain('const authFailure = verifyWebhookSecret(req)')
  })

  it('does not echo raw internal error messages from cron and sweep-trigger APIs', async () => {
    const routes = [
      'src/app/api/cron/morning-brief/route.ts',
      'src/app/api/cron/reports/daily/route.ts',
      'src/app/api/cron/weekly-synthesis/route.ts',
      'src/app/api/cron/agent-sweep/route.ts',
      'src/app/api/cron/telegram-briefings/route.ts',
      'src/app/api/agents/sweep-trigger/route.ts',
    ]

    for (const routePath of routes) {
      const source = await readFile(path.join(process.cwd(), routePath), 'utf-8')
      expect(source).not.toMatch(
        /NextResponse\.json\(\s*\{[\s\S]{0,160}error:\s*error instanceof Error \? error\.message/
      )
    }
  })
})

describe('message attachment authorization regressions', () => {
  it('verifies conversation membership and message ownership before signed URL issuance', async () => {
    const fileUrlRoutePath = path.join(process.cwd(), 'src/app/api/messages/file-url/route.ts')
    const source = await readFile(fileUrlRoutePath, 'utf-8')

    expect(source).toContain("const fileRef = body.fileRef?.trim()")
    expect(source).toContain("const conversationId = body.conversationId?.trim()")
    expect(source).toContain("const messageId = body.messageId?.trim()")
    expect(source).toContain(".from('conversation_participants')")
    expect(source).toContain(".from('messages')")
    expect(source).toContain('normalizeMessageFileReference')
    expect(source).toContain('.createSignedUrl(')
  })

  it('tightens legacy message-attachments storage policies to conversation participants only', async () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20260214150003_tighten_legacy_message_attachment_policies.sql'
    )
    const source = await readFile(migrationPath, 'utf-8')

    expect(source).toContain('DROP POLICY "Users can upload to own foundry" ON storage.objects')
    expect(source).toContain(
      'CREATE POLICY "Users can view legacy message attachments from participant conversations"'
    )
    expect(source).toContain('JOIN public.conversation_participants cp')
    expect(source).toContain("bucket_id = 'message-attachments'")
    expect(source).toContain('replace(name, \'/\', \'%2F\')')
  })
})

describe('agent error-response sanitization regressions', () => {
  it('sanitizes execute route terminal and stream error payloads', async () => {
    const executeRoutePath = path.join(process.cwd(), 'src/app/api/agents/execute/route.ts')
    const source = await readFile(executeRoutePath, 'utf-8')

    expect(source).toContain('{ error: "Failed to execute prompt" }')
    // Stream errors are classified through classifyStreamError() which returns
    // a ClassifiedError { message, category, rawHint }. The SSE payload uses
    // classified.message for the user-facing error, plus category and rawHint
    // for client-side diagnostic logging. Raw error details are never exposed
    // directly in the user-facing message.
    expect(source).toContain('classifyStreamError')
    expect(source).toContain('error: classified.message')
    expect(source).toContain('errorCategory: classified.category')
    expect(source).not.toContain('return NextResponse.json({ error: message }, { status: 500 })')
    expect(source).not.toContain('JSON.stringify({ error })')
  })
})

describe('OpenAI key hardening regressions', () => {
  it('fails closed on missing OPENAI_API_KEY for marketplace and RFQ routes', async () => {
    const routes = [
      'src/app/api/marketplace/ai-search/route.ts',
      'src/app/api/marketplace/talent-match/route.ts',
      'src/app/api/marketplace/forge-match/route.ts',
      'src/app/api/rfq/voice/route.ts',
    ]

    for (const routePath of routes) {
      const source = await readFile(path.join(process.cwd(), routePath), 'utf-8')
      expect(source).toMatch(/if \(!process\.env\.(OPENAI_API_KEY|OPENROUTER_API_KEY)(\?\.trim\(\))?(\)|\))/)
      expect(source).toContain('{ status: 503 }')
    }
  })

  it('does not use dummy OpenAI API key fallbacks in request handlers', async () => {
    const routes = [
      'src/app/api/marketplace/ai-search/route.ts',
      'src/app/api/marketplace/talent-match/route.ts',
      'src/app/api/marketplace/forge-match/route.ts',
      'src/app/api/rfq/voice/route.ts',
      'src/app/api/agents/stt/route.ts',
      'src/app/api/voice-to-task/route.ts',
      'src/app/api/marketplace/compare/route.ts',
      'src/app/api/team/compare/route.ts',
    ]

    for (const routePath of routes) {
      const source = await readFile(path.join(process.cwd(), routePath), 'utf-8')
      expect(source).toContain('function getOpenAIClient()')
      expect(source).toContain('const openai = getOpenAIClient()')
      expect(source).not.toContain('dummy-key-for-build')
      expect(source).not.toContain('sk-placeholder-for-build-only')
      expect(source).not.toMatch(/apiKey:\s*process\.env\.OPENAI_API_KEY\s*\|\|/)
    }
  })

})

describe('agent objective action security regressions', () => {
  it('requires authenticated user and foundry membership before agent objective/task writes', async () => {
    const agentObjectivesPath = path.join(process.cwd(), 'src/actions/agent-objectives.ts')
    const source = await readFile(agentObjectivesPath, 'utf-8')

    expect(source).toContain('async function getAuthenticatedClient()')
    expect(source).toContain('async function ensureFoundryMembership(')
    expect(source).toContain(".from('foundry_memberships')")
    expect(source).toContain("return { success: false, error: authResult.error }")
    expect(source).toContain('const membershipError = await ensureFoundryMembership(')
    expect(source).not.toContain('.supabase.from(')
  })
})

describe('server action OpenAI hardening regressions', () => {
  it('does not use dummy OpenAI key fallbacks in server actions and telegram AI processor', async () => {
    const openaiActionFiles = [
      'src/actions/strategic-planner.ts',
      'src/actions/smart-goals.ts',
      'src/actions/generate-advisory-answer.ts',
      'src/actions/assess-coverage.ts',
      'src/app/actions/analyze-business-plan.ts',
      'src/lib/telegram/ai-processor.ts',
    ]

    for (const filePath of openaiActionFiles) {
      const source = await readFile(path.join(process.cwd(), filePath), 'utf-8')
      expect(source).toContain('function getOpenAIClient()')
      expect(source).not.toContain('dummy-key-for-build')
      expect(source).not.toContain('sk-placeholder-for-build-only')
      expect(source).not.toMatch(/apiKey:\s*process\.env\.OPENAI_API_KEY\s*\|\|/)
    }

    // analyze.ts uses OpenRouter (or OpenAI fallback) — verify it fails closed too
    const analyzeSource = await readFile(path.join(process.cwd(), 'src/actions/analyze.ts'), 'utf-8')
    expect(analyzeSource.includes('OPENAI_API_KEY') || analyzeSource.includes('OPENROUTER_API_KEY')).toBe(true)
    expect(analyzeSource).toContain('AI analysis service is not configured')
    expect(analyzeSource).not.toContain('dummy-key-for-build')
    expect(analyzeSource).not.toContain('sk-placeholder')
  })

  it('fails closed for both assessCoverage and assessSingleFunction OpenAI usage', async () => {
    const assessCoveragePath = path.join(process.cwd(), 'src/actions/assess-coverage.ts')
    const source = await readFile(assessCoveragePath, 'utf-8')

    expect(source).toContain('AI coverage analysis service is not configured')
    expect(source).toContain('AI single-function assessment service is not configured')
    expect(source).toMatch(/const openai = getOpenAIClient\(\)/g)
  })

  it('fails closed for all advisory answer AI entry points', async () => {
    const advisoryActionPath = path.join(process.cwd(), 'src/actions/generate-advisory-answer.ts')
    const source = await readFile(advisoryActionPath, 'utf-8')

    expect(source).toContain('AI advisory service is not configured')
    expect(source).toContain('export async function generateAdvisoryAnswer(')
    expect(source).toContain('export async function generateStructuredAnswer(')
    expect(source).toContain('export async function suggestQuestionCategory(')
    expect(source.match(/const openai = getOpenAIClient\(\)/g)?.length).toBeGreaterThanOrEqual(3)
  })
})

describe('billing test activation hardening regressions', () => {
  it('requires explicit enablement and shared-secret auth for test activation endpoint', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/billing/test-activate/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain("process.env.ALLOW_TEST_BILLING_ACTIVATION === 'true'")
    expect(source).toContain('const testBillingSecret = process.env.TEST_BILLING_SECRET')
    expect(source).toContain('if (authHeader !== `Bearer ${testBillingSecret}`)')
    expect(source).toContain('const authFailure = verifyTestBillingAccess(request)')
  })
})

describe('cad-lab generation abuse-control regressions', () => {
  it('rate limits per-user module generation in cad-lab generate-module route', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/cad-lab/generate-module/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain("await rateLimit('api', `cad-lab-module:${user.id}`")
    expect(source).toContain('window: 60 * 60 * 1000')
    expect(source).toContain('{ status: 429 }')
  })

  it('rate limits cad-lab batch status polling endpoint', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/cad-lab/generate-batch/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain("await rateLimit('api', `cad-lab-batch-status:${user.id}`")
    expect(source).toContain('window: 60 * 1000')
    expect(source).toContain('{ status: 429 }')
  })
})

describe('qa test trigger hardening regressions', () => {
  it('rate limits admin QA triggers and derives callback URL from request origin', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/admin/qa-tests/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain("await rateLimit('api', `qa-tests-list:${user.id}`")
    expect(source).toContain('Rate limit exceeded. Please wait before refreshing test runs.')
    expect(source).toContain("await rateLimit('api', `qa-tests-trigger:${user.id}`")
    expect(source).toContain('window: 60 * 60 * 1000')
    expect(source).toContain("new URL('/api/admin/qa-tests/callback', request.nextUrl.origin)")
    expect(source).toContain('if (!process.env.QA_CALLBACK_SECRET)')
  })
})

describe('dev-login hardening regressions', () => {
  it('requires explicit enablement, secret auth, and rate limiting for dev-login route', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/dev-login/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain("process.env.ALLOW_DEV_LOGIN !== 'true'")
    expect(source).toContain('const devLoginSecret = process.env.DEV_LOGIN_SECRET')
    expect(source).toContain('if (authHeader !== `Bearer ${devLoginSecret}`)')
    expect(source).toContain("await rateLimit('api', `dev-login:${ip}`")
    expect(source).toContain('{ status: 429 }')
  })
})

describe('email inbound webhook hardening regressions', () => {
  it('enforces sender-scoped rate limiting and strict recipient token format', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/email/inbound/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(source).not.toContain("import { createClient as createAdminClient } from '@supabase/supabase-js'")
    expect(source).toContain("await rateLimit('webhook', `email-inbound:${ip}`)")
    expect(source).toContain("email-inbound-sender:${senderEmail}")
    expect(source).toContain('window: 60 * 60 * 1000')
    expect(source).toContain('/tasks\\+([a-f0-9]{8})@/i')
    expect(source).toContain('.limit(2)')
    expect(source).toContain('profiles.length !== 1')
  })

  it('resolves objective context before creating tasks from inbound email', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/email/inbound/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain(".from('objectives')")
    expect(source).toContain(".eq('title', 'No objective set')")
    expect(source).toContain('objective_id: objectiveId')
    expect(source).toContain('No objectives available for task creation')
  })
})

describe('voice-to-task objective enforcement regressions', () => {
  it('resolves objective context before creating voice tasks', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/voice-to-task/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain(".from('objectives')")
    expect(source).toContain(".eq('title', 'No objective set')")
    expect(source).toContain('objective_id: objectiveId')
    expect(source).toContain('No objectives available for task creation')
  })
})

describe('google calendar webhook hardening regressions', () => {
  it('fails closed when webhook secret is missing and enforces header auth', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/google/calendar/webhook/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain('const webhookSecret = process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET')
    expect(source).toContain("if (!webhookSecret)")
    expect(source).toContain("return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })")
    expect(source).toContain("if (channelToken !== webhookSecret)")
    expect(source).toContain("return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })")
    expect(source).toContain("await rateLimit('webhook', `google-calendar-webhook:${ip}`)")
  })
})

describe('google oauth state hardening regressions', () => {
  it('signs oauth state at connect step and fails closed without signing secret', async () => {
    const connectRoutePath = path.join(process.cwd(), 'src/app/api/google/connect/route.ts')
    const source = await readFile(connectRoutePath, 'utf-8')

    expect(source).toContain('createSignedOAuthState')
    expect(source).toContain('buildOAuthStatePayload')
    // SECURITY: Prefers dedicated secret, logs warning on fallback
    expect(source).toContain("process.env.GOOGLE_OAUTH_STATE_SECRET")
    expect(source).toContain("GOOGLE_OAUTH_STATE_SECRET not set")
    expect(source).toContain("redirectWithError('not_configured')")
    expect(source).toContain("await rateLimit('api', `google-connect:${user.id}`")
  })

  it('verifies signed oauth state and foundry membership at callback step', async () => {
    const callbackRoutePath = path.join(process.cwd(), 'src/app/api/google/callback/route.ts')
    const source = await readFile(callbackRoutePath, 'utf-8')

    expect(source).toContain('verifySignedOAuthState')
    expect(source).toContain('10 * 60 * 1000')
    expect(source).toContain(".from('foundry_memberships')")
    expect(source).toContain(".eq('foundry_id', stateData.foundryId)")
    expect(source).toContain("error=foundry_mismatch")
    expect(source).toContain("await rateLimit('api', `google-callback:${user.id}`")
    expect(source).toContain("error=rate_limited")
  })
})

describe('telegram settings route hardening regressions', () => {
  it('uses shared admin client helper for telegram linking routes', async () => {
    const routes = [
      'src/app/api/settings/telegram/generate-code/route.ts',
      'src/app/api/settings/telegram/check-link/route.ts',
      'src/app/api/settings/telegram/unlink/route.ts',
    ]

    for (const routePath of routes) {
      const source = await readFile(path.join(process.cwd(), routePath), 'utf-8')
      expect(source).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
      expect(source).toContain('const admin = createAdminClient()')
      expect(source).not.toContain("createClient as createAdminClient")
    }
  })

  it('rate limits telegram link status checks', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/settings/telegram/check-link/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain("await rateLimit('api', `telegram-check-link:${user.id}`")
    expect(source).toContain('window: 60 * 1000')
    expect(source).toContain('{ status: 429 }')
  })
})

describe('security typecheck scope regressions', () => {
  it('includes reports action in security typecheck scope', async () => {
    const configPath = path.join(process.cwd(), 'tsconfig.security.json')
    const source = await readFile(configPath, 'utf-8')

    expect(source).toContain('"src/actions/reports.ts"')
  })
})

describe('stripe webhook hardening regressions', () => {
  it('fails closed when Stripe webhook secret is missing', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/webhooks/stripe/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain('if (!webhookSecret)')
    expect(source).toContain("return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })")
    expect(source).toContain("await rateLimit('webhook', `stripe-webhook:${ip}`)")
    expect(source).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(source).toContain('const supabase = createAdminClient()')
    expect(source).not.toContain("import { createClient } from '@/lib/supabase/server'")
  })
})
