/**
 * @file email-name-match.ts
 *
 * Heuristic: does a contact's email local-part bear any resemblance to their name?
 * Used to surface an "Email needs verification" chip on partner cards when the
 * upstream enrichment pipeline (NeverBounce + scrape) has likely attached the
 * wrong personal email to a partner record.
 *
 * Anchored on Tristan's call 2026-05-20: shared inboxes attributed to a person
 * (e.g. "John Smith" + info@firm.com) are ACCEPTABLE and NOT flagged. Only
 * personal-looking emails that don't match the named contact get the warning.
 * Never destroy or null the address — the chip is additive context only.
 *
 * Council-synthesised from 4-seat coding council 2026-05-20: do NOT do bulk
 * data destruction; UI guard is the right scope, shared-inbox carve-out is
 * essential to avoid false positives on legitimate firm-wide addresses.
 */

const SHARED_INBOX_LOCALS = new Set([
  'info', 'team', 'investments', 'invest', 'investing',
  'admin', 'contact', 'contacts', 'hello', 'hi', 'hey',
  'enquiries', 'enquiry', 'inquiries', 'inquiry',
  'office', 'reception', 'secretary', 'pa', 'exec',
  'ir', 'sales', 'support', 'partners', 'partnerships',
  'deals', 'ventures', 'hr', 'careers', 'jobs',
  'marketing', 'press', 'media', 'general', 'mail',
  'email', 'admissions', 'apply', 'applications',
  'pitch', 'pitches', 'founders', 'startups',
])

/**
 * Returns true when the email local-part DOES NOT contain any of the contact's
 * name-derived patterns AND is not a known shared-inbox alias.
 *
 * Tolerated as "match": first name in local, last name in local,
 * first-initial+lastname, firstname+last-initial, last-initial+firstname,
 * lastname+first-initial. Lowercased; non-alpha stripped.
 *
 * Returns false (no warning) when:
 *   - Either input missing
 *   - Local-part is a shared-inbox alias (info/team/investments/…)
 *   - Local-part contains any name-based pattern
 *   - Name is a single token (can't reliably check)
 *   - First and last name are identical (data anomaly; skip)
 */
export function emailLooksMismatched(
  fullName: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (!fullName || !email) return false

  const at = email.indexOf('@')
  if (at <= 0) return false
  const localRaw = email.slice(0, at).toLowerCase()
  const localClean = localRaw.replace(/[^a-z]/g, '')
  if (!localClean) return false

  if (SHARED_INBOX_LOCALS.has(localClean)) return false

  const tokens = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0)
  if (tokens.length < 2) return false

  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  if (first === last) return false
  if (first.length < 2 || last.length < 2) return false

  const firstInitial = first[0]
  const lastInitial = last[0]

  if (localClean.includes(first)) return false
  if (localClean.includes(last)) return false
  if (localClean.includes(firstInitial + last)) return false
  if (localClean.includes(first + lastInitial)) return false
  if (localClean.includes(lastInitial + first)) return false
  if (localClean.includes(last + firstInitial)) return false

  return true
}
