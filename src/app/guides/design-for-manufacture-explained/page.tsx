/**
 * @file How-to guide: design for manufacture explained (route: /guides/design-for-manufacture-explained)
 *
 * @description Plain explanation of design for manufacture — what it is, why it
 * matters early, the key principles, and how it saves cost. Article + FAQPage
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

export const metadata: Metadata = {
  title: "Design for manufacture, explained",
  description:
    "A plain explanation of design for manufacture — what it is, why it matters early, the key principles like part-count reduction and standard parts, and how it saves cost.",
  alternates: {
    canonical:
      "https://fractionalforge.app/guides/design-for-manufacture-explained",
  },
}

const PRINCIPLES = [
  {
    name: "Reduce the part count",
    covers:
      "Every part is bought, stocked, inspected, handled and assembled. Fewer parts means fewer of each of those costs and fewer things to go wrong. Combining two parts into one moulding, or designing a part out entirely, is often the single biggest saving available.",
  },
  {
    name: "Use standard parts",
    covers:
      "A standard fastener, connector or bearing is cheaper, available from several suppliers, and carries no tooling cost. A custom part means a mould or a machining setup and a single source. Reach for the catalogue before the custom drawing.",
  },
  {
    name: "Loosen tolerances where you can",
    covers:
      "Tight tolerances cost money — in tooling, in slower machining, in inspection and in scrap. Specify precision only where the function truly needs it, and let everything else run to a comfortable, cheaper band.",
  },
  {
    name: "Match the process to the volume",
    covers:
      "3D printing and machining suit low volumes; injection moulding and casting suit high ones because tooling amortises. Choosing the process before the geometry is fixed lets you design a part the chosen process makes cheaply.",
  },
  {
    name: "Design for easy assembly",
    covers:
      "Parts that only fit one way, self-locate, and stack in one direction cut assembly time and error. Design out the awkward reach, the blind fastener and the part that goes in upside down.",
  },
]

const FAQ = [
  {
    q: "What is design for manufacture?",
    a: "Design for manufacture (DFM) is the practice of designing a product so that it is straightforward and cheap to make repeatably, not just so that it works. It means shaping parts to suit the chosen production process, reducing the number of parts, favouring standard components, and specifying only the precision the function needs. The aim is a design that is as easy to build reliably as it is to build once.",
  },
  {
    q: "Why does design for manufacture matter early?",
    a: "Because the cost of a product is largely locked in by its design, and most of that is decided in the first design decisions. Changing a part choice on a drawing is free; changing it after tooling is cut is expensive; changing it after production has started is painful. Applying design for manufacture while the design can still move captures the saving cheaply — leaving it until later means either paying to redesign or accepting a higher unit cost for the life of the product.",
  },
  {
    q: "What are the key principles of design for manufacture?",
    a: "Reduce the part count, favour standard off-the-shelf parts over custom ones, loosen tolerances everywhere the function does not need precision, choose a production process that suits your volume and then design the part to suit it, and make the product easy and unambiguous to assemble. Each principle removes cost, risk or both, and together they compound.",
  },
  {
    q: "How does design for manufacture save money?",
    a: "It attacks cost on every front at once: fewer parts to buy and handle, standard parts with no tooling and multiple suppliers, looser tolerances that cut machining time and scrap, a process matched to the volume so tooling is not wasted, and faster assembly with fewer errors. Because these savings apply to every unit for the life of the product, a modest improvement per unit becomes a large number at volume.",
  },
]

export default function DesignForManufactureGuide() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "Design for manufacture, explained",
        description:
          "A plain explanation of design for manufacture — what it is, why it matters early, the key principles, and how it saves cost.",
        author: { "@id": "https://fractionalforge.app/#tristan-fischer" },
        publisher: { "@id": "https://fractionalforge.app/#organization" },
        mainEntityOfPage:
          "https://fractionalforge.app/guides/design-for-manufacture-explained",
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
              Design for manufacture, explained
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Design for manufacture is the difference between a product that works
              and a product that can be built cheaply, again and again, without drama.
              It is also where most of a product&apos;s cost is quietly decided, long
              before anyone orders a single part. Here is what it is, why it pays to
              think about it early, and the principles that do the work.
            </p>
          </section>

          {/* Historical anchor */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              The gunsmith who took a musket lock from a heap
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                In 1785 the American minister to France, Thomas Jefferson, watched a
                Parisian gunsmith named Honoré Blanc do something that ought to have
                been dull and was in fact revolutionary. Blanc had made the parts of
                his musket locks so uniform that, as Jefferson wrote home to John Jay,
                they could be &quot;taken promiscuously from a heap&quot; and
                assembled into a working lock at random. No filing, no fitting, no
                skilled hand coaxing this piece to marry that one. Any part fitted any
                assembly.
              </p>
              <p>
                It sounds like a parlour trick. It was, in fact, the beginning of mass
                production — the principle that would later be called the American
                system of manufactures and would build everything from Springfield
                rifles to the Model T. And the insight underneath it is precisely
                design for manufacture: Blanc did not make his parts interchangeable by
                working harder at assembly. He made them interchangeable by{" "}
                <em>designing</em> them to a controlled tolerance, so the difficulty
                was solved on the drawing board rather than at the bench. That is the
                whole idea, and it is more than two centuries old. A prototype needs a
                clever hand. A product needs to work without one.
              </p>
            </div>
          </section>

          {/* What it is */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              What design for manufacture is
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                Design for manufacture — often shortened to the letters D, F and M —
                is the practice of designing a product so that it is easy and cheap to
                make repeatably, not merely so that it functions. A prototype only has
                to work once, on a bench, built by the person who designed it. A
                product has to be built by someone else, to the same standard,
                thousands of times, on a line. Those are different problems, and design
                for manufacture is how you solve the second one on purpose rather than
                by accident — the difference between Blanc&apos;s heap and a skilled
                fitter working late.
              </p>
              <p>
                In practice it means shaping every part to suit the process that will
                make it, choosing components a factory can actually buy and handle, and
                specifying precision only where the function needs it. It is not a
                phase that happens after design. It is a way of designing.
              </p>
            </div>
          </section>

          {/* Why early */}
          <section className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Why it matters early
            </h2>
            <div className="space-y-4 text-muted-foreground max-w-2xl leading-relaxed">
              <p>
                A product&apos;s cost is largely locked in by its design, and most of
                that is settled in the earliest decisions — the part choices, the
                materials, the way things fit together. Those decisions are nearly free
                to change on a drawing. They become expensive once tooling is cut, and
                painful once production has started and every change ripples through
                work instructions, inventory and validation.
              </p>
              <p>
                So the value of design for manufacture is highest at the start and
                decays as the design freezes. Applied early, it costs an hour of
                thought; applied late, it costs a redesign, or a higher unit price you
                pay on every unit for the life of the product. This is the whole
                argument for bringing a manufacturing view in while the design can
                still move — and the reason Blanc worked on the tolerance, not the
                assembly line.
              </p>
            </div>
          </section>

          {/* Principles */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              The principles that do the work
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              Design for manufacture is not a mystery. A handful of principles deliver
              most of the benefit, and they reinforce each other:
            </p>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {PRINCIPLES.map((p) => (
                    <div key={p.name} className="px-5 py-4">
                      <p className="font-semibold text-foreground">{p.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        {p.covers}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* How it saves cost */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              How it saves cost
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              The savings are not one dramatic cut; they are many small ones that apply
              to every unit forever:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
              {[
                "Fewer parts to buy, stock, inspect and assemble",
                "Standard parts with no tooling cost and more than one supplier",
                "Looser tolerances that cut machining time, inspection and scrap",
                "A process matched to volume, so tooling spend is never wasted",
                "Faster, less error-prone assembly with lower labour per unit",
                "Fewer failures in the field, and lower warranty cost",
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
              Because each saving repeats on every unit, a few pounds shaved per unit
              becomes a serious number at volume — and it lands straight in your gross
              margin. This is why interchangeable parts did not merely make muskets
              tidier; they made an industry. Seeing where those pounds sit is easier
              with a costed model in front of you: a Fractional Forge Design Dossier
              lays out the bill of materials and the landed unit cost so you can spot
              the part-count, tolerance and process savings worth chasing. Your first
              one is free — though the principles above will improve almost any design
              on their own.
            </p>
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
              Want to see where the cost sits?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Describe your product in a short brief and get a Design Dossier — an
              auditable, engineer-checked model with the bill of materials and landed
              unit cost, so the design-for-manufacture savings are easy to find. Your
              first one is free.
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
