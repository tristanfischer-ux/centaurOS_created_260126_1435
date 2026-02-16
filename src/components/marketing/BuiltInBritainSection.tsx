"use client"

import { Crown, Wrench, GraduationCap, Factory } from "lucide-react"
import { AnimatedSection } from "@/components/marketing/animations"

/**
 * Compact British identity badges.
 *
 * @description Four inline badges that state the British focus without
 * taking up a full section with cards, images, and CTAs.
 */
const BRITISH_BADGES = [
  { icon: Factory, label: "British Factories" },
  { icon: Crown, label: "British Executives" },
  { icon: GraduationCap, label: "British Apprentices" },
  { icon: Wrench, label: "Engineering Heritage" },
] as const

/**
 * BuiltInBritainSection — Compact British identity banner.
 *
 * @description A lightweight statement of British focus: one headline,
 * one sentence, four inline badges. Present but not overboard.
 *
 * @component
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
            <span className="text-international-orange">Britain.</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto leading-relaxed mb-6 sm:mb-8">
            Globally ambitious, locally rooted. Our network starts in the UK
            because that&apos;s where the manufacturing renaissance begins.
          </p>
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {BRITISH_BADGES.map((badge) => {
              const Icon = badge.icon
              return (
                <div
                  key={badge.label}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-card text-sm font-medium text-foreground"
                >
                  <Icon className="h-4 w-4 text-international-orange flex-shrink-0" />
                  {badge.label}
                </div>
              )
            })}
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}
