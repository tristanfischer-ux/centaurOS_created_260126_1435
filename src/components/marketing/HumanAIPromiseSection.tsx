"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight, GraduationCap, Briefcase, Heart, Sparkles, Users, Lightbulb } from "lucide-react"
import { motion } from "framer-motion"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
  buttonHover,
  buttonTap,
} from "@/components/marketing/animations"

/**
 * The three audiences for the Human-AI Promise.
 *
 * @description Each card speaks directly to a different audience about how
 * AI augments their role — young people get empowered, veterans get a
 * career renaissance, and everyone benefits from human-first AI.
 */
const AUDIENCE_CARDS = [
  {
    id: "young",
    icon: GraduationCap,
    audience: "For Young People",
    headline: "AI Won't Replace You. It Will Make You Dangerous.",
    description:
      "You're entering the workforce at the most exciting time in history. AI tools will make you 10x more productive than the generation before you. On Fractional Forge, you'll use those tools to ship real hardware products — not make coffee. You'll learn from veterans who've built things that actually exist in the world. And one day, you'll start your own company.",
    highlights: [
      "Use AI tools to be massively more productive from day one",
      "Ship real hardware products, not classroom exercises",
      "Learn from executives who've done it — not just read about it",
      "Fast-track from apprentice to founder",
    ],
    cta: "Start as Apprentice",
    href: "/join/apprentice",
    accentBg: "bg-electric-blue-light",
    accentText: "text-electric-blue",
  },
  {
    id: "experienced",
    icon: Briefcase,
    audience: "For Experienced Professionals",
    headline: "Your Best Years Aren't Behind You.",
    description:
      "You've spent decades building expertise that no AI can replicate — judgement, relationships, intuition. Now imagine deploying that across multiple companies, mentoring AI-augmented young talent who move at incredible speed, and having a more interesting career than any single company could ever offer. Your experience combined with their energy and AI tools? That's unstoppable.",
    highlights: [
      "Work across multiple companies — bring your expertise to the market",
      "Mentor the next generation of AI-augmented talent",
      "Have a significantly more interesting career as a seasoned veteran",
      "Inspire yourself to become an entrepreneur in your own right",
    ],
    cta: "Join as Executive",
    href: "/join/executive",
    accentBg: "bg-international-orange/5",
    accentText: "text-international-orange",
  },
  {
    id: "everyone",
    icon: Heart,
    audience: "For Everyone",
    headline: "Humans in Charge. AI in Service.",
    description:
      "We're building for a world where AI changes everything — but humans remain at the centre. Every AI tool on the platform exists to make people more capable, not to make people unnecessary. The best work happens when experienced judgement meets youthful energy, amplified by AI. That's the Fractional Forge model.",
    highlights: [
      "AI amplifies human capability — it doesn't replace it",
      "Experienced judgement guides AI-augmented execution",
      "Every tool designed to make humans more effective",
      "The future of work is human-led and AI-powered",
    ],
    cta: "Learn More",
    href: "/#roles",
    accentBg: "bg-muted",
    accentText: "text-foreground",
  },
] as const

/**
 * HumanAIPromiseSection — The human-first AI positioning.
 *
 * @description Addresses the AI elephant in the room head-on: AI is happening,
 * it will change the world, but we put humans in charge. Young people are
 * augmented (not replaced), experienced people get a career renaissance,
 * and the combination is greater than either alone.
 *
 * @component
 */
export function HumanAIPromiseSection() {
  return (
    <section
      id="human-ai"
      className="py-12 sm:py-16 md:py-28 bg-background border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <AnimatedSection className="text-center mb-10 sm:mb-12 md:mb-20">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            The Future of Work
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            AI Is Changing the World.
            <br className="hidden sm:block" />{" "}
            <span className="text-international-orange">
              We&apos;re Putting Humans in Charge.
            </span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
            The best work doesn&apos;t happen when AI replaces people. It happens
            when experienced veterans mentor ambitious young talent who are
            armed with AI tools — and together they build things neither
            could alone.
          </p>
        </AnimatedSection>

        {/* Audience Cards */}
        <StaggerContainer className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          {AUDIENCE_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <AnimatedCard
                key={card.id}
                className={`border bg-card rounded-xl overflow-hidden flex flex-col ${
                  card.id === "experienced"
                    ? "border-international-orange border-2 relative"
                    : ""
                }`}
              >
                {/* Accent header */}
                <div className={`${card.accentBg} px-5 sm:px-6 py-4 flex items-center gap-3`}>
                  <div className="h-9 w-9 rounded-lg bg-background/80 flex items-center justify-center">
                    <Icon className={`h-4 w-4 ${card.accentText}`} />
                  </div>
                  <span className={`text-xs font-mono font-bold uppercase tracking-widest ${card.accentText}`}>
                    {card.audience}
                  </span>
                </div>

                {/* Content */}
                <div className="p-5 sm:p-6 md:p-8 flex flex-col flex-1">
                  <h3 className="text-lg sm:text-xl font-black mb-3 text-foreground leading-tight">
                    {card.headline}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-5 sm:mb-6">
                    {card.description}
                  </p>

                  {/* Highlights */}
                  <ul className="space-y-2.5 mb-6 sm:mb-8 flex-1">
                    {card.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="flex items-start gap-2.5 text-sm text-muted-foreground"
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          <Sparkles className={`h-3.5 w-3.5 ${card.accentText}`} />
                        </div>
                        {highlight}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <motion.div whileHover={buttonHover} whileTap={buttonTap}>
                    <Link
                      href={card.href}
                      className={`flex items-center justify-center gap-2 py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px] ${
                        card.id === "experienced"
                          ? "bg-international-orange hover:bg-international-orange-hover text-white"
                          : "bg-muted hover:bg-secondary text-foreground"
                      }`}
                    >
                      {card.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </motion.div>
                </div>
              </AnimatedCard>
            )
          })}
        </StaggerContainer>

        {/* Image */}
        <AnimatedSection className="mt-10 sm:mt-12 md:mt-16" delay={0.2}>
          <div className="relative w-full aspect-[3/2] sm:aspect-[2.5/1] rounded-xl overflow-hidden border shadow-lg">
            <Image
              src="/images/marketing/human-ai-workshop.png"
              alt="A seasoned engineer mentoring a young apprentice in a modern workshop — humans in charge, AI in service"
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 1200px"
              loading="lazy"
            />
            {/* Overlay with quote */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/80 to-transparent p-4 sm:p-6">
              <p className="text-background/90 text-sm sm:text-base font-medium italic">
                &ldquo;Experience guides. Youth executes. AI amplifies. Together, unstoppable.&rdquo;
              </p>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}
