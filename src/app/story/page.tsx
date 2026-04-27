/**
 * @file Story Page (/story)
 *
 * @description Long-form founder letter, lifted from the homepage. The
 * homepage now ships a compressed 4-paragraph version and links here for
 * the full story. Buy-or-bounce report flagged that the original 9-paragraph
 * letter on the homepage stalled cold buyers between the killer sections
 * and the FAQ.
 *
 * Server component, simple typography matching the homepage. No CTAs other
 * than the standard MarketingFooter.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Flame } from "lucide-react"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

export const metadata: Metadata = {
  title: "The Story Behind Fractional Forge",
  description:
    "Why I built Fractional Forge. The full founder letter from Tristan Fischer, on the eighteen-month trap, the AWS-for-hardware question, and what hardware founders actually need.",
}

export default function StoryPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Lightweight nav */}
      <nav className="sticky top-0 z-40 bg-background border-b border-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-base sm:text-lg md:text-xl font-bold tracking-tight"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-international-orange">
              <Flame className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            FRACTIONAL FORGE
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-5 py-2.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md"
          >
            Start Free
          </Link>
        </div>
      </nav>

      <main className="flex-1">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
          <header className="mb-10 sm:mb-14">
            <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
              A Note from Tristan
            </span>
            <h1 className="font-playfair text-3xl sm:text-5xl md:text-6xl font-black mb-4 sm:mb-6 leading-tight">
              Why I built{" "}
              <span className="text-international-orange">Fractional Forge.</span>
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
              The full version. Twenty-six years of building hardware
              startups, and the wish list that became this product.
            </p>
          </header>

          <div className="space-y-5 text-foreground text-base sm:text-lg leading-relaxed">
            <p>
              Fractional Forge is essentially my wish list of all the things I
              could have had as a hardware startup founder over the last 26 years.
            </p>
            <p>
              One of the main issues I have had is that I have spent so much
              time and energy building, and spending money on, the
              infrastructure rather than focusing on the product. This is
              completely different to what it is like being a software
              startup, where you can focus on the product and let companies
              like AWS deal with the infrastructure issue. A software founder
              builds one thing. A hardware founder builds two.
            </p>
            <p>
              The factory itself is the biggest of those time sinks. Finding a
              location takes months. Then come the lease negotiations, and as
              a startup you can easily be asked to pay one, two, or three
              years of rent up front, which raises the obvious question of
              where that money is meant to come from. After that comes
              procuring the equipment, installing it, and hiring the people to
              run it. You can easily be twelve or eighteen months in before
              you have built anything at all.
            </p>
            <p>
              Hardware has never had an AWS equivalent. Every founder ends up
              reinventing the same wheels: finding engineers, finding
              investors, sorting out intellectual property, building a finance
              team, all pre-revenue, all without the budget for any of it.
            </p>
            <p>
              Fractional Forge is my attempt at that equivalent. Rather than
              building your own factory from scratch, the platform connects
              you directly to over 18,000 UK and European manufacturers who
              already have the building, the machinery, and the expertise. As
              you work through your product, you can see who can make what
              you are designing, and reach out to them for real advice on how
              it actually gets made.
            </p>
            <p>
              Alongside the manufacturing network, Fractional Forge brings
              together specialist support across thirteen disciplines, an
              investor database of over 7,800 firms, strategy and cash-burn
              tools, and a marketplace of experienced fractional executives,
              so the rest of the hardware founder&apos;s job sits in one place
              too.
            </p>
            <p>
              One of the less obvious things about running a hardware startup
              is just how distributed the team ends up being: a designer here,
              a fractional engineer there, a manufacturer in another country,
              a finance advisor in a third. Keeping everyone moving in the
              same direction becomes its own full-time job. Fractional Forge
              has strategy, objectives, and tasks built in, so the whole team
              knows what they are doing and why, whether they are full-time,
              fractional, or one of the specialists.
            </p>
            <p>
              It is also a genuine home for fractional executives. I know so
              many people who are real domain experts in manufacturing,
              engineering, finance, and operations who would be great for
              startup companies to have access to. Startups cannot afford a
              full range of critical full-time employees. Some experienced
              people just want to give their expertise on an ad hoc basis.
              Fractional Forge works for both.
            </p>
            <p>
              And if you have been thinking about building your own company,
              Fractional Forge is designed to take you from &quot;I have an
              idea&quot; to &quot;I know exactly what the next step is&quot;.
            </p>
            <p>Have a look and let me know how you get on.</p>
            <p className="text-muted-foreground font-semibold pt-2">
              — Tristan Fischer, Founder
            </p>
          </div>

          <div className="mt-12 sm:mt-16 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 border-t border-muted pt-10">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
            >
              Start Free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]"
            >
              Back to home <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </article>
      </main>

      <MarketingFooter />
    </div>
  )
}
