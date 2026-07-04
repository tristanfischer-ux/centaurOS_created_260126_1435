/**
 * @file Insights hub (route: /insights)
 *
 * @description Curated index of Tristan Fischer's essays on History Future Now,
 * grouped by theme, cross-linked to historyfuturenow.com. Builds topical
 * authority (E-E-A-T) around the "front end for hardware" thesis and gives
 * search + AI answer-engines substantive, authored content to reference.
 * Content is real and links out to the source essays — nothing is fabricated.
 *
 * Server component — exports metadata for SEO.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

export const metadata: Metadata = {
  title: "Insights",
  description:
    "Essays by Tristan Fischer on why hardware is harder than software, the return of manufacturing, and the physical economy — the thinking behind Fractional Forge, the front end for hardware.",
  alternates: { canonical: "https://fractionalforge.app/insights" },
}

type Essay = { title: string; hook: string; slug: string }
type Section = { key: string; heading: string; intro: string; essays: Essay[] }

const SECTIONS: Section[] = [
  {
    key: "thesis",
    heading: "The hardware thesis",
    intro:
      "Why building physical products is structurally harder than building software — and what the missing infrastructure layer looks like.",
    essays: [
      {
        title: "Hardware Needs Its AWS Moment",
        hook: "Software rents its infrastructure; hardware never could. Why that gap is the defining problem for physical-product founders.",
        slug: "from-basement-servers-to-billion-users-what-software-learned-that-hardware-hasnt",
      },
      {
        title: "The Eighteen-Month Trap",
        hook: "Why hardware startups lose a year and a half before they have built anything — and where that time actually goes.",
        slug: "the-eighteen-month-trap-why-hardware-startups-are-structurally-slow",
      },
      {
        title: "The Fifteen-Minute Factory",
        hook: "Why proximity still wins in manufacturing, even in a globalised world.",
        slug: "the-fifteen-minute-factory-why-proximity-still-wins",
      },
      {
        title: "The Arsenal and the Container",
        hook: "How shared infrastructure, from arsenals to shipping containers, always beats going it alone.",
        slug: "the-arsenal-and-the-container-how-shared-infrastructure-always-wins",
      },
      {
        title: "Platform Technologies",
        hook: "How the foundational technologies of the past tell you which platforms will define the future.",
        slug: "platform-technologies-how-foundational-technologies-of-the-past-show-us-the-foundational-technologies-of-the-future",
      },
    ],
  },
  {
    key: "making",
    heading: "Making things again",
    intro:
      "The return of manufacturing to the West, why it left, and what it takes to build at home.",
    essays: [
      {
        title: "The Return of the State Factory",
        hook: "Why nations that forgot how to make things are urgently relearning.",
        slug: "the-return-of-the-state-factory-why-nations-that-forgot-how-to-make-things-are-remembering",
      },
      {
        title: "The Great Offshoring",
        hook: "How the world's factory moved east — and what it cost.",
        slug: "the-great-offshoring-how-the-worlds-factory-moved-east",
      },
      {
        title: "The Ladder and the Lie",
        hook: "Why every great economy was built on tariffs, and free trade mostly serves whoever is already ahead.",
        slug: "the-ladder-and-the-lie-why-every-great-economy-was-built-on-tariffs-and-free-trade-only-serves-the-already-dominant",
      },
      {
        title: "Why Cheap Imports Cost More",
        hook: "The hidden price of buying cheap imported products, for individuals and for society.",
        slug: "why-buying-cheap-imported-products-is-more-expensive-for-individuals-and-not-just-society",
      },
    ],
  },
  {
    key: "physical",
    heading: "Energy, materials and the physical economy",
    intro:
      "The atoms underneath everything — power, storage, critical minerals, food and water.",
    essays: [
      {
        title: "The Renewables and Battery Revolution",
        hook: "The shift reshaping power, and why storage sits at the centre of it.",
        slug: "the-renewables-and-battery-revolution",
      },
      {
        title: "The Atom Returns",
        hook: "Why the world's most feared energy source may be its best hope.",
        slug: "the-atom-returns-why-the-worlds-most-feared-energy-source-is-its-best-hope",
      },
      {
        title: "The New Oil",
        hook: "Why the race for critical minerals will define the 21st century.",
        slug: "the-new-oil-why-the-race-for-critical-minerals-will-define-the-21st-century",
      },
      {
        title: "Vertical Farming: The Electrical Convergence",
        hook: "Where power, transport and agriculture collide.",
        slug: "vertical-farming-the-electrical-convergence-power-transport-and-agriculture",
      },
      {
        title: "The Last Drop",
        hook: "Why every civilisation that ran out of water collapsed.",
        slug: "the-last-drop-why-every-civilisation-that-ran-out-of-water-collapsed",
      },
    ],
  },
]

export default function InsightsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />

      <main className="flex-1 px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-5xl mx-auto space-y-14 sm:space-y-20">
          {/* Hero */}
          <section className="pt-8 sm:pt-12 space-y-4">
            <Badge variant="brand" size="lg">
              Insights
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
              Why hardware is hard — and how to fix it
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              The thinking behind Fractional Forge. Tristan Fischer writes at
              length on why building physical things is structurally harder
              than software, the return of manufacturing, and the physical
              economy underneath everything. A selection of his essays, on
              History Future Now.
            </p>
          </section>

          {/* Sections */}
          {SECTIONS.map((section) => (
            <section key={section.key} className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
                  {section.heading}
                </h2>
                <p className="text-muted-foreground max-w-2xl leading-relaxed">
                  {section.intro}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.essays.map((essay) => (
                  <Link
                    key={essay.slug}
                    href={`/insights/${essay.slug}`}
                    className="group"
                  >
                    <Card className="h-full overflow-hidden transition-colors hover:border-international-orange/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/images/insights/${essay.slug}.webp`}
                        alt=""
                        className="w-full aspect-[16/9] object-cover border-b border-border"
                        style={{ background: "#faf7f3" }}
                        loading="lazy"
                      />
                      <CardContent className="pt-5 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-international-orange">
                          Essay
                        </p>
                        <h3 className="font-semibold text-foreground flex items-start gap-1.5">
                          <span>{essay.title}</span>
                          <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-international-orange" />
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {essay.hook}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}

          {/* Practical guides */}
          <section className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
                Practical guides
              </h2>
              <p className="text-muted-foreground max-w-2xl leading-relaxed">
                Straight, useful answers to the questions hardware founders
                actually ask.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { href: "/guides/how-to-find-a-contract-manufacturer-uk", img: "/images/insights/guide-how-to-find-a-contract-manufacturer-uk.webp", title: "How to find a contract manufacturer in the UK", hook: "Tiers, shortlisting, the questions to ask and the red flags." },
                { href: "/guides/how-to-cost-a-hardware-bill-of-materials", img: "/images/insights/guide-how-to-cost-a-hardware-bill-of-materials.webp", title: "How to cost a hardware bill of materials", hook: "Unit vs volume pricing, and the costs founders always miss." },
                { href: "/guides/how-to-get-a-hardware-startup-investor-ready", img: "/images/insights/guide-how-to-get-a-hardware-startup-investor-ready.webp", title: "How to get a hardware startup investor-ready", hook: "What hardware investors actually check — and why they pass." },
                { href: "/guides/design-for-manufacture-explained", img: "/images/insights/guide-design-for-manufacture-explained.webp", title: "Design for manufacture, explained", hook: "What DFM is, why it matters early, and how it saves cost." },
                { href: "/cost/water-treatment-plant", img: "/images/site/dossier-render.webp", title: "What an industrial water-treatment plant costs to build", hook: "A worked £1.38M breakdown from a real, auditable model." },
              ].map((g) => (
                <Link key={g.href} href={g.href} className="group">
                  <Card className="h-full overflow-hidden transition-colors hover:border-international-orange/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.img}
                      alt=""
                      className="w-full aspect-[16/9] object-cover border-b border-border"
                      style={{ background: "#faf7f3" }}
                      loading="lazy"
                    />
                    <CardContent className="pt-5 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-international-orange">
                        Guide
                      </p>
                      <h3 className="font-semibold text-foreground flex items-start gap-1.5">
                        <span>{g.title}</span>
                        <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-international-orange" />
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {g.hook}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="text-center space-y-4 py-6 border-t border-border">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Building something physical?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Start with a free Design Dossier — an auditable, engineer-checked
              model of what it takes to build your idea.
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
