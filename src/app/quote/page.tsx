import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

/**
 * @file /quote — landing page for teams who assess briefs and quote for work
 * (P1-a): estimators, contractors, engineering firms. A different buyer from
 * the founder home page — no funding language. Point outbound estimator
 * campaigns HERE, not at the founder narrative.
 */

export const metadata: Metadata = {
  title: "Quote faster than anyone — and win more",
  description:
    "If your team assesses briefs and quotes for customers, Anvil turns a project brief into a costed, engineer-checked proposal in days, not months — first-principles physics, live component pricing, and a human sign-off on every quote.",
  alternates: { canonical: "https://fractionalforge.app/quote" },
}

const PILLARS = [
  {
    title: "Days, not months",
    body: "A brief becomes a costed, engineer-checked proposal in days — faster still for work like something you've done before. You're back to the client before your competitors have finished scoping.",
  },
  {
    title: "Win the near-misses",
    body: "On most tenders the fastest credible number takes the contract. The jobs you lose by responding in week four are the margin you're leaving on the table.",
  },
  {
    title: "Right, not just fast",
    body: "Anvil works from first principles — over 200 calculation tools on open, citable physics libraries, checked against continuously-refreshed component pricing. It flags what a busy estimating team can miss, and a human signs off every quote before it goes out.",
  },
]

const DELIVERABLES = [
  "A supply-only quotation you can edit on the web and download as PDF, plus a Word copy",
  "A price schedule workbook that matches the quotation",
  "The formal Design Dossier (Excel) — every cost line with method, confidence and source",
  "Engineering drawings and STEP when the design has them",
  "A risk and open-questions register — what's assumed, what's excluded",
]

export default function QuotePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />
      <main className="flex-1 px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="mx-auto max-w-5xl space-y-16 pt-10 sm:pt-16">
          {/* Hero */}
          <section className="max-w-3xl space-y-5">
            <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
              For teams who quote
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Quote faster than anyone &mdash; and win more.
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
              If your team assesses briefs and quotes for customers &mdash; as an estimator, a
              contractor, or an engineering firm &mdash; Anvil turns a project brief into a costed,
              engineer-checked proposal in days, not months. The fastest credible quote usually wins
              the contract.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/brief"
                className="inline-flex items-center rounded-full bg-international-orange px-7 py-3 font-bold text-white hover:bg-international-orange-hover"
              >
                Send a brief &rarr;
              </Link>
              <Link
                href="/sample-package"
                className="inline-flex items-center rounded-full border border-border px-7 py-3 font-semibold hover:bg-muted"
              >
                See a real example
              </Link>
            </div>
          </section>

          {/* Pillars */}
          <section className="grid gap-6 sm:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.title} className="rounded-xl border p-6">
                <h2 className="mb-2 text-lg font-bold text-international-orange">{p.title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </section>

          {/* What lands on your desk */}
          <section className="max-w-3xl space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold">What lands on your desk</h2>
            <p className="text-muted-foreground">
              One Anvil run. The quotation sits on top of the same engine that builds the Design
              Dossier &mdash; not a second product:
            </p>
            <ul className="space-y-2.5">
              {DELIVERABLES.map((d) => (
                <li key={d} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Costs are a rigorous first pass with every number shown working &mdash; your
              estimators check and own the final figure.
            </p>
          </section>

          {/* How it works */}
          <section className="max-w-3xl space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold">How it works with your team</h2>
            <ol className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <li>
                <b className="text-foreground">1. Send the brief</b> on{' '}
                <Link href="/brief" className="underline">
                  /brief
                </Link>
                . The tender, the spec, or a short paragraph.
              </li>
              <li>
                <b className="text-foreground">2. We validate, then Anvil runs once.</b> One
                engine expands the brief, builds the dossier, and writes the quotation. Nothing
                starts until a human clicks Validate.
              </li>
              <li>
                <b className="text-foreground">3. You review the quote and the workbook.</b>{' '}
                Quotation.pdf sits on the same numbers as DOSSIER.xlsx. The figure that goes out
                is yours.
              </li>
            </ol>
            <div className="pt-2">
              <Link
                href="/contact"
                className="inline-flex items-center rounded-full bg-international-orange px-7 py-3 font-bold text-white hover:bg-international-orange-hover"
              >
                Start with one live tender &rarr;
              </Link>
            </div>
          </section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  )
}
