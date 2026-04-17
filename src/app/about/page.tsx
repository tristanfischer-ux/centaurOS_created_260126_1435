/**
 * @file About Page
 *
 * @description Public-facing about page for Fractional Forge / ForgeOS.
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
    "Fractional Forge is building ForgeOS — the operating system for hardware companies. Learn about our mission to make manufacturing as accessible as deploying software.",
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
                Fractional Forge is building ForgeOS — the operating system for hardware startups.
              </p>
              <p>
                A software startup gets to focus on the product because companies like AWS take care of the infrastructure. Hardware doesn&apos;t have an AWS. ForgeOS is our attempt to build one — the investors, the manufacturers, the specialist expertise, the team tools, and the cash burn tracking a hardware startup needs, all in one place, from day one.
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
                    I have spent 26 years running startups — software and hardware — most recently Fischer Farms, one of the UK&apos;s larger vertical farms. Fractional Forge is essentially my wish list of all the things I could have had as a hardware startup founder over those 26 years.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    One of the main issues I&apos;ve had is that I&apos;ve spent so much time and energy (and money!) on infrastructure rather than focusing on the product. A software startup gets to focus on the product and let companies like AWS deal with the infrastructure. Hardware doesn&apos;t have an AWS. Fractional Forge is my attempt to build one.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    It&apos;s for three groups: hardware founders who need expertise across a dozen domains but can&apos;t afford full-time seniors in every role; experienced people with decades of domain expertise who want to work with startups on their own terms; and people who&apos;d love to have their own startup but don&apos;t know where to begin.
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
              Want to build with us?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Free tier, no credit card needed. Have a look and let me know how you get on.
            </p>
            <Link
              href="/join"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-international-orange text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Get started
              <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}
