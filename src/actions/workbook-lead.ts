"use server"

/**
 * @file Example-workbook email gate (P1-c)
 *
 * @description "Email to unlock" in front of the sanitised example Dossier.
 * Not a full brief — one email field, stored to workbook_leads, then the
 * (already-public) workbook URL is returned. A soft gate: the asset itself
 * stays in the public marketing bucket; the gate builds an evaluator list.
 */

import { headers } from 'next/headers'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

const WORKBOOK_URL =
  'https://jyarhvinengfyrwgtskq.supabase.co/storage/v1/object/public/dossiers/example-water-treatment-dossier.xlsx'

export async function unlockWorkbook(formData: FormData): Promise<{
  url?: string
  error?: string
}> {
  const email = String(formData.get('email') ?? '').trim()
  const source = String(formData.get('source') ?? 'example-workbook').slice(0, 60)

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: 'Please enter a valid email address.' }
  }

  const headersList = await headers()
  const ip = getClientIP(headersList)
  const { success: rateLimitOk } = await rateLimit('contactForm', ip, { limit: 10, window: 300000 })
  if (!rateLimitOk) {
    return { error: 'Too many requests just now — please try again in a few minutes.' }
  }

  try {
    const admin = createAdminClient()
    await admin.from('workbook_leads').insert({ email, source, ip })
  } catch (err) {
    // The lead list is best-effort — never block the download on a DB hiccup.
    console.error('[WorkbookGate] lead insert failed:', err)
  }

  return { url: WORKBOOK_URL }
}
