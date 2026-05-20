#!/usr/bin/env npx tsx
/**
 * scripts/validate-supplier-contacts.tsx
 *
 * Sprint 3A (Tristan 2026-05-20): supplier contact validation pass.
 *
 * Engine D (enrich-state-with-suppliers.tsx) picks each supplier candidate
 * from the Companies House database OR via an LLM-scored Brave fallback,
 * persisting whatever website_url + contact_email came back. The match
 * quality for principal-contractor names has been poor — "GrowUp Urban
 * Farms" got cambridgehok.co.uk (Cambridge HOK is a different company),
 * "Digital Farming" got lettusgrow.org (LettUs Grow is unrelated).
 *
 * This script does a focused re-validation pass:
 *
 *   For each supplier candidate in state.suppliers:
 *     1. If website_url already token-reconciles with the company name
 *        (host apex shares ≥1 substantive token with the company name),
 *        leave it.
 *     2. Otherwise, do a Brave search "{exact company name} UK".
 *     3. Take the first ORGANIC result whose host domain token-reconciles
 *        with the company name. Update website_url to that domain.
 *     4. If contact_email's domain doesn't match the new website_url's
 *        host apex, drop the email (the renderer's hygiene catches it
 *        too, but this clears it from state for any downstream consumer).
 *     5. If no Brave result reconciles, drop website_url entirely.
 *
 * UNIVERSAL — applies to every product class. The renderer's
 * supplierUrlReconciles + supplierEmailReconciles helpers already drop
 * bad-domain rows at render time; this script PRE-FIXES them at the chain
 * level so the state stays clean.
 *
 * Usage:
 *   npx tsx scripts/validate-supplier-contacts.tsx <state.json> [--write]
 *
 * Wired into scripts/serial-design-chain-v2.tsx AFTER Engine D and BEFORE
 * the render step. Skipped via CHAIN_SKIP_SUPPLIER_VALIDATION=1.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const BRAVE_KEY = process.env.BRAVE_API_KEY ?? loadBraveKey()
const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const RESULTS_PER_QUERY = 8

function loadBraveKey(): string | undefined {
  const candidates = [
    '/Users/tristanfischer/.claude/secrets/brave.env',
    '/Users/tristanfischer/secrets/brave.env',
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const txt = readFileSync(p, 'utf-8')
    const m = txt.match(/BRAVE_API_KEY\s*=\s*['"]?([^'"\s]+)['"]?/)
    if (m) return m[1]
  }
  return undefined
}

interface BraveResult {
  url: string
  title: string
  description: string
}

const STOPWORDS = new Set(['ltd', 'plc', 'inc', 'llc', 'llp', 'gmbh', 'group', 'holdings', 'holding', 'services', 'solutions', 'systems', 'technology', 'technologies', 'energy', 'power', 'digital', 'global', 'international', 'the', 'and', 'for', 'of'])

function apexFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    const parts = host.split('.')
    if (parts.length >= 3 && (parts[parts.length - 2] === 'co' || parts[parts.length - 2] === 'com' || parts[parts.length - 2] === 'org')) {
      return parts[parts.length - 3]
    }
    if (parts.length >= 2) return parts[parts.length - 2]
    return parts[0] ?? ''
  } catch {
    return ''
  }
}

function tokensOf(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  )
}

function nameReconcilesWithUrl(name: string, url: string): boolean {
  if (!name || !url) return false
  const apex = apexFromUrl(url)
  if (!apex) return false
  const nameToks = tokensOf(name)
  const hostToks = tokensOf(apex)
  if (hostToks.size === 0) return false
  for (const t of nameToks) {
    if (hostToks.has(t)) return true
    for (const h of hostToks) {
      if (t.length >= 4 && h.includes(t)) return true
      if (h.length >= 4 && t.includes(h)) return true
    }
  }
  return false
}

const NON_COMPANY_HOSTS = new Set([
  'linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
  'youtube.com', 'reddit.com', 'wikipedia.org', 'glassdoor.com', 'indeed.com',
  'crunchbase.com', 'pitchbook.com', 'zoominfo.com',
  'bing.com', 'google.com', 'yahoo.com', 'duckduckgo.com',
])

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

function isAcceptableHost(url: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  for (const blocked of NON_COMPANY_HOSTS) {
    if (host === blocked || host.endsWith('.' + blocked)) return false
  }
  return true
}

async function braveSearch(query: string): Promise<BraveResult[]> {
  if (!BRAVE_KEY) {
    console.error('[supplier-validate] BRAVE_API_KEY missing; skipping search')
    return []
  }
  const params = new URLSearchParams({ q: query, country: 'GB', count: String(RESULTS_PER_QUERY) })
  try {
    const res = await fetch(`${BRAVE_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY },
    })
    if (!res.ok) {
      console.error(`[supplier-validate] brave HTTP ${res.status}`)
      return []
    }
    const j: any = await res.json()
    const rows: any[] = j?.web?.results ?? []
    const out: BraveResult[] = []
    for (const r of rows) {
      const url = String(r?.url ?? '').trim()
      if (!url || !isAcceptableHost(url)) continue
      const title = String(r?.title ?? '').trim()
      const description = String(r?.description ?? '').trim()
      out.push({ url, title, description })
    }
    return out
  } catch (err) {
    console.error(`[supplier-validate] brave error: ${(err as Error).message}`)
    return []
  }
}

async function revalidateCandidate(c: any): Promise<{ changed: boolean; reason: string }> {
  const name = String(c?.name ?? '').trim()
  if (!name) return { changed: false, reason: 'no name' }
  // Already valid? leave alone.
  if (c.website_url && nameReconcilesWithUrl(name, String(c.website_url))) {
    return { changed: false, reason: 'website_url already reconciles' }
  }
  // Search for the real website.
  const results = await braveSearch(`"${name}" UK`)
  let match: BraveResult | null = null
  for (const r of results) {
    if (nameReconcilesWithUrl(name, r.url)) { match = r; break }
  }
  if (!match) {
    // No good match found — drop bad website + email
    const dropped = !!c.website_url || !!c.contact_email
    if (c.website_url) {
      c.supplier_validation_log = `dropped wrong website "${c.website_url}" — no reconciling Brave match for "${name}"`
      c.website_url = null
    }
    if (c.contact_email) {
      c.contact_email = null
    }
    return { changed: dropped, reason: 'no match found — bad website/email dropped' }
  }
  // Replace with validated URL
  const oldUrl = c.website_url
  // Normalise to apex-host root URL so future renders link to the homepage
  const u = new URL(match.url)
  const cleanUrl = `https://${u.hostname.replace(/^www\./, '')}`
  c.website_url = cleanUrl
  c.supplier_validation_log = oldUrl
    ? `replaced "${oldUrl}" with "${cleanUrl}" via Brave revalidation`
    : `set website_url to "${cleanUrl}" via Brave revalidation`
  // If contact_email's domain doesn't match the new URL's host apex, drop it.
  if (c.contact_email) {
    const emailDomain = String(c.contact_email).split('@')[1] ?? ''
    if (!nameReconcilesWithUrl(name, `https://${emailDomain}`)) {
      c.contact_email = null
    }
  }
  return { changed: true, reason: `replaced website_url → ${cleanUrl}` }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: validate-supplier-contacts.tsx <state.json> [--write]')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const write = args.includes('--write')
  if (!existsSync(statePath)) {
    console.error(`State not found: ${statePath}`)
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const suppliers: any[] = Array.isArray(state.suppliers) ? state.suppliers : []
  if (suppliers.length === 0) {
    console.log('[supplier-validate] no suppliers to validate')
    return
  }

  let validated = 0
  let replaced = 0
  let dropped = 0
  let leftAlone = 0
  let totalCandidates = 0

  for (const archetype of suppliers) {
    const candidates: any[] = Array.isArray(archetype?.candidates) ? archetype.candidates : []
    for (const c of candidates) {
      totalCandidates += 1
      const result = await revalidateCandidate(c)
      if (!result.changed) {
        leftAlone += 1
        continue
      }
      validated += 1
      if (result.reason.startsWith('replaced website_url')) replaced += 1
      else if (result.reason.startsWith('no match found')) dropped += 1
    }
  }

  console.log(`[supplier-validate] ${totalCandidates} candidate(s) examined: ${leftAlone} already reconciled, ${replaced} URLs replaced, ${dropped} dropped, ${validated} changed total`)

  state.supplier_validation_summary = {
    total_candidates: totalCandidates,
    already_reconciled: leftAlone,
    urls_replaced: replaced,
    dropped: dropped,
    generated_at: new Date().toISOString(),
  }

  if (write) {
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.log(`[supplier-validate] wrote ${statePath}`)
  } else {
    console.log('[supplier-validate] dry run; pass --write to persist')
  }
}

main().catch((err) => {
  console.error(`[supplier-validate] FATAL: ${err}`)
  process.exit(1)
})
