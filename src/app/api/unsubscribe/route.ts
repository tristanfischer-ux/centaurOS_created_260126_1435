/**
 * @file /api/unsubscribe — one-click unsubscribe endpoint for marketing emails.
 *
 * @description This route is called by unsubscribe links embedded in marketing
 * emails. It must work WITHOUT the recipient being logged in — the HMAC-signed
 * token carries everything needed.
 *
 * @security
 * - Token is HMAC-SHA256 signed, 30-day expiry
 * - Invalid/expired tokens return a friendly 400 page
 * - No PII leaked in the response; user IDs stay server-side
 */

import { NextResponse } from 'next/server'
import { verifyUnsubToken } from '@/lib/email/unsub-token'
import {
  unsubscribeAll,
  unsubscribeChannel,
  pauseAll,
  getChannelLabel,
} from '@/lib/email/preferences'

export const dynamic = 'force-dynamic'

function renderPage(opts: {
  ok: boolean
  heading: string
  body: string
}): Response {
  const status = opts.ok ? 200 : 400
  const accent = opts.ok ? '#ff4500' : '#64748b'

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${opts.ok ? 'Unsubscribed' : 'Link invalid'} — Fractional Forge</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #f8fafc;
        color: #1e293b;
        margin: 0;
        padding: 48px 24px;
        line-height: 1.6;
      }
      .card {
        max-width: 480px;
        margin: 0 auto;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 40px 32px;
        text-align: center;
      }
      h1 { color: ${accent}; font-size: 20px; margin: 0 0 16px 0; }
      p { color: #475569; font-size: 15px; margin: 0 0 16px 0; }
      a { color: #ff4500; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .footer { color: #94a3b8; font-size: 13px; margin-top: 32px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${opts.heading}</h1>
      <p>${opts.body}</p>
      <p class="footer">Fractional Forge Ltd</p>
    </div>
  </body>
</html>`

  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return renderPage({
      ok: false,
      heading: 'Link invalid',
      body: 'This unsubscribe link is missing its token. If you believe this is a mistake, reply to the email you received and Tristan will sort it out personally.',
    })
  }

  const payload = verifyUnsubToken(token)
  if (!payload) {
    return renderPage({
      ok: false,
      heading: 'Link invalid or expired',
      body: 'This unsubscribe link cannot be verified. It may have expired, or the URL was truncated in your email client. Reply to the email and Tristan will unsubscribe you manually.',
    })
  }

  try {
    switch (payload.action.kind) {
      case 'all':
        await unsubscribeAll(payload.userId)
        return renderPage({
          ok: true,
          heading: 'You are unsubscribed',
          body: 'You will not receive any further marketing emails from Fractional Forge. Transactional emails — things like password resets and order updates — still go through. You can re-enable marketing email any time from your <a href="/settings/email">email preferences</a>.',
        })

      case 'channel': {
        const { channel } = payload.action
        await unsubscribeChannel(payload.userId, channel)
        const label = getChannelLabel(channel)
        return renderPage({
          ok: true,
          heading: 'Unsubscribed from this channel',
          body: `You will no longer receive <strong>${label.title}</strong> emails. Other email categories are unaffected. You can adjust your <a href="/settings/email">email preferences</a> at any time.`,
        })
      }

      case 'pause':
        await pauseAll(payload.userId, payload.action.days)
        return renderPage({
          ok: true,
          heading: 'Marketing email paused',
          body: `We will pause marketing email for ${payload.action.days} days. You can resume earlier from your <a href="/settings/email">email preferences</a>.`,
        })

      default:
        return renderPage({
          ok: false,
          heading: 'Unknown action',
          body: 'This unsubscribe link is malformed.',
        })
    }
  } catch (error) {
    console.error('[unsubscribe] failed to apply action', error)
    return renderPage({
      ok: false,
      heading: 'Something went wrong',
      body: 'We could not process the unsubscribe. Reply to the email you received and Tristan will sort it out manually.',
    })
  }
}

export async function POST(request: Request): Promise<Response> {
  // Some email clients (Outlook, Gmail list-unsubscribe) POST rather than GET.
  return GET(request)
}
