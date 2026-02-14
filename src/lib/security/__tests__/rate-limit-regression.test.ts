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

    const secondWindowRegex = /rateLimit\([\s\S]{0,240}?window:\s*(60|900|3600)\b(?!\s*\*\s*1000)/g

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
      /rateLimit\(\s*'upload'\s*,\s*`message-upload:\$\{user\.id\}:\$\{ip\}`\s*,\s*\{\s*limit:\s*10,\s*window:\s*60\s*\*\s*1000\s*\}\s*\)/s
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
})
