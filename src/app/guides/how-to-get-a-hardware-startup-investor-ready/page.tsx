/**
 * @file How-to guide: getting a hardware startup investor-ready (route: /guides/how-to-get-a-hardware-startup-investor-ready)
 *
 * @description Practical guidance for hardware founders on what investors check,
 * why they pass, and the manufacturing story they trust. Article + FAQPage
 * JSON-LD for rich results and AI answer engines. Server component — exports
 * metadata for SEO.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"
import { Breadcrumbs } from "@/components/marketing/breadcrumbs"

export const metadata: Metadata = {
  title: "How to get a hardware startup investor-ready",
  description:
    "A practical guide to getting a hardware startup investor-ready — what investors actually check, the common reasons they pass, and the manufacturing story they trust.",
  alternates: {
    canonical:
      "https://fractionalforge.app/guides/how-to-get-a-hardware-startup-investor-ready",
  },
}

const CHECKS = [
  {
    name: "Team",
    covers:
      "Have these people built and shipped physical product before? Hardware punishes teams who have only ever shipped software, and investors know it. Show the scar tissue.",
  },
  {
    name: "Intellectual property and defensibility",
    covers:
      "What stops a well-funded competitor copying you? Patents where they matter, but also process know-how, tooling and supply relationships that are hard to reproduce.",
  },
  {
    name: "Manufacturing plan",
    covers:
      "How does the product actually get built, at what volume, by whom, at what cost? This is where hardware pitches most often fall apart under questioning.",
  },
  {
    name: "Unit economics",
    covers:
      "Landed unit cost, gross margin, and how both move with volume. A credible path from today's cost to a healthy margin at scale is the number that gets the term sheet.",
  },
  {
    name: "Traction and evidence",
    covers:
      "Working units in the field, letters of intent, pilots, pre-orders — anything that shows demand is real and the thing can be made. Evidence beats projection.",
  },
]

const FAQ = [
  {
    q: "What do hardware investors actually check?",
    a: "Five things above all: the team's track record shipping physical product, whether the intellectual property and know-how are genuinely defensible, a credible manufacturing plan, unit economics that reach a healthy gross margin at scale, and real-world evidence of demand and buildability. Software-style traction metrics matter less; investors want proof the thing can be made repeatably at a cost that leaves margin.",
  },
  {
    q: "Why do hardware startups get a pass?",
    a: "Most often because the manufacturing and cost story does not hold up. The founder can demonstrate a prototype but cannot explain how it gets built at volume, what the landed unit cost is, or how the margin works at scale. Other common reasons: a bill of materials that has clearly not been costed honestly, no second source for critical parts, a team with no hardware shipping experience, and traction that is all projection and no evidence.",
  },
  {
    q: "What manufacturing story do investors trust?",
    a: "A specific one. Named or clearly-typed manufacturing partners, a bill of materials costed at real volumes, a landed unit cost with the assumptions shown, an honest gross margin today and a credible path to a better one at scale, and an awareness of the supply-chain and tooling risks with a plan for each. Investors trust founders who can be pinned down on numbers, and distrust ones who wave at 'economies of scale' without showing the arithmetic.",
  },
  {
    q: "How early should I prepare the manufacturing and cost story?",
    a: "Before you start raising, not during. The manufacturing plan and unit economics take longer to build credibly than the deck, and they are the part diligence probes hardest. Having an auditable cost model ready — one where every figure traces to a source — turns the hardest part of diligence into a strength rather than the thing that stalls the round.",
  },
]

export default function InvestorReadyGuide() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "How to get a hardware startup investor-ready",
        description:
          "A practical guide to getting a hardware startup investor-ready — what investors actually check, why they pass, and the manufacturing story they trust.",
        author: { "@id": "https://fractionalforge.app/#tristan-fischer" },
        publisher: { "@id": "https://fractionalforge.app/#organization" },
        mainEntityOfPage:
          "https://fractionalforge.app/guides/how-to-get-a-hardware-startup-investor-ready",
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav />

      <main className="flex-1 px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto space-y-14 sm:space-y-20">
          {/* Hero */}
          <div className="pt-8 sm:pt-12"><Breadcrumbs trail={[{ name: "Guides" }, { name: "How to get a hardware startup investor-ready", href: "/guides/how-to-get-a-hardware-startup-investor-ready" }]} /></div>
          <section className="space-y-5">
            <Badge variant="brand" size="lg">
              How-to guide
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
              How to get a hardware startup investor-ready
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Hardware fundraising is not software fundraising with a physical product
              bolted on. Investors ask different questions and pass for different
              reasons — and the difference is far older than venture capital itself.
              This is what they actually check, why they walk away, and the
              manufacturing story that earns their confidence.
            </p>
          </section>

          {/* Header illustration */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/insights/guide-how-to-get-a-hardware-startup-investor-ready.webp" alt="" className="w-full aspect-[16/9] object-cover rounded-2xl border border-border bg-[#faf7f3]" loading="lazy" />

          {/* Historical anchor */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              What a seventeenth-century coffee house knew about your round
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                In the 1680s a Londoner named Edward Lloyd ran a coffee house near the
                Thames that happened to attract ship owners, captains and merchants.
                They came for the coffee and stayed for the shipping news, and before
                long men with capital began sitting among them to take on a share of
                the risk of a voyage in exchange for a premium. Each wrote his name{" "}
                <em>beneath</em> the details of the ship and cargo on a slip of paper.
                That signature under the risk is where the word{" "}
                <strong className="text-foreground">underwriter</strong> comes from,
                and Lloyd&apos;s coffee house is where modern insurance was born.
              </p>
              <p>
                The interesting part is not the etymology; it is what those men asked
                before they signed. Not &quot;how exciting is this voyage?&quot; but
                the condition of the hull, the record of the captain, the season, the
                route, the cargo. They were pricing whether the ship could actually
                make it — with evidence, because their own money was under the line. A
                hardware investor is doing the identical thing three and a half
                centuries later. They are underwriting a build. The founder who thinks
                they are selling a vision, when the person across the table is quietly
                surveying the hull, has misread the room.
              </p>
            </div>
          </section>

          {/* What investors check */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              What hardware investors actually check
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              A hardware investor is underwriting a build as much as a market. Five
              things carry most of the weight:
            </p>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {CHECKS.map((c) => (
                    <div key={c.name} className="px-5 py-4">
                      <p className="font-semibold text-foreground">{c.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        {c.covers}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Why they pass */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              The common reasons they pass
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                The single most frequent reason a hardware round stalls is that the{" "}
                <strong className="text-foreground">manufacturing and cost story does
                not hold up under questioning</strong>. The founder can show a working
                prototype but cannot say what it costs to build at volume, who builds
                it, or how the margin works at scale. When the answer to &quot;what is
                your landed unit cost at ten thousand units?&quot; is a shrug, the
                underwriter has seen the hull, and the conversation is usually over.
              </p>
              <p>
                Close behind: a bill of materials that has plainly been costed at
                sample prices, a single source for a critical part with no fallback, a
                team with no experience shipping physical product, and traction that
                is all forecast and no field evidence. None of these is fatal on its
                own — but each is a place a diligent investor can lose confidence, and
                hardware diligence is patient. It has been patient since 1686.
              </p>
            </div>
          </section>

          {/* The manufacturing story */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              The manufacturing story investors trust
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              A trusted manufacturing story is specific and pinned to numbers. It
              tends to contain:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
              {[
                "Named or clearly-typed manufacturing partners, and why they fit the volume",
                "A bill of materials costed at real order volumes, not sample prices",
                "A landed unit cost with every assumption shown and sourced",
                "An honest gross margin today, and a credible path to a better one at scale",
                "A second source, or a plan for one, on the parts that matter",
                "The supply-chain, tooling and lead-time risks named — with a response to each",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-international-orange mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {item}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              The through-line is credibility under pressure. An investor trusts a
              founder who can be pinned down — who answers &quot;how do you know?&quot;
              with a sourced figure rather than a hopeful one. The strongest version of
              this is a cost and manufacturing model an investor can open and
              interrogate for themselves, the way a marine underwriter would have
              wanted to walk the deck rather than read the brochure.
            </p>
          </section>

          {/* Prepare early */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Prepare the hard part before you raise
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                The deck is the easy part. The manufacturing plan and the unit
                economics are what diligence probes hardest, and they take longer to
                build credibly than a founder expects. Doing that work before you open
                a round turns the most dangerous part of diligence into a point of
                strength — you hand over a model instead of promising to &quot;follow
                up with the numbers&quot;, which is the sentence that ends more
                hardware rounds than any other.
              </p>
              <p>
                A Fractional Forge Design Dossier is built for exactly this moment: an
                auditable, engineer-checked Excel model where the bill of materials,
                the build plan, the landed unit cost and the margin all trace from
                stated inputs and recompute when an assumption changes. An investor can
                open it and check the arithmetic themselves. Your first one is free —
                but even without it, the lesson from the coffee house stands: walk in
                able to defend every number, or expect to walk out.
              </p>
            </div>
          </section>

          {/* FAQ */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Common questions
            </h2>
            <div className="space-y-3">
              {FAQ.map((f) => (
                <Card key={f.q}>
                  <CardContent className="pt-6 space-y-2">
                    <h3 className="font-semibold text-foreground">{f.q}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {f.a}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="text-center space-y-4 py-6 border-t border-border">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Getting ready to raise?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Describe your product in a short brief and get a Design Dossier — an
              auditable, engineer-checked model of the build, the bill of materials
              and the unit economics an investor will ask to see. Your first one is
              free.
            </p>
            <Link
              href="/brief"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-international-orange text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Start a brief
              <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}
