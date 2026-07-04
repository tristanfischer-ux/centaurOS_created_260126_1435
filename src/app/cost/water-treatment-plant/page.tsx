/**
 * @file Cost-breakdown page: industrial water-treatment plant (route: /cost/water-treatment-plant)
 *
 * @description The first "what does it cost to build X" page — the template for
 * the content/SEO/GEO engine. Numbers are a REAL, engineer-checked Design
 * Dossier run, sanitised of any client identifiers (see the public example
 * workbook). Honest worked example, not a universal price. Article + FAQPage
 * JSON-LD for rich results + AI answer-engines.
 *
 * Server component — exports metadata for SEO.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Download, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

const EXAMPLE_XLSX =
  "https://jyarhvinengfyrwgtskq.supabase.co/storage/v1/object/public/dossiers/example-water-treatment-dossier.xlsx"

export const metadata: Metadata = {
  title: "What does an industrial water-treatment plant cost to build?",
  description:
    "A worked cost breakdown for an industrial water-handling, purification and fertigation plant — around £1.36M installed. Every number from a real, engineer-checked Design Dossier you can download and check.",
  alternates: { canonical: "https://fractionalforge.app/cost/water-treatment-plant" },
}

const SECTIONS = [
  {
    name: "Water purification",
    covers: "Reverse osmosis, ultrafiltration, granular-activated-carbon and softening trains",
    cost: "£175,000",
  },
  {
    name: "Controls & instrumentation",
    covers: "SCADA / process-control system plus plant-wide field instrumentation and cabling",
    cost: "£239,000",
  },
  {
    name: "Storage & tanks",
    covers: "Galvanised process and buffer tanks with level instrumentation",
    cost: "£77,000",
  },
  {
    name: "Process equipment, dosing & distribution",
    covers: "Fertigation dosing, flood-and-drain (ebb/flow) distribution, pumps, pipework, drain-water recovery and the hand-watering ring main",
    cost: "≈ £870,000",
  },
]

const FAQ = [
  {
    q: "How much does an industrial water-treatment plant cost to build?",
    a: "For this worked example — a water-handling, purification and fertigation plant supplying a large indoor cultivation facility — the installed cost is around £1.36 million. The single biggest cost centres are the controls and instrumentation (~£239k) and the purification train (~£175k). Your figure depends on flow rate, water quality, the treatment steps you need and how much of the plant is duplicated for resilience.",
  },
  {
    q: "What's included in that number?",
    a: "The full water system: purification (reverse osmosis, ultrafiltration, activated-carbon and softening), storage and tanks, the fertigation dosing, the ebb/flow distribution network, drain-water recovery, a hand-watering ring main, pumps and pipework, and the SCADA/process-control system with plant-wide instrumentation. It excludes the grow-lighting, the climate/HVAC hardware, the cultivation racking and the building — those are supplied by others and out of scope.",
  },
  {
    q: "How accurate are these numbers?",
    a: "They come from a real Design Dossier built by our engine and reviewed by a senior engineer — an auditable Excel model where every cost traces from the inputs and assumptions, through the calculations and quantities, into a bill-of-materials ledger and a cost waterfall. They are indicative and scoped to this specific plant, not a universal price. You can download the workbook and check every figure yourself.",
  },
  {
    q: "Can I see the full model?",
    a: "Yes. The complete, sanitised example workbook is free to download below — open it and change an assumption (flow, energy price, project life) to watch the costs and the financial model recompute.",
  },
]

export default function WaterTreatmentCostPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "What does an industrial water-treatment plant cost to build?",
        description:
          "A worked cost breakdown for an industrial water-handling, purification and fertigation plant — around £1.36M installed — from a real, engineer-checked Design Dossier.",
        author: { "@id": "https://fractionalforge.app/#tristan-fischer" },
        publisher: { "@id": "https://fractionalforge.app/#organization" },
        mainEntityOfPage: "https://fractionalforge.app/cost/water-treatment-plant",
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
          <section className="pt-8 sm:pt-12 space-y-5">
            <Badge variant="brand" size="lg">
              Cost guide
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
              What does an industrial water-treatment plant cost to build?
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              A worked breakdown from a real, engineer-checked Design Dossier — an
              industrial water-handling, purification and fertigation plant
              supplying a large indoor cultivation facility.
            </p>
            <div className="flex flex-wrap items-baseline gap-3 pt-2">
              <span className="text-4xl sm:text-5xl font-bold text-international-orange tabular-nums">
                ≈ £1.36M
              </span>
              <span className="text-muted-foreground">installed, for this example plant</span>
            </div>
          </section>

          {/* Real dossier visuals */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <figure className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/site/dossier-render.webp"
                alt="Photoreal isometric render of the water-treatment plant"
                className="w-full rounded-xl border border-border shadow-sm"
                loading="lazy"
              />
              <figcaption className="mt-2 text-xs text-muted-foreground text-center">
                The plant, built from the same model as the costs
              </figcaption>
            </figure>
            <figure className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/site/dossier-exec.webp"
                alt="The Design Dossier's Executive Summary tab — 45 cubic metres per hour, £1,360,613 installed, ship verdict"
                className="w-full rounded-xl border border-border shadow-sm bg-white"
                loading="lazy"
              />
              <figcaption className="mt-2 text-xs text-muted-foreground text-center">
                The dossier's own Executive Summary tab
              </figcaption>
            </figure>
          </section>

          {/* Breakdown table */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Where the money goes
            </h2>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {SECTIONS.map((s) => (
                    <div
                      key={s.name}
                      className="flex items-start justify-between gap-4 px-5 py-4"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{s.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                          {s.covers}
                        </p>
                      </div>
                      <p className="font-semibold text-foreground tabular-nums whitespace-nowrap flex-shrink-0">
                        {s.cost}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center gap-4 px-5 py-4 bg-muted/40">
                    <p className="flex-1 font-bold text-foreground">Total installed</p>
                    <p className="font-bold text-international-orange tabular-nums text-lg">
                      ≈ £1.36M
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground">
              Excludes the grow-lighting, climate/HVAC hardware, cultivation racking
              and the building — supplied by others and out of scope for the water
              plant.
            </p>
          </section>

          {/* How the number is built */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              How the number is built — and how to check it
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              This isn&apos;t a rule-of-thumb. Every figure traces through an
              auditable model:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
              {[
                "Inputs & assumptions (flow, water quality, hours, energy price)",
                "First-principles calculations and quantities",
                "A bill-of-materials ledger with real part numbers",
                "A cost waterfall and a live financial model",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-international-orange mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground text-sm">{item}</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              A senior engineer reviews the whole workbook before it&apos;s used.
              Download the sanitised example and change an assumption to watch the
              costs recompute.
            </p>
            <a
              href={EXAMPLE_XLSX}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" />
              Download the example workbook (Excel)
            </a>
          </section>

          {/* What drives the cost */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              What drives the cost
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                Two things dominate. First, <strong className="text-foreground">controls and
                instrumentation</strong> — a proper SCADA system with plant-wide
                sensing is often underestimated, and here it&apos;s the single
                largest line. Second, the <strong className="text-foreground">purification
                train</strong>: how clean the water has to be, and how many
                treatment steps that takes, moves the number more than almost
                anything else.
              </p>
              <p>
                Because the plant is modular — built from repeated skids, tanks and
                pumps — capital scales close to linearly. That makes it
                de-riskable: you can prove a small version and replicate it, rather
                than betting on one big monolithic build.
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
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="text-center space-y-4 py-6 border-t border-border">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Costing something you want to build?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Describe your idea in a short brief and get your own Design Dossier —
              an auditable, engineer-checked model of what it takes to build it.
              Your first one is free.
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
