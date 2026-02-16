"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Users, Calendar, BookOpen, Handshake } from "lucide-react"
import { motion } from "framer-motion"
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
  buttonHover,
  buttonTap,
} from "@/components/marketing/animations"

/**
 * Guild features — what the community offers.
 *
 * @description The Guild is the human connective tissue of Fractional Forge.
 * It emphasizes real human connection: mentoring, events, workshops, networking.
 */
const GUILD_FEATURES = [
  {
    icon: Handshake,
    title: "Mentorship Pairing",
    description:
      "Every apprentice is paired with an experienced British executive. Real relationships, real guidance, real career acceleration — across generations.",
  },
  {
    icon: Calendar,
    title: "Events & Workshops",
    description:
      "Regular meetups, technical workshops, and networking events across the UK. Virtual connectivity backed by physical reality in British workshops.",
  },
  {
    icon: BookOpen,
    title: "Structured Learning",
    description:
      "On-the-job training tracked and measured. AI-augmented apprentices build portfolios of real projects — mentored by veterans who've done it before.",
  },
  {
    icon: Users,
    title: "The Network",
    description:
      "A curated community of British founders, executives, and apprentices. Experienced judgement meets youthful energy, amplified by AI tools.",
  },
] as const

/**
 * GuildSection — The community and human connection story.
 *
 * @description Positions the Guild as the beating heart of Fractional Forge.
 * This section is about PEOPLE: mentoring, events, community, shared knowledge.
 * No AI messaging — pure human connection.
 *
 * @component
 */
export function GuildSection() {
  return (
    <section
      id="guild"
      className="py-12 sm:py-16 md:py-28 bg-muted/30 border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 md:gap-16 items-center">
          {/* Left: Content */}
          <AnimatedSection>
            <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
              The Guild
            </span>
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
              The People Who
              <br className="hidden sm:block" />{" "}
              <span className="text-international-orange">Make It Work.</span>
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base md:text-lg leading-relaxed mb-6 sm:mb-8">
              Manufacturing at software speed doesn&apos;t happen through tools alone.
              It happens when experienced British executives mentor ambitious
              AI-augmented apprentices, when founders share hard-won lessons, and
              when the community lifts everyone up. The best work happens when
              decades of experience meets youthful energy and modern AI tools.
              That&apos;s the Guild.
            </p>

            {/* Feature list */}
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {GUILD_FEATURES.map((feature) => {
                const Icon = feature.icon
                return (
                  <AnimatedCard
                    key={feature.title}
                    className="flex items-start gap-3 p-3 sm:p-4 rounded-lg border bg-card"
                  >
                    <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-international-orange/10 flex items-center justify-center mt-0.5">
                      <Icon className="h-4 w-4 text-international-orange" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground mb-1">
                        {feature.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </AnimatedCard>
                )
              })}
            </StaggerContainer>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
              <motion.div whileHover={buttonHover} whileTap={buttonTap}>
                <Link
                  href="/join?role=apprentice"
                  className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-6 py-3 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
                >
                  Join as Apprentice
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
              <Link
                href="/join?role=executive"
                className="inline-flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground text-xs font-mono tracking-wider uppercase transition-colors min-h-[48px]"
              >
                Become a Mentor
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </AnimatedSection>

          {/* Right: Image */}
          <AnimatedSection delay={0.15}>
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border shadow-lg">
              <Image
                src="/images/marketing/guild-workshop-hero.png"
                alt="The Guild — a community of founders, executives, and apprentices collaborating in a modern workshop"
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 600px"
                loading="lazy"
              />
              {/* Overlay with quote */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/80 to-transparent p-4 sm:p-6">
                <p className="text-background/90 text-sm font-medium italic">
                  &ldquo;Knowledge scales as fast as the code.&rdquo;
                </p>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  )
}
