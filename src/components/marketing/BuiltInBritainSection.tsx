"use client"

import {
  Crown,
  Wrench,
  GraduationCap,
  Factory,
  Shield,
  UserCheck,
  DollarSign,
  CheckCircle2,
} from "lucide-react"
import { AnimatedSection } from "@/components/marketing/animations"

/**
 * Combined trust signals: British identity + platform guarantees.
 *
 * DECISION: Merged the old BuiltInBritainSection (which was a standalone
 * section with just 4 badges) with the trust strip that was buried inside
 * PricingPreviewSection. Both communicated trust — combining them into a
 * single compact strip keeps the page tight.
 */
const BRITISH_BADGES = [
  { icon: Factory, label: "British Factories" },
  { icon: Crown, label: "British Executives" },
  { icon: GraduationCap, label: "British Apprentices" },
  { icon: Wrench, label: "Engineering Heritage" },
] as const

const TRUST_SIGNALS = [
  { icon: Shield, label: "Your IP, 100%" },
  { icon: UserCheck, label: "Verified Experts" },
  { icon: DollarSign, label: "No Equity Required" },
  { icon: CheckCircle2, label: "Cancel Anytime" },
] as const

/**
 * TrustStrip — Compact trust section combining British identity and guarantees.
 *
 * INTENT: Communicates trust and identity without taking up a full section.
 * The British focus is stated clearly but concisely, followed by four
 * platform guarantees that address common objections.
 */
export function BuiltInBritainSection() {
  return (
    <section
      id="british"
      className="py-8 sm:py-12 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <AnimatedSection>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black mb-3 leading-tight">
            Forged in{" "}
            <span className="text-international-orange">Britain.</span>{" "}
            Built for the World.
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto leading-relaxed mb-6 sm:mb-8">
            Our network starts in the UK, tapping into spare manufacturing
            capacity and world-class engineering talent. Globally ambitious,
            locally rooted.
          </p>

          {/* British identity badges */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-6 sm:mb-8">
            {BRITISH_BADGES.map((badge) => {
              const Icon = badge.icon
              return (
                <div
                  key={badge.label}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border bg-card text-xs sm:text-sm font-medium text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-international-orange flex-shrink-0" />
                  {badge.label}
                </div>
              )
            })}
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap justify-center gap-x-4 sm:gap-x-8 gap-y-2 text-sm text-muted-foreground">
            {TRUST_SIGNALS.map((signal) => {
              const Icon = signal.icon
              return (
                <div key={signal.label} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-international-orange flex-shrink-0" />
                  <span className="font-medium text-foreground text-xs sm:text-sm">
                    {signal.label}
                  </span>
                </div>
              )
            })}
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}
