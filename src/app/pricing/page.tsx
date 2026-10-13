/**
 * @file Public "How we work" page (route: /pricing)
 *
 * @description Fixed-price engineering services, with advisory and fundraising
 * introductions available on a success-fee basis. The old self-serve tiers
 * (pricing-content.tsx) are retired from the public surface; in-app billing at
 * /settings/billing is unaffected.
 *
 * @component
 */

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

export const metadata: Metadata = {
  title: "How we work",
  description:
    "Four fixed-price engineering services, including a buildable Design Dossier delivered in a few days. Advisory and fundraising introductions are available on a success-fee basis: no raise, no fee.",
}

export default function HowWeWorkPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />

      <main className="flex-1 px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-5xl mx-auto space-y-16 sm:space-y-24">
          {/* Hero */}
          <section className="pt-8 sm:pt-12 space-y-4">
            <Badge variant="brand" size="lg">
              How we work
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
              Fixed-price engineering for hard technology projects.
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Choose from four fixed-price services, from a focused Habitat
              Draft to a complete Design Dossier with buildable engineering,
              traceable costs and a live financial model.
            </p>
          </section>

          {/* The Design Dossier */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              A Design Dossier costs £2,500
            </h2>
            <div className="space-y-4 text-lg text-muted-foreground leading-relaxed max-w-3xl">
              <p>
                Describe your idea in a short brief — a paragraph to a page. The
                Anvil engine builds your Design Dossier from open engineering
                libraries and real component prices. You receive a buildable
                design and a live Excel workbook in a few days, with every number
                traceable to a formula. Fractional Forge does not review the
                Dossier; your own engineers should check it before relying on it.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl">
              {[
                "Buildable design and a costed bill of materials",
                "True cost and a live financial model",
                "Engineering drawings and worked calculations",
                "Risk and regulatory register in a traceable Excel workbook",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-international-orange mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
            <Link
              href="/brief"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-international-orange text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Start a brief
              <ArrowRight className="w-4 h-4" />
            </Link>
          </section>

          {/* Further support */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Further support when you need it
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold text-foreground">Advisory</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Strategic advisory is available on a success-fee basis,
                    including pressure-testing the design, costs, sourcing and
                    the plan you raise on. No raise, no fee.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold text-foreground">Capital</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Fundraising introductions are available on a success-fee
                    basis, including grants and non-dilutive routes. No raise,
                    no fee.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold text-foreground">Fixed-price services</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Condition Desk, Habitat Draft, Bid Check and Design Dossier
                    each have a clear price and defined output.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* What it costs */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              What it costs
            </h2>
            <div className="space-y-4 text-lg text-muted-foreground leading-relaxed max-w-3xl">
              <p>
                Condition Desk costs £400, Habitat Draft costs £150 and Bid
                Check costs £600. Design Dossier costs £2,500 per Dossier, or
                £6,000 a month for up to three Dossiers.
              </p>
              <p>
                Advisory and fundraising introductions are available on a
                success-fee basis. No raise, no fee.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="text-center space-y-4 py-8">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Tell us what you&apos;re building
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Submit the brief form or email tristan.fischer@fractionalforge.app.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/brief"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-international-orange text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Start a brief
                <ArrowRight className="w-4 h-4" />
              </Link>

            </div>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}
