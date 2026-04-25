/**
 * @file example-investor-match.tsx
 *
 * @description Marketing-surface example of one fully-rendered investor match
 * card. Replaces the stat-grid in InvestorPreviewSection so a logged-out
 * visitor can see exactly what Starter buys them: why-fit reasoning, how-to-pitch
 * framing, drafted email subject and body, and source citations.
 *
 * Mirrors the in-product InvestorMatchInsightCard layout so the homepage
 * promise equals the in-product reality. The card is illustrative — labelled
 * "EXAMPLE" — but uses real names (Planet A is a public investor, citations
 * reference Project Eaden + Arsenale Bioyards from their portfolio). The
 * sample foundry is the UK pre-seed vertical-farming founder used for the
 * Phase G test output (PHASE-G-IMPLEMENTATION.md).
 *
 * @security Public — no data fetched, content is hardcoded as an example.
 */

'use client'

import Link from 'next/link'
import { ArrowRight, Mail, Quote } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AnimatedSection } from '@/components/marketing/animations'

const EXAMPLE_DRAFTED_EMAIL_SUBJECT =
  'Planet A: Vertical farming with quantifiable impact, £400K pre-orders, PCT-pending'

const EXAMPLE_DRAFTED_EMAIL_BODY = [
  'Hi Tina,',
  'We are building a vertical-farming hardware platform with a PCT-pending growth-tray geometry and a trade-secret lighting recipe. Both target the resource-efficiency questions Planet A funds against, and our in-house data is built to feed straight into a life cycle assessment.',
  'I think there is a real fit with how you backed Project Eaden and Arsenale Bioyards. Could I send a 20-minute walkthrough of our energy-per-kilogram numbers and the £400K of pre-orders we have already signed?',
] as const

export function ExampleInvestorMatch() {
  return (
    <section
      id="investors"
      className="py-12 sm:py-16 md:py-24 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-8 sm:mb-10">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Investor Intelligence
          </span>
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Find the investors who actually{' '}
            <span className="text-international-orange">fund hardware</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
            Every investor in your shortlist arrives with a why-fit paragraph,
            a how-to-pitch line, and a drafted opening email. Here is one
            example, end to end.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <Card className="max-w-3xl mx-auto overflow-hidden">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                      Planet A
                    </h3>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      Venture Capital
                    </Badge>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-international-orange/10 text-international-orange text-[10px] font-mono uppercase tracking-widest">
                      Example
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">Sector match</span>
                      {' '}AgTech, climate hardware
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      <span className="font-medium text-foreground">Stage</span>
                      {' '}Pre-seed to Series A
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      <span className="font-medium text-foreground">Cheque</span>
                      {' '}€0.5M to €5M
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-5 pb-5">
              <section>
                <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  Why Planet A would back you
                </h4>
                <p className="text-sm leading-relaxed text-foreground">
                  Planet A&apos;s in-house science team calculates life cycle
                  assessments to quantify impact, and your vertical-farming
                  startup&apos;s PCT-pending growth-tray geometry and
                  trade-secret lighting recipe target the resource-efficiency
                  questions they fund against. Portfolio peers like Project
                  Eaden and Arsenale Bioyards show they back hardware-led
                  agtech at early stages. Your pre-seed stage and £400K of
                  pre-orders sit inside their typical €0.5M to €5M initial
                  ticket band, and BRC certification underway signals a
                  scalable impact story they can underwrite.
                </p>
              </section>

              <section>
                <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  How to pitch this to them
                </h4>
                <p className="text-sm leading-relaxed text-foreground">
                  Lead with the energy-per-kilogram number their science team
                  would validate, draw a parallel to Project Eaden&apos;s
                  food-systems angle, then land on £400K of signed pre-orders
                  and the UK supermarket letters of intent as proof of
                  scalable demand.
                </p>
              </section>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full border border-international-orange/20 bg-international-orange/10 text-international-orange px-2 py-0.5 text-[11px] font-medium">
                  <Quote className="h-3 w-3" />
                  Fund decision
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 text-success px-2 py-0.5 text-[11px] font-medium">
                  <Quote className="h-3 w-3" />
                  Portfolio precedent
                </span>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Drafted email preview
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Subject
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground">
                    {EXAMPLE_DRAFTED_EMAIL_SUBJECT}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Body
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2 text-sm leading-relaxed text-foreground space-y-2">
                    {EXAMPLE_DRAFTED_EMAIL_BODY.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground italic">
                  We draft a starting point. Edit it, then send from your own inbox.
                </p>
              </div>

              <p className="text-[11px] text-muted-foreground italic border-t border-border pt-3">
                This card is illustrative. Your matches are drawn from your
                live foundry profile, scored against 7,800 investors and
                49,000 partner contacts.
              </p>
            </CardContent>
          </Card>
        </AnimatedSection>

        <AnimatedSection delay={0.2} className="text-center mt-8 sm:mt-10">
          <p className="text-foreground text-sm sm:text-base max-w-2xl mx-auto leading-relaxed mb-5">
            Every investor in your shortlist looks like this. Starter gives you
            100 of them a month for £20.
          </p>
          <Link
            href="/join"
            className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white font-bold px-8 py-3.5 rounded-lg transition-colors text-sm sm:text-base"
          >
            Start Free, See Your Matches
            <ArrowRight className="h-4 w-4" />
          </Link>
        </AnimatedSection>
      </div>
    </section>
  )
}
