/**
 * @file Public "How we work" page (route: /pricing)
 *
 * @description Curated engagement model — not a tiered SaaS price list.
 * Fractional Forge is human-curated / expert-in-the-loop: the first Design
 * Dossier is free, and everything beyond it is scoped to the project. The old
 * self-serve tiers (pricing-content.tsx) are retired from the public surface;
 * in-app billing at /settings/billing is unaffected.
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
    "Fractional Forge is human-curated. Your first Design Dossier is free and reviewed by a senior engineer; advisory, fundraising (introducer/success-fee, no raise no fee) and build introductions are scoped to your project. No standard price list.",
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
              Start with a free Dossier. Go deeper when it&apos;s worth it.
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Fractional Forge is human-curated. There are no dashboards to sign
              up for and no monthly tiers — just experienced people doing the
              work, starting with a Design Dossier that costs you nothing.
            </p>
          </section>

          {/* Step 1 — the free Dossier */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Your first Design Dossier is free
            </h2>
            <div className="space-y-4 text-lg text-muted-foreground leading-relaxed max-w-3xl">
              <p>
                Describe your idea in a short brief — a paragraph to a page. We
                build your Design Dossier: an auditable engineering-and-costing
                model, delivered as an Excel workbook, where every number traces
                back to a formula you can check. A senior engineer reviews the
                whole thing before it reaches you, usually within a day.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl">
              {[
                "Architecture and a traceable bill-of-materials ledger",
                "Full costs, a cost waterfall and a live financial model",
                "Engineering drawings, risk and regulatory, open questions",
                "Engineering drawings, worked calculations and a built-in self-audit",
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

          {/* From there — the three pillars */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              From there, we work together
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold text-foreground">Advisory</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    We work through your Dossier together — pressure-testing the
                    design, the costs and the sourcing, and shaping the plan you
                    raise on. Scoped to your project.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold text-foreground">Capital</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Fundraising on an introducer / success-fee basis — we raise,
                    we take a success fee, and if there&apos;s no raise there&apos;s no
                    fee. Plus grants and non-dilutive routes.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold text-foreground">Build</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Introductions to a curated network of Europe&apos;s best design,
                    engineering and prototype-manufacturing partners — so you
                    don&apos;t build a factory to ship a product.
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
                We take on a small number of engagements each quarter — so the
                first Design Dossier is also how we get to know your project.
                There&apos;s no standard price list, because no two hardware
                companies are the same. Everything beyond the free Dossier —
                advisory, the raise, build introductions — is scoped to your
                project and agreed up front. Fundraising is introducer /
                success-fee: no raise, no fee.
              </p>
              <p>
                A self-serve version is on the way. For now, every Dossier is
                hand-built and engineer-checked — which is the point.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="text-center space-y-4 py-8">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Tell us what you&apos;re building
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Your first Design Dossier is free, and I&apos;ll send it within a day.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/brief"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-international-orange text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Start a brief
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://calendly.com/tristan-fischer-wjlf/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors"
              >
                Book a call
              </a>
            </div>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}
