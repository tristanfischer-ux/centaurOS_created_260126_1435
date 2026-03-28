'use client'

/**
 * @file meeting-flow.tsx
 *
 * @description 3-step visual sequence showing how ForgeOS meetings produce
 * real deliverables: Huddle → Processing → Objectives & Tasks.
 *
 * FLOW: Inserted on landing page after ProductShowcase.
 */

import Image from 'next/image'
import { motion } from 'framer-motion'
import { AnimatedSection } from './animations'
import { BrowserFrame } from './browser-frame'
import { ArrowRight } from 'lucide-react'

const STEPS = [
  {
    number: '01',
    label: 'Run the meeting',
    description: 'Your specialist team debates the issue, pulls live data, and presents their analysis. You steer the conversation.',
    image: '/images/screenshots/specialists-huddles.png',
    url: 'app.fractionalforge.com/specialists',
  },
  {
    number: '02',
    label: 'We extract the output',
    description: 'Transcript analysed. Key decisions identified. Objectives and tasks built automatically.',
    image: '/images/screenshots/meeting-outputs.png',
    url: 'app.fractionalforge.com/specialists',
  },
  {
    number: '03',
    label: 'Ready to execute',
    description: 'Objectives with owners, deadlines, and linked tasks — created from the meeting, not after it.',
    image: '/images/screenshots/meeting-objectives.png',
    url: 'app.fractionalforge.com/specialists',
  },
]

export function MeetingFlowSection() {
  return (
    <section className="py-16 sm:py-24 px-6 bg-muted/30">
      <div className="max-w-7xl mx-auto">
        <AnimatedSection>
          <div className="text-center space-y-4 mb-16">
            <p className="text-xs font-bold tracking-[0.3em] uppercase text-international-orange">
              From discussion to action
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground tracking-tight">
              Meetings that produce{' '}
              <span className="text-international-orange">real deliverables.</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              No more meeting notes that nobody reads. Every huddle ends with objectives, tasks, and owners — ready to track.
            </p>
          </div>
        </AnimatedSection>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-4">
          {STEPS.map((step, i) => (
            <AnimatedSection key={step.number} delay={i * 0.15}>
              <div className="relative">
                {/* Connecting arrow between steps (desktop only) */}
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:flex absolute -right-4 top-1/3 z-10 w-8 items-center justify-center">
                    <ArrowRight className="h-5 w-5 text-international-orange" />
                  </div>
                )}

                <div className="space-y-4">
                  {/* Step number + label */}
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-international-orange text-white text-sm font-bold">
                      {step.number}
                    </span>
                    <h3 className="text-lg font-semibold text-foreground">
                      {step.label}
                    </h3>
                  </div>

                  {/* Screenshot in browser frame */}
                  <motion.div
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <BrowserFrame url={step.url}>
                      <div className="relative aspect-[16/10]">
                        <Image
                          src={step.image}
                          alt={step.label}
                          fill
                          className="object-cover object-top"
                          sizes="(max-width: 1024px) 100vw, 33vw"
                        />
                      </div>
                    </BrowserFrame>
                  </motion.div>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  )
}
