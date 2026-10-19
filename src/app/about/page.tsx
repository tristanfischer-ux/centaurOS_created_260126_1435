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
    "Fractional Forge provides fixed-price engineering services for hard-technology founders, including buildable, costed Design Dossiers delivered in a few days.",
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
                Hard technology should be easier to assess, design and finance.
              </p>
              <p>
                Fractional Forge offers four fixed-price services: Condition Desk (£400), Habitat Draft (£150), Bid Check (£600) and Design Dossier (£2,500 per Dossier, or £6,000 a month for up to three). A Design Dossier provides a buildable design, costed bill of materials, true cost and financial model, engineering drawings, worked calculations, and a risk and regulatory register. Anvil builds it from open engineering libraries and real component prices in a live Excel workbook where every number is a traceable formula. It is delivered in a few days and is not reviewed by Fractional Forge or any external engineer, so the client&apos;s own engineers should check it. Advisory and fundraising introductions are also available on a success-fee basis: no raise, no fee.
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
                <picture>
                  <source type="image/avif" srcSet="/images/site/tristan-160w.avif" />
                  <source type="image/webp" srcSet="/images/site/tristan-160w.webp" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/site/tristan-160w.jpg"
                    alt="Tristan Fischer, Founder of Fractional Forge"
                    className="flex-shrink-0 h-20 w-20 rounded-full object-cover"
                    width={80}
                    height={80}
                  />
                </picture>
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
                    I&apos;m chief executive or board director of 14 companies, almost all in hard technology. I&apos;ve built three greenfield industrial sites, including Fischer Farms&apos; 25,000 m² automated factory. I&apos;ve raised around £200 million, worked in project finance at Citigroup and at Shell Technology Ventures, and taken a company public on AIM.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    Hard-technology founders need clear engineering, cost and commercial information before committing capital. Fractional Forge provides that information quickly and in a form their teams can inspect and check.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    If you&apos;re a deep-tech or hardware founder, submit a brief for a Design Dossier. Anvil produces a buildable design and an auditable engineering, costing and financial model in a live Excel workbook, with every number linked to a traceable formula. Fractional Forge does not review the Dossier, so your own engineers should check it. Advisory and fundraising introductions remain available on a success-fee basis, with no fee if no funds are raised.
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
              Describe your idea in a short brief. A Design Dossier costs £2,500 and is delivered in a few days.
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
