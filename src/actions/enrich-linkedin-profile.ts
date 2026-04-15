'use server'

/**
 * @file enrich-linkedin-profile.ts
 *
 * @description Enriches a user's marketplace listing with data from their
 * LinkedIn profile URL. Extracts experience, education, and headline from
 * the public LinkedIn page. Non-blocking — called fire-and-forget after
 * profile wizard completion.
 *
 * @security Only enriches the authenticated user's own profile/listing.
 * LinkedIn URL must pass format validation. All extracted data is sanitized.
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const LINKEDIN_URL_PATTERN = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+/i

/**
 * Strip HTML tags from extracted text.
 */
function stripTags(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim()
}

/**
 * Extract structured data from raw LinkedIn page HTML/text.
 * Parses common patterns from LinkedIn public profiles.
 */
function extractLinkedInData(content: string): {
  linkedinHeadline: string | null
  linkedinSummary: string | null
  previousCompanies: string[]
  education: string[]
} {
  // INTENT: LinkedIn public profiles have varying HTML structures.
  // We extract what we can using regex patterns on the cleaned text.
  const cleaned = stripTags(content)

  const linkedinHeadline: string | null = null
  let linkedinSummary: string | null = null
  const previousCompanies: string[] = []
  const education: string[] = []

  // Extract headline — often appears after the name, before location
  // Pattern: text between name-like content and location/connections info
  const headlineMatch = cleaned.match(/(?:Experience|About|Summary)\s*\n+([\s\S]{10,300}?)(?:\n\n|\nExperience|\nEducation)/i)
  if (headlineMatch) {
    linkedinSummary = headlineMatch[1].trim().slice(0, 500)
  }

  // Extract companies from Experience section
  const experienceSection = cleaned.match(/Experience\s*\n([\s\S]*?)(?:\nEducation|\nLicenses|\nSkills|\nRecommendations|$)/i)
  if (experienceSection) {
    // Company names are typically on their own line, often followed by role
    const lines = experienceSection[1].split('\n').map(l => l.trim()).filter(Boolean)
    const companyPatterns = new Set<string>()
    for (const line of lines) {
      // Skip short lines, dates, locations, and common noise
      if (line.length < 3 || line.length > 80) continue
      if (/^\d|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Full-time|Part-time|Contract|Self-employed)/i.test(line)) continue
      if (/^(·|\d+ (yr|mo)|United|London|New York|Remote)/i.test(line)) continue
      // Likely a company or role
      if (companyPatterns.size < 10) {
        companyPatterns.add(line.slice(0, 60))
      }
    }
    previousCompanies.push(...Array.from(companyPatterns).slice(0, 8))
  }

  // Extract education
  const educationSection = cleaned.match(/Education\s*\n([\s\S]*?)(?:\nLicenses|\nSkills|\nRecommendations|\nInterests|$)/i)
  if (educationSection) {
    const lines = educationSection[1].split('\n').map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (line.length < 3 || line.length > 100) continue
      if (/^\d|^(·|\d+ (yr|mo))/i.test(line)) continue
      if (education.length < 4) {
        education.push(line.slice(0, 80))
      }
    }
  }

  return { linkedinHeadline, linkedinSummary, previousCompanies, education }
}

/**
 * Enrich a user's marketplace listing with LinkedIn profile data.
 *
 * @description Fetches the LinkedIn profile page, extracts structured data,
 * and merges it into the user's marketplace listing attributes. Only updates
 * fields that aren't already filled in by the user.
 *
 * @returns Success or error. Non-blocking — errors are logged, not thrown.
 *
 * @security Authenticated user only. Only updates own listing.
 */
export async function enrichLinkedInProfile(): Promise<{ success?: boolean; error?: string; enriched?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Get user's linkedin_url from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('linkedin_url')
    .eq('id', user.id)
    .single()

  const linkedinUrl = profile?.linkedin_url
  if (!linkedinUrl || !LINKEDIN_URL_PATTERN.test(linkedinUrl)) {
    return { success: true, enriched: false } // No URL to enrich from
  }

  // Get provider profile + listing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: providerProfile } = await (supabase as any)
    .from('provider_profiles')
    .select('id, listing_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!providerProfile?.listing_id) {
    return { success: true, enriched: false } // No listing to enrich
  }

  // Fetch LinkedIn page content — fallback chain: TinyFish → direct fetch → give up
  let pageContent: string | null = null

  // INTENT: TinyFish CLI has anti-bot mechanisms (28 evasion techniques) and returns
  // clean markdown. LinkedIn blocks direct fetch() but TinyFish can often get through.
  // Only runs server-side (Vercel functions won't have tinyfish installed — this is
  // a local dev enrichment path that fires during profile wizard completion).
  try {
    const { execSync } = await import('child_process')
    const result = execSync(
      `tinyfish fetch content get "${linkedinUrl.replace(/"/g, '')}"`,
      { timeout: 30000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    if (result && result.length > 100) {
      pageContent = result
      console.info('[LinkedInEnrich] TinyFish succeeded for:', linkedinUrl)
    }
  } catch {
    console.warn('[LinkedInEnrich] TinyFish unavailable or failed, trying direct fetch')
  }

  // Fallback: direct fetch (will fail on most LinkedIn profiles but worth trying)
  if (!pageContent) {
    try {
      const response = await fetch(linkedinUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) {
        pageContent = await response.text()
      } else {
        console.warn(`[LinkedInEnrich] Fetch returned ${response.status} for ${linkedinUrl}`)
      }
    } catch (err) {
      console.warn('[LinkedInEnrich] Direct fetch failed:', err)
    }
  }

  if (!pageContent) {
    return { success: true, enriched: false }
  }

  // Extract structured data
  const extracted = extractLinkedInData(pageContent)

  if (!extracted.previousCompanies.length && !extracted.education.length && !extracted.linkedinSummary) {
    return { success: true, enriched: false }
  }

  // Get current listing attributes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: listing } = await (supabase as any)
    .from('marketplace_listings')
    .select('attributes')
    .eq('id', providerProfile.listing_id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentAttrs = (listing?.attributes || {}) as Record<string, any>

  // DECISION: Only add fields that aren't already populated by the user.
  // User-entered data always takes priority over scraped data.
  const enrichedAttrs = { ...currentAttrs }

  if (extracted.previousCompanies.length > 0 && !currentAttrs.previous_companies?.length) {
    enrichedAttrs.previous_companies = extracted.previousCompanies
  }

  if (extracted.education.length > 0 && !currentAttrs.education) {
    enrichedAttrs.education = extracted.education.join(' · ')
  }

  if (extracted.linkedinSummary && !currentAttrs.linkedin_summary) {
    enrichedAttrs.linkedin_summary = extracted.linkedinSummary
  }

  enrichedAttrs.linkedin_enriched_at = new Date().toISOString()

  // Update listing attributes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('marketplace_listings')
    .update({
      attributes: enrichedAttrs,
      updated_at: new Date().toISOString(),
    })
    .eq('id', providerProfile.listing_id)

  if (updateError) {
    console.error('[LinkedInEnrich] Listing update failed:', updateError.message)
    return { error: 'Failed to enrich profile' }
  }

  revalidatePath('/marketplace')
  revalidatePath('/recruits')

  console.info('[LinkedInEnrich] Enriched listing for user:', user.id, {
    companies: extracted.previousCompanies.length,
    education: extracted.education.length,
    hasSummary: !!extracted.linkedinSummary,
  })

  return { success: true, enriched: true }
}
