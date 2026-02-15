/**
 * @file news-feeds.ts
 *
 * @description RSS feed configuration for specialist news briefings. Maps each
 * specialist to domain-relevant feeds and defines shared macro feeds for
 * economic/political awareness. All feeds are free and do not require API keys.
 *
 * @related
 * - src/lib/agents/specialist-briefings.ts - Consumes these feeds for briefing generation
 * - src/app/(platform)/agents/specialists-data.ts - SpecialistId type and definitions
 */

import type { SpecialistId } from '@/app/(platform)/agents/specialists-data'

/** Single RSS feed source with optional label for display */
export interface NewsFeedSource {
  url: string
  label: string
}

/** Shared macro feeds: top economic, political, and world news. Included for every specialist. */
export const MACRO_FEEDS: NewsFeedSource[] = [
  { url: 'https://feeds.bbci.co.uk/news/rss.xml', label: 'BBC Top Stories' },
  { url: 'https://feeds.npr.org/1001/rss.xml', label: 'NPR News' },
  { url: 'https://www.reutersagency.com/feed/', label: 'Reuters' },
]

/** Domain-specific feeds per specialist. Chief of Staff gets the broadest set. */
export const SPECIALIST_FEEDS: Record<SpecialistId, NewsFeedSource[]> = {
  'chief-of-staff': [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', label: 'BBC World' },
    { url: 'https://feeds.npr.org/1004/rss.xml', label: 'NPR Business' },
    { url: 'https://www.wired.com/feed/rss', label: 'Wired' },
  ],
  strategist: [
    { url: 'https://feeds.npr.org/1004/rss.xml', label: 'NPR Business' },
    { url: 'https://www.wired.com/feed/rss', label: 'Wired' },
    { url: 'https://www.technologyreview.com/feed/', label: 'MIT Technology Review' },
  ],
  'finance-lead': [
    { url: 'https://feeds.npr.org/1004/rss.xml', label: 'NPR Business' },
    { url: 'https://www.technologyreview.com/feed/', label: 'MIT Technology Review' },
  ],
  'fundraising-advisor': [
    { url: 'https://techcrunch.com/feed/', label: 'TechCrunch' },
    { url: 'https://feeds.npr.org/1004/rss.xml', label: 'NPR Business' },
  ],
  cto: [
    { url: 'https://techcrunch.com/feed/', label: 'TechCrunch' },
    { url: 'https://feeds.arstechnica.com/arstechnica/index', label: 'Ars Technica' },
    { url: 'https://hnrss.org/frontpage', label: 'Hacker News' },
    { url: 'https://www.theverge.com/rss/index.xml', label: 'The Verge' },
  ],
  'vp-engineering': [
    { url: 'https://hnrss.org/frontpage', label: 'Hacker News' },
    { url: 'https://feed.infoq.com/', label: 'InfoQ' },
    { url: 'https://dev.to/feed', label: 'Dev.to' },
  ],
  'vp-manufacturing': [
    { url: 'https://www.industryweek.com/rss/all', label: 'IndustryWeek' },
    { url: 'https://www.automationworld.com/rss/all', label: 'Automation World' },
  ],
  'vp-supply-chain': [
    { url: 'https://www.supplychaindive.com/feeds/news/', label: 'Supply Chain Dive' },
    { url: 'https://www.logisticsmanagement.com/rss/all', label: 'Logistics Management' },
  ],
  'product-lead': [
    { url: 'https://techcrunch.com/feed/', label: 'TechCrunch' },
    { url: 'https://www.theverge.com/rss/index.xml', label: 'The Verge' },
    { url: 'https://www.producthunt.com/feed', label: 'Product Hunt' },
  ],
  'growth-marketer': [
    { url: 'https://www.marketingdive.com/feeds/news/', label: 'Marketing Dive' },
    { url: 'https://techcrunch.com/feed/', label: 'TechCrunch' },
  ],
  'sales-lead': [
    { url: 'https://www.marketingdive.com/feeds/news/', label: 'Marketing Dive' },
    { url: 'https://feeds.npr.org/1004/rss.xml', label: 'NPR Business' },
  ],
  'hiring-team': [
    { url: 'https://www.hrdive.com/feeds/news/', label: 'HR Dive' },
    { url: 'https://techcrunch.com/feed/', label: 'TechCrunch' },
  ],
  'legal-counsel': [
    { url: 'https://feeds.npr.org/1004/rss.xml', label: 'NPR Business' },
    { url: 'https://www.wired.com/feed/rss', label: 'Wired' },
  ],
}

/** All feed URLs for a specialist: macro + domain-specific, deduplicated by URL. */
export function getFeedsForSpecialist(specialistId: SpecialistId): NewsFeedSource[] {
  const domain = SPECIALIST_FEEDS[specialistId] ?? []
  const byUrl = new Map<string, NewsFeedSource>()
  for (const f of [...MACRO_FEEDS, ...domain]) {
    byUrl.set(f.url, f)
  }
  return Array.from(byUrl.values())
}
