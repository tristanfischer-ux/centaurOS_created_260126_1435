"use client"

import { Shield, Lock, BadgeCheck, Scale, Crown } from "lucide-react"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
} from "@/components/marketing/animations"

/**
 * Trust signals — why users can trust Fractional Forge.
 *
 * @description Builds confidence through verifiable commitments:
 * IP ownership, quality verification, no equity requirements,
 * transparent pricing. Every claim is specific and credible.
 */
const TRUST_SIGNALS = [
  {
    icon: Lock,
    title: "Your IP. Always.",
    description:
      "Every design, prototype, and product you build on the platform belongs to you. This is baked into every contract — no exceptions, no gotchas.",
  },
  {
    icon: BadgeCheck,
    title: "Verified Execution",
    description:
      "Critical deliverables are reviewed by senior fractional executives before they reach you. The Forge Stamp is our guarantee of quality.",
  },
  {
    icon: Scale,
    title: "No Equity. No Lock-In.",
    description:
      "Pay for expertise by the day or by the project. No equity stakes, no long-term contracts, no golden handcuffs. Scale up or wind down on your terms.",
  },
  {
    icon: Shield,
    title: "The Legal Fortress",
    description:
      "Fractional Forge Ltd is the operating company that holds contracts, manages liability, and provides the legal infrastructure. You focus on building.",
  },
  {
    icon: Crown,
    title: "British Manufacturing Heritage",
    description:
      "Built on centuries of British engineering excellence. Our network of UK factories, executives, and apprentices keeps the tradition of quality manufacturing alive and thriving.",
  },
] as const

/**
 * TrustSection — Confidence-building signals.
 *
 * @description Addresses the key objections founders have before committing:
 * "Who owns the IP?", "Can I trust the quality?", "Am I locked in?"
 * Light-first design — no dark backgrounds.
 *
 * @component
 */
export function TrustSection() {
  return (
    <section className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-16">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            Built on Trust
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Your Company. Your Rules.
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            We provide the team and infrastructure. You keep everything you build.
          </p>
        </AnimatedSection>

        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
          {TRUST_SIGNALS.map((signal) => {
            const Icon = signal.icon
            return (
              <AnimatedCard
                key={signal.title}
                className="border bg-card rounded-xl p-5 sm:p-6 flex flex-col text-center"
              >
                <div className="mx-auto mb-3 sm:mb-4 h-12 w-12 rounded-full bg-international-orange/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-international-orange" />
                </div>
                <h3 className="text-base font-bold mb-2 text-foreground">
                  {signal.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                  {signal.description}
                </p>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>
      </div>
    </section>
  )
}
