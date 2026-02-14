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

    expect(source).toContain('if (!cronSecret)')
    expect(source).toContain("return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 })")
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
    expect(permissionGuardSource).toContain('const supabase = createAdminClient()')
    expect(permissionGuardSource).not.toContain("import { supabase } from '@/lib/supabase/server'")

    expect(collaborationHubSource).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(collaborationHubSource).toContain('const supabase = createAdminClient()')
    expect(collaborationHubSource).not.toContain("import { supabase } from '@/lib/supabase/server'")
  })

  it('validates Slack webhook URLs before outbound cron fetch', async () => {
    const dailyReportsRoutePath = path.join(process.cwd(), 'src/app/api/cron/reports/daily/route.ts')
    const source = await readFile(dailyReportsRoutePath, 'utf-8')

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
  })

  it('fails closed for all cron routes when CRON_SECRET is missing', async () => {
    const cronRoutes = [
      'src/app/api/cron/reports/daily/route.ts',
      'src/app/api/cron/weekly-synthesis/route.ts',
      'src/app/api/cron/agent-sweep/route.ts',
      'src/app/api/cron/telegram-briefings/route.ts',
    ]

    for (const routePath of cronRoutes) {
      const source = await readFile(path.join(process.cwd(), routePath), 'utf-8')
      expect(source).toContain('if (!cronSecret)')
      expect(source).toContain("return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 })")
    }
  })

  it('fails closed for sweep-trigger webhook auth when secrets are missing', async () => {
    const sweepTriggerPath = path.join(process.cwd(), 'src/app/api/agents/sweep-trigger/route.ts')
    const source = await readFile(sweepTriggerPath, 'utf-8')

    expect(source).toContain('if (!webhookSecret)')
    expect(source).toContain("return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })")
    expect(source).toContain('const authFailure = verifyWebhookAuth(req)')
  })

  it('fails closed for telegram webhook route and guards GET status endpoint', async () => {
    const telegramRoutePath = path.join(process.cwd(), 'src/app/api/bot/telegram/route.ts')
    const source = await readFile(telegramRoutePath, 'utf-8')

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
      'supabase/migrations/20260214134000_tighten_legacy_message_attachment_policies.sql'
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

describe('internal API egress hardening regressions', () => {
  it('uses request origin for council specialist execution calls', async () => {
    const councilRoutePath = path.join(process.cwd(), 'src/app/api/agents/council/route.ts')
    const source = await readFile(councilRoutePath, 'utf-8')

    expect(source).toContain('const internalApiOrigin = request.nextUrl.origin')
    expect(source).toContain("new URL('/api/agents/execute', internalApiOrigin)")
    expect(source).not.toContain('process.env.NEXT_PUBLIC_BASE_URL')
    expect(source).not.toContain('process.env.VERCEL_URL')
  })

  it('derives council server-action API host from request headers, not environment', async () => {
    const actionPath = path.join(process.cwd(), 'src/actions/run-specialist-council.ts')
    const source = await readFile(actionPath, 'utf-8')

    expect(source).toContain("const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')")
    expect(source).toContain("new URL('/api/agents/council', baseUrl)")
    expect(source).toContain('isValidHostHeader')
    expect(source).not.toContain('process.env.NEXT_PUBLIC_BASE_URL')
    expect(source).not.toContain('process.env.VERCEL_URL')
  })
})

describe('agent error-response sanitization regressions', () => {
  it('does not expose raw server error messages from council route', async () => {
    const councilRoutePath = path.join(process.cwd(), 'src/app/api/agents/council/route.ts')
    const source = await readFile(councilRoutePath, 'utf-8')

    expect(source).toContain("return NextResponse.json({ error: 'Council execution failed' }, { status: 500 })")
    expect(source).not.toContain('return NextResponse.json({ error: message }, { status: 500 })')
  })

  it('sanitizes execute route terminal and stream error payloads', async () => {
    const executeRoutePath = path.join(process.cwd(), 'src/app/api/agents/execute/route.ts')
    const source = await readFile(executeRoutePath, 'utf-8')

    expect(source).toContain('{ error: "Failed to execute prompt" }')
    expect(source).toContain('const safeErrorMessage = "Stream interrupted"')
    expect(source).toContain('JSON.stringify({ error: safeErrorMessage })')
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
      expect(source).toContain('if (!process.env.OPENAI_API_KEY)')
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
    const actionFiles = [
      'src/actions/strategic-planner.ts',
      'src/actions/smart-goals.ts',
      'src/actions/generate-advisory-answer.ts',
      'src/actions/assess-coverage.ts',
      'src/actions/analyze.ts',
      'src/app/actions/analyze-business-plan.ts',
      'src/lib/telegram/ai-processor.ts',
    ]

    for (const filePath of actionFiles) {
      const source = await readFile(path.join(process.cwd(), filePath), 'utf-8')
      expect(source).toContain('function getOpenAIClient()')
      expect(source).not.toContain('dummy-key-for-build')
      expect(source).not.toContain('sk-placeholder-for-build-only')
      expect(source).not.toMatch(/apiKey:\s*process\.env\.OPENAI_API_KEY\s*\|\|/)
    }
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
    expect(source).toContain("await rateLimit('webhook', `webhook:${ip}`)")
  })
})

describe('stripe webhook hardening regressions', () => {
  it('fails closed when Stripe webhook secret is missing', async () => {
    const routePath = path.join(process.cwd(), 'src/app/api/webhooks/stripe/route.ts')
    const source = await readFile(routePath, 'utf-8')

    expect(source).toContain('if (!webhookSecret)')
    expect(source).toContain("return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })")
    expect(source).toContain("await rateLimit('webhook', `webhook:${ip}`)")
    expect(source).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
    expect(source).toContain('const supabase = createAdminClient()')
    expect(source).not.toContain("import { createClient } from '@/lib/supabase/server'")
  })
})
