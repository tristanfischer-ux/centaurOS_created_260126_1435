/**
 * @file footer.ts — Shared HTML footer for marketing emails.
 *
 * @description Appends unsubscribe links (single-click for the current channel
 * and unsubscribe-from-everything) plus the Fractional Forge Ltd line to every
 * outbound marketing email.
 *
 * UK PECR + GDPR requirement: every marketing email must carry a working
 * unsubscribe mechanism that does not require the recipient to log in.
 */

import { createUnsubToken } from './unsub-token'
import type { EmailChannel } from './preferences'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

/**
 * Build the HTML footer for a marketing email.
 *
 * @param userId - auth.users.id of the recipient
 * @param channel - which EmailChannel this email is for (controls the single-click unsubscribe target)
 */
export function buildMarketingFooter(userId: string, channel: EmailChannel): string {
  const channelToken = createUnsubToken(userId, { kind: 'channel', channel })
  const allToken = createUnsubToken(userId, { kind: 'all' })

  const channelUnsubUrl = `${BASE_URL}/api/unsubscribe?token=${encodeURIComponent(channelToken)}`
  const allUnsubUrl = `${BASE_URL}/api/unsubscribe?token=${encodeURIComponent(allToken)}`
  const prefsUrl = `${BASE_URL}/settings/email`

  return `
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px 0;" />
    <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; margin: 0;">
      You are receiving this email from Fractional Forge Ltd because you have an account at
      <a href="${BASE_URL}" style="color: #64748b;">fractionalforge.app</a>.
      <br/>
      <a href="${channelUnsubUrl}" style="color: #64748b;">Unsubscribe from these emails</a>
      &nbsp;&middot;&nbsp;
      <a href="${allUnsubUrl}" style="color: #64748b;">Unsubscribe from everything</a>
      &nbsp;&middot;&nbsp;
      <a href="${prefsUrl}" style="color: #64748b;">Manage preferences</a>
    </p>
  `
}
