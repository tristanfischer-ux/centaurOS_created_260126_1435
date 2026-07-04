/**
 * @file How-to guide: costing a hardware bill of materials (route: /guides/how-to-cost-a-hardware-bill-of-materials)
 *
 * @description Practical guidance for founders on building a bill of materials
 * that costs honestly at volume. Article + FAQPage JSON-LD for rich results and
 * AI answer engines. Server component — exports metadata for SEO.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

export const metadata: Metadata = {
  title: "How to cost a hardware bill of materials",
  description:
    "A practical guide to costing a hardware bill of materials — structure, unit vs volume pricing at 1k / 10k / 100k, the costs founders miss, and how to make the model auditable.",
  alternates: {
    canonical:
      "https://fractionalforge.app/guides/how-to-cost-a-hardware-bill-of-materials",
  },
}

const MISSED = [
  {
    name: "Assembly labour",
    covers:
      "The minutes it takes a person or a line to build one unit, times a loaded labour rate. On a fiddly product this rivals the parts cost.",
  },
  {
    name: "Test and inspection",
    covers:
      "Functional test, calibration, burn-in and the scrap rate for units that fail. Test time is real cost and rarely appears on a parts list.",
  },
  {
    name: "Tooling and non-recurring engineering (NRE)",
    covers:
      "Moulds, jigs, fixtures, test rigs and the one-off engineering to set up production. Spread across the run, they add pounds per unit early on.",
  },
  {
    name: "Logistics, duty and packaging",
    covers:
      "Freight, import duty, warehousing and the box the product ships in. A part that is cheap ex-works can arrive dear.",
  },
  {
    name: "Yield and scrap",
    covers:
      "Not every build passes. A 95% yield means you buy parts for 100 units to ship 95 — that loss is a real line in the true unit cost.",
  },
  {
    name: "The margin stack",
    covers:
      "The manufacturer's margin, the distributor's margin and your own. Each is applied in turn, so they compound rather than add.",
  },
]

const FAQ = [
  {
    q: "How do I cost a hardware bill of materials?",
    a: "List every part — components, sub-assemblies, fasteners, consumables — with quantity per unit and a real quoted price at your target volume. Then add the costs a parts list leaves out: assembly labour, test, tooling and non-recurring engineering spread over the run, logistics and duty, and the yield loss from units that fail. Finally apply the margin stack. The parts alone are usually 40 to 60 per cent of the true landed unit cost, so a bill of materials that stops at the parts is optimistic by a wide margin.",
  },
  {
    q: "Why does the price change at 1k, 10k and 100k units?",
    a: "Component prices step down at published quantity breaks, tooling amortises across more units so its per-unit share falls, and assembly gets faster and more automated as volume justifies the setup. The effect is large: a part list that costs one figure at a thousand units can drop by a third or more at a hundred thousand. Always cost at the volume you will actually order, not a round number that flatters the model.",
  },
  {
    q: "What do founders most often leave out?",
    a: "Assembly labour, test time, tooling amortisation, logistics and duty, yield loss, and the compounding margin stack. Each is invisible on a spreadsheet of part prices, and together they routinely double the number a founder first quotes. The second most common error is costing at a volume you will not hit for years, which makes the early economics look far better than they will be.",
  },
  {
    q: "How do I make the cost model auditable?",
    a: "Every number should trace to a source — a quoted price with a date and a quantity break, a labour rate with the assumptions behind it, a tooling cost divided by a stated run size. When a figure changes, the total should recompute and the reason should be visible. A model where the total is a hand-typed number nobody can reconstruct is not auditable, and an investor or a manufacturer will treat it as a guess.",
  },
]

export default function CostBillOfMaterialsGuide() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "How to cost a hardware bill of materials",
        description:
          "A practical guide to costing a hardware bill of materials — structure, unit vs volume pricing, the costs founders miss, and how to make the model auditable.",
        author: { "@id": "https://fractionalforge.app/#tristan-fischer" },
        publisher: { "@id": "https://fractionalforge.app/#organization" },
        mainEntityOfPage:
          "https://fractionalforge.app/guides/how-to-cost-a-hardware-bill-of-materials",
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
              How-to guide
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
              How to cost a hardware bill of materials
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              A bill of materials is the spine of your unit economics, and the
              number most founders first quote is the one most likely to be wrong.
              This is how to structure a bill of materials, cost it honestly at
              volume, and account for everything a plain parts list leaves out.
            </p>
          </section>

          {/* Structure */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Start with a structured bill of materials
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              A good bill of materials is hierarchical, not a flat list. The
              finished product breaks into sub-assemblies, each sub-assembly into
              parts, and every line carries the same fields so the model can add
              itself up:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
              {[
                "A stable part reference and description",
                "Quantity per unit — including fasteners and consumables people forget",
                "A real quoted unit price, with the quantity break it applies at",
                "The supplier or manufacturer, and a second source where you have one",
                "Lead time, so the model shows where the schedule risk sits",
                "Make-or-buy — is this bought finished, or built from more parts?",
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
              Get the structure right and the rest is arithmetic. Get it wrong —
              missing lines, no quantity, prices from a single-unit web listing —
              and every number downstream inherits the error.
            </p>
          </section>

          {/* Unit vs volume pricing */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Unit price is not volume price
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                The single most common costing mistake is pricing parts at
                one-off or sample quantities and calling it the unit cost.
                Component prices step down at published quantity breaks, and the
                gap between the price of one and the price of ten thousand is
                often large. Cost your bill of materials at{" "}
                <strong className="text-foreground">the volumes you will
                actually order</strong> — typically a low pilot run, a first
                production batch, and a mature volume — and show all three.
              </p>
              <p>
                At <strong className="text-foreground">1,000 units</strong> you
                are usually paying near list, tooling is barely amortised, and
                assembly is manual. At{" "}
                <strong className="text-foreground">10,000</strong> the quantity
                breaks bite, tooling starts to disappear into the per-unit number,
                and it is worth semi-automating. At{" "}
                <strong className="text-foreground">100,000</strong> you negotiate
                directly, tooling is a rounding error per unit, and the design
                itself gets optimised for the line. The same product can cost
                markedly less at the top of that range than the bottom — which is
                exactly why you must state the volume every cost is quoted at.
              </p>
            </div>
          </section>

          {/* What founders miss */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              What a parts list leaves out
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              The parts are usually only 40 to 60 per cent of the true landed unit
              cost. The rest hides in lines a spreadsheet of component prices never
              shows:
            </p>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {MISSED.map((m) => (
                    <div key={m.name} className="px-5 py-4">
                      <p className="font-semibold text-foreground">{m.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        {m.covers}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              Add these and the honest number is often close to double the
              parts-only figure. That is not pessimism — it is the number your
              gross margin actually has to survive.
            </p>
          </section>

          {/* Auditable */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Make it auditable
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                A cost model earns trust when every figure traces to a source and
                the total recomputes when an input changes. Each part price should
                carry its quote date and quantity break; each labour and tooling
                assumption should be stated, not buried; and the landed unit cost
                should fall out of the model rather than being typed in. When you
                change a volume or a part, you should be able to watch the total
                move and see why.
              </p>
              <p>
                This is precisely what a Fractional Forge Design Dossier produces —
                an auditable Excel model where the bill of materials, the labour,
                tooling and logistics, and the margin stack all trace from your
                inputs into a single landed unit cost you can defend line by line.
                It is reviewed by a senior engineer before it is used, and your
                first one is free. But the discipline matters more than the tool:
                a bill of materials nobody can reconstruct is a guess wearing a
                spreadsheet.
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
              Want your bill of materials costed properly?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Describe your product in a short brief and get a Design Dossier — an
              auditable, engineer-checked model with a full bill of materials and a
              landed unit cost at the volumes you care about. Your first one is
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
