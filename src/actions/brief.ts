"use server"

/**
 * @file Brief Intake Server Action
 *
 * @description Concierge brief intake for the Fractional Forge homepage.
 * A founder submits a short brief → we persist it to `brief_submissions`
 * (admin client, RLS-bypassing) AND email Tristan via Resend. The DB write
 * is the source of truth so a brief is never lost even if email fails.
 *
 * Mirrors src/actions/contact.ts (proven form→Resend pattern).
 */

import { headers } from 'next/headers'
import { Resend } from 'resend'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

export async function submitBrief(data: {
  idea: string
  name: string
  email: string
  sector?: string
  company?: string
}): Promise<{ success?: true; error?: string }> {
  // VALIDATION
  if (!data.idea?.trim() || !data.name?.trim() || !data.email?.trim()) {
    return { error: 'Please add your idea, name and email.' }
  }
  if (data.idea.length > 8000) {
    return { error: 'That brief is a little long — keep it to a paragraph or a page.' }
  }

  // SECURITY: rate limit per IP (shares the contactForm bucket)
  const headersList = await headers()
  const ip = getClientIP(headersList)
  const { success: rateLimitOk } = await rateLimit('contactForm', ip, { limit: 5, window: 300000 })
  if (!rateLimitOk) {
    return { error: 'Too many submissions just now — please try again in a few minutes.' }
  }

  // PERSIST (source of truth — never block the founder on a DB hiccup)
  try {
    const admin = createAdminClient()
    await admin.from('brief_submissions').insert({
      idea: data.idea.trim(),
      name: data.name.trim(),
      email: data.email.trim(),
      sector: data.sector?.trim() || null,
      company: data.company?.trim() || null,
      source: 'homepage',
      ip,
    })
  } catch (err) {
    console.error('[Brief] persist failed:', err)
  }

  // NOTIFY Tristan (the concierge step). DB already has it, so email failure is non-fatal.
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    try {
      await resend.emails.send({
        from: 'Fractional Forge <tristan@fractionalforge.app>',
        to: 'hello@fractionalforge.app',
        replyTo: data.email,
        subject: `[Brief] ${data.name}${data.company ? ' · ' + data.company : ''}${data.sector ? ' · ' + data.sector : ''}`,
        text:
          `New Design Dossier brief request\n\n` +
          `Name: ${data.name}\n` +
          `Email: ${data.email}\n` +
          `Company / role: ${data.company || '—'}\n` +
          `Sector: ${data.sector || '—'}\n\n` +
          `Idea / brief:\n${data.idea}\n`,
      })
    } catch (err) {
      console.error('[Brief] email send failed (brief is saved):', err)
    }
  }

  return { success: true }
}
