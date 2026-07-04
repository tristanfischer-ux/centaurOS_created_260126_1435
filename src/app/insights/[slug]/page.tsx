/**
 * @file Native Insights article page (route: /insights/[slug])
 *
 * @description Renders one of Tristan Fischer's essays natively on
 * fractionalforge.app (republished from History Future Now, with a link back
 * to the original at the foot). Article JSON-LD for rich results + AI engines.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, ArrowRight } from "lucide-react"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"
import { getArticle, getArticleSlugs } from "@/lib/insights-articles"

export function generateStaticParams() {
  return getArticleSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const a = getArticle(slug)
  if (!a) return { title: "Insights" }
  return {
    title: a.title,
    description: a.dek,
    alternates: { canonical: `https://fractionalforge.app/insights/${slug}` },
    openGraph: { title: a.title, description: a.dek, type: "article" },
  }
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const a = getArticle(slug)
  if (!a) notFound()

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.dek,
    author: { "@id": "https://fractionalforge.app/#tristan-fischer" },
    publisher: { "@id": "https://fractionalforge.app/#organization" },
    mainEntityOfPage: `https://fractionalforge.app/insights/${slug}`,
    isBasedOn: a.hfnUrl,
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav />

      <main className="flex-1 px-4 sm:px-6 pb-16 sm:pb-24">
        <article className="max-w-2xl mx-auto">
          <div className="pt-8 sm:pt-12">
            <Link
              href="/insights"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Insights
            </Link>
          </div>

          <header className="mt-6 space-y-4">
            <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
              Essay · Tristan Fischer
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
              {a.title}
            </h1>
            {a.dek && (
              <p className="text-lg text-muted-foreground leading-relaxed">{a.dek}</p>
            )}
          </header>

          {/* Header illustration */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/images/insights/${slug}.webp`}
            alt=""
            className="mt-8 w-full aspect-[16/9] object-cover rounded-2xl border border-border"
            style={{ background: "#faf7f3" }}
          />

          <div className="mt-10 space-y-5 text-[17px] leading-relaxed text-foreground/90">
            {a.paragraphs.map((p, i) =>
              p.startsWith("## ") ? (
                <h2
                  key={i}
                  className="text-xl sm:text-2xl font-semibold text-foreground pt-4"
                >
                  {p.replace(/^##\s+/, "")}
                </h2>
              ) : (
                <p key={i}>{p}</p>
              )
            )}
          </div>

          {/* Origin link */}
          <div className="mt-12 pt-6 border-t border-border">
            <a
              href={a.hfnUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-international-orange hover:underline"
            >
              Originally published on History Future Now
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>

          {/* CTA */}
          <div className="mt-12 rounded-2xl bg-muted/40 p-6 sm:p-8 text-center space-y-3">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
              Building something physical?
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              Fractional Forge is the front end for hardware. Start with a free,
              engineer-checked Design Dossier of what it takes to build your idea.
            </p>
            <Link
              href="/brief"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-international-orange text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Start a brief
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </article>
      </main>

      <MarketingFooter />
    </div>
  )
}
