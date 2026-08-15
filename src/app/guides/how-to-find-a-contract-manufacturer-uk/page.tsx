/**
 * @file How-to guide: finding a contract manufacturer in the UK (route: /guides/how-to-find-a-contract-manufacturer-uk)
 *
 * @description Practical guidance for hardware founders on shortlisting and
 * engaging a UK contract manufacturer. Article + FAQPage JSON-LD for rich
 * results and AI answer engines. Server component — exports metadata for SEO.
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
  title: "How to find a contract manufacturer in the UK",
  description:
    "A practical guide to finding and shortlisting a UK contract manufacturer — the tiers, how to match by capability, the questions to ask, the red flags, and when to engage.",
  alternates: {
    canonical: "https://fractionalforge.app/guides/how-to-find-a-contract-manufacturer-uk",
  },
}

const TIERS = [
  {
    name: "Design house / product development consultancy",
    covers:
      "Takes a concept and turns it into a manufacturable design. Good early, before you have drawings. They rarely make in volume — expect to move the design elsewhere for production.",
  },
  {
    name: "New-product-introduction (NPI) specialist",
    covers:
      "Bridges design and volume. Builds prototypes, first articles and small pilot runs, shakes out the process, and writes the work instructions. The right partner when you have a design but no proven production line.",
  },
  {
    name: "Mid-volume electronics manufacturing services (EMS)",
    covers:
      "Populates boards, assembles enclosures and ships finished units in the hundreds to tens of thousands. Strong on repeatability and test. Ask about their comfort band — a house tuned for 10,000 units a month will not love your 200.",
  },
  {
    name: "Complex-integration / systems house",
    covers:
      "Handles multi-discipline builds — electronics plus mechanical, fluidics, optics or high-voltage — with regulatory and traceability demands. Slower and dearer, but the only sensible route for a regulated or safety-critical product.",
  },
]

const FAQ = [
  {
    q: "How do I find a contract manufacturer in the UK?",
    a: "Start by naming the tier you actually need — design house, new-product-introduction specialist, mid-volume electronics manufacturing services, or a complex-integration house — because they are different businesses. Then shortlist three or four by capability match: process fit, typical volume band, sector experience and certifications. Use trade bodies (Make UK, the High Value Manufacturing Catapult network), sector directories and referrals from other founders. Visit before you commit, and never single-source your first production run.",
  },
  {
    q: "How many manufacturers should I approach?",
    a: "Shortlist three or four for quotes and one or two as a genuine second source. Fewer than three and you have no benchmark on price or lead time; many more than four and you drown in requests for quotation that each need a full drawing pack, a bill of materials and a clear specification to answer honestly. Give every one the same pack so the quotes are comparable.",
  },
  {
    q: "What is the difference between a contract manufacturer and an EMS provider?",
    a: "Electronics manufacturing services (EMS) is a type of contract manufacturing focused on printed circuit board assembly, box build and test. 'Contract manufacturer' is the broader term and can include machining, moulding, fabrication and full-system integration. If your product is mostly electronic, you want an EMS partner; if it mixes disciplines, you want a systems house that can own the whole build.",
  },
  {
    q: "When should I engage a manufacturer?",
    a: "Sooner than most founders think. Bring a manufacturing partner in while the design is still movable — during new-product-introduction — so their process knowledge shapes the design before it is frozen. Engaging after the design is locked means paying to redesign for manufacture, or accepting a higher unit cost for the life of the product.",
  },
]

export default function FindContractManufacturerGuide() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "How to find a contract manufacturer in the UK",
        description:
          "A practical guide to finding and shortlisting a UK contract manufacturer — the tiers, how to match by capability, the questions to ask, the red flags, and when to engage.",
        author: { "@id": "https://fractionalforge.app/#tristan-fischer" },
        publisher: { "@id": "https://fractionalforge.app/#organization" },
        mainEntityOfPage:
          "https://fractionalforge.app/guides/how-to-find-a-contract-manufacturer-uk",
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
          <div className="pt-8 sm:pt-12"><Breadcrumbs trail={[{ name: "Guides" }, { name: "How to find a contract manufacturer (UK)", href: "/guides/how-to-find-a-contract-manufacturer-uk" }]} /></div>
          <section className="space-y-5">
            <Badge variant="brand" size="lg">
              How-to guide
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
              How to find a contract manufacturer in the UK
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              You have a working prototype and a search bar. Somewhere on the other
              side of it is the firm that will set your unit cost, your lead time and
              your quality for years — if you can tell it apart from the several
              hundred that merely look the part. This is how to shortlist the right
              kind of partner, what to ask, and when to bring them in.
            </p>
          </section>

          {/* Header illustration */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/insights/guide-how-to-find-a-contract-manufacturer-uk.webp" alt="" className="w-full aspect-[16/9] object-cover rounded-2xl border border-border bg-[#faf7f3]" loading="lazy" />

          {/* Historical anchor */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Someone else has been making your product for five hundred years
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                The idea of paying a specialist to build your thing is not a
                twenty-first-century convenience. By the sixteenth century the
                Venetian Arsenal — a state shipyard covering some sixty acres and
                employing thousands — could fit out a war galley in a single day,
                floating each hull past a line of stations where standardised,
                pre-made parts were fitted in sequence. Visiting dignitaries were
                treated to the spectacle as after-dinner entertainment. It was
                contract manufacturing, moving assembly line and just-in-time
                sourcing, three centuries before Henry Ford was born.
              </p>
              <p>
                Two hundred years later Adam Smith explained why it worked. In the
                opening pages of <em>The Wealth of Nations</em> (1776) he watched a
                pin factory: a single untrained workman could &quot;scarce&quot;
                make twenty pins a day, but ten men who split the job into eighteen
                distinct operations turned out upwards of forty-eight thousand.
                Specialisation, not effort, was the multiplier. That is the whole
                reason contract manufacturers exist — and the whole reason choosing
                one is harder than it looks. A firm optimised for one operation is,
                by design, poorly suited to another. Your task is to find the
                specialist whose specialism is <em>your</em> product, not merely a
                factory that will say yes.
              </p>
            </div>
          </section>

          {/* Tiers */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              First, work out which tier you need
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              &quot;Contract manufacturer&quot; covers four quite different kinds of
              business, and the division of labour Smith admired now runs between
              firms as much as within them. Approaching the wrong tier wastes
              everyone&apos;s time — a volume line will not nurse a prototype, and a
              design consultancy will not ship you ten thousand units. Name the tier
              before you name the company.
            </p>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {TIERS.map((t) => (
                    <div key={t.name} className="px-5 py-4">
                      <p className="font-semibold text-foreground">{t.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        {t.covers}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Shortlist by capability */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Shortlist by capability, not by website
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              Most manufacturer websites claim to do everything, which is a polite
              way of saying they specialise in nothing you can verify from the sofa.
              Ignore the copy and match against the things that actually determine
              whether they can build your product well:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
              {[
                "Process fit — do they run the specific processes your product needs (surface-mount, machining, injection moulding, potting, high-voltage)?",
                "Volume band — is your quantity comfortably inside their normal run size, not at the awkward edge of it?",
                "Sector experience — have they built products under the same regulations you face (medical, automotive, industrial, defence)?",
                "Certifications — ISO 9001 as a floor, plus sector marks such as ISO 13485 for medical or IATF 16949 for automotive.",
                "Test capability — can they build the test rigs and functional tests your product needs, or is that on you?",
                "Supply-chain reach — do they buy the parts on your bill of materials already, or is every line a new sourcing exercise?",
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
              A clean, costed design pack makes this far easier for both sides. If a
              manufacturer can see your bill of materials, your quantities and your
              test requirements up front, their quote is faster and closer to real. A
              Fractional Forge Design Dossier is exactly that pack — an auditable
              model of the build you can hand to three houses and get comparable
              numbers back, rather than three quotes that each assumed something
              different.
            </p>
          </section>

          {/* Questions to ask */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Questions worth asking on the first call
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                Ask <strong className="text-foreground">what they will not
                quote</strong> — an honest house tells you where a job is outside
                their comfort, and the honesty is the point. Ask{" "}
                <strong className="text-foreground">who owns the tooling</strong> if
                you fund it, because tooling you paid for but cannot move is a lock-in
                you never agreed to. Ask{" "}
                <strong className="text-foreground">how they handle a part going
                end-of-life</strong>, because on a multi-year product it will happen,
                and you want to know whether they redesign, buy ahead, or simply
                stop.
              </p>
              <p>
                Ask <strong className="text-foreground">what their first-article and
                test process looks like</strong>, how they log traceability, and what
                the minimum order quantity and lead time really are once the queue is
                honest. Finally, ask to{" "}
                <strong className="text-foreground">speak to a customer at your
                volume</strong> — a good manufacturer will connect you; a reluctant
                one has just answered a different question.
              </p>
            </div>
          </section>

          {/* Red flags */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Red flags
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                A quote that arrives with no questions asked is a warning, not a
                convenience — it means they have not engaged with your design. Be
                wary of a house that will not name its typical volume band, that is
                vague about who holds the tooling, or that quotes a unit price without
                seeing a bill of materials. A price far below the others is rarely a
                bargain; it usually means something has been left out — assembly
                labour, test, or the tooling amortisation — and it will reappear later
                as a change note, with interest.
              </p>
              <p>
                Single-sourcing your first production run is its own red flag. Even a
                strong partner has a bad quarter, and a second source keeps you honest
                on price and gives you somewhere to go when the first line is full.
              </p>
            </div>
          </section>

          {/* When to engage */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              When to engage — and why proximity is worth paying for
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                Bring a manufacturing partner in while the design can still change.
                The cheapest time to design for manufacture is before the drawings
                are frozen; the most expensive is after tooling is cut. Engaging
                during new-product-introduction lets their process knowledge shape
                part choices, tolerances and assembly order while those decisions are
                still free to make.
              </p>
              <p>
                There is also a plainer commercial case for building nearer to home
                than the last two decades made fashionable. A manufacturer a train
                ride away is one you can visit when the first article is wrong; the
                freight is cheaper, the duty simpler, the lead time shorter, and the
                supply chain has fewer places to break — a lesson the shocks of the
                early 2020s taught expensively. None of that is patriotism. It is
                risk, cash and time, which are the only three things a hardware
                business ever really spends.
              </p>
              <p>
                You do not need a finished product to start the conversation. You need
                a clear specification, a bill of materials, a realistic volume and an
                honest view of your cost target. With those, a good manufacturer can
                tell you very quickly whether they are the right tier for you — which
                is, in the end, the only question that matters.
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
              Need a pack to hand to manufacturers?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Describe your product in a short brief and get a Design Dossier — an
              auditable, engineer-checked model with the bill of materials,
              quantities and costs a manufacturer needs to quote. Your first one is
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
