/**
 * @file Native Insights article loader.
 *
 * @description Reads the republished History Future Now essays stored as JSON
 * in `src/data/insights-articles/`. These are Tristan Fischer's own essays,
 * published natively on fractionalforge.app with a link back to the original.
 * Server-only (uses fs) — imported by the /insights/[slug] route.
 */

import fs from "fs"
import path from "path"

export type InsightsArticle = {
  slug: string
  title: string
  dek: string
  hfnUrl: string
  paragraphs: string[]
}

const DIR = path.join(process.cwd(), "src/data/insights-articles")

export function getArticleSlugs(): string[] {
  try {
    return fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
  } catch {
    return []
  }
}

export function getArticle(slug: string): InsightsArticle | null {
  try {
    const raw = fs.readFileSync(path.join(DIR, `${slug}.json`), "utf8")
    const a = JSON.parse(raw) as InsightsArticle
    if (!a || !a.title || !Array.isArray(a.paragraphs)) return null
    return a
  } catch {
    return null
  }
}

/** True if a native article file exists for this slug (used by the hub to
 *  decide internal link vs external fallback). */
export function hasArticle(slug: string): boolean {
  try {
    return fs.existsSync(path.join(DIR, `${slug}.json`))
  } catch {
    return false
  }
}
