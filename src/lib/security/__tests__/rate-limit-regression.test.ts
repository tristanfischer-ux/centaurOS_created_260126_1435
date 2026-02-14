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
})
