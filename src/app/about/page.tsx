/**
 * @file About Page
 *
 * @description Public-facing about page for Fractional Forge.
 * Includes mission statement, founder bio, company info, and CTA.
 * Server component — exports metadata for SEO.
 */

import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Linkedin,
  MapPin,
  Building2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

export const metadata: Metadata = {
  title: "About",
  description:
    "Fractional Forge helps deep-tech and hardware founders get funded and built — strategy, capital, and a curated network of Europe's best engineering and manufacturing partners. Every Design Dossier is reviewed by a senior engineer.",
}

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />

      <main className="flex-1 px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-5xl mx-auto space-y-16 sm:space-y-24">
          {/* Hero */}
          <section className="pt-8 sm:pt-12 space-y-4">
            <Badge variant="brand" size="lg">
              About Us
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
              About Fractional Forge
            </h1>
          </section>

          {/* Mission */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Our Mission
            </h2>
            <div className="space-y-4 text-lg text-muted-foreground leading-relaxed max-w-3xl">
              <p className="text-xl sm:text-2xl font-medium text-foreground">
                We are building the AWS for atoms.
              </p>
              <p>
                Software founders rent infrastructure on AWS and focus on product. Hardware founders have no equivalent — they&apos;re expected to build factories, source suppliers and navigate procurement alone. Fractional Forge provides the missing layer: strategy and commercialisation, starting with a first-principles Design Dossier; capital, through fundraising and grants on an introducer/success-fee basis; and build, via a curated network of Europe&apos;s best engineering firms and a fractional bench of senior engineers. Every dossier is reviewed by a senior engineer before the founder sees it.
              </p>
            </div>
          </section>

          {/* Founder */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Founder
            </h2>
            <Card>
              <CardContent className="flex flex-col sm:flex-row items-start gap-6 pt-6">
                {/* Avatar placeholder — initials circle matching UserAvatar pattern */}
                <div className="flex-shrink-0 h-20 w-20 rounded-full bg-international-orange/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-international-orange">
                    TF
                  </span>
                </div>
                <div className="space-y-3">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">
                      Tristan Fischer
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Founder &amp; CEO
                    </p>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    I&apos;ve spent 25 years founding, financing and scaling capital-intensive technology businesses across solar, wind, tidal, batteries, vertical farming and carbon capture. Along the way I&apos;ve raised around £200 million across my own and advised companies, done project finance at Citigroup and corporate venture capital at Shell Technology Ventures, taken a company public on AIM, and spent a decade building Fischer Farms into one of the world&apos;s largest vertical farms.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    Software founders rent infrastructure from AWS so they can focus on shipping code. Hardware has no equivalent — you&apos;re expected to build the factory yourself. I&apos;m building one.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    If you&apos;re a deep-tech or hardware founder, describe your idea and we&apos;ll build your Design Dossier — an auditable engineering-and-costing model where every number traces back to a formula you can check, reviewed by a senior engineer before it reaches you. From there we work together on advisory, capital and build. No self-serve dashboards — just experienced people doing the work.
                  </p>
                  <a
                    href="https://linkedin.com/in/tristanfischer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-international-orange hover:underline transition-colors"
                  >
                    <Linkedin className="w-4 h-4" />
                    LinkedIn
                  </a>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Company Info */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Company
            </h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Fractional Forge Ltd
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Company number: 17031671
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-foreground">London, United Kingdom</p>
                    <p className="text-sm text-muted-foreground">
                      Registered in England and Wales
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* CTA */}
          <section className="text-center space-y-4 py-8">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Start your Design Dossier
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Describe your idea in a short brief — your first Design Dossier is free, and I&apos;ll send it within a day.
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
