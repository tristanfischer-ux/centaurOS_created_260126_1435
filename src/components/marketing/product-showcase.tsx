'use client'

/**
 * @file product-showcase.tsx
 *
 * @description Tabbed screenshot showcase for the landing page. Shows 5 key
 * ForgeOS features in a browser frame with auto-rotation and callout badges.
 * Creates the "wow factor" by showing the actual app interface before signup.
 *
 * FLOW: Inserted on landing page between Solution and Who It's For sections.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { BrowserFrame } from './browser-frame'
import { Hammer, UserPlus, TrendingUp, Target, ShoppingCart, Briefcase, Flame, Users } from 'lucide-react'

interface ShowcaseTab {
  id: string
  label: string
  icon: React.ReactNode
  url: string
  image: string
  headline: string
  description: string
  callouts: Array<{
    text: string
    position: string // Tailwind positioning classes
  }>
}

const TABS: ShowcaseTab[] = [
  // 1. Design — lead with the product hook
  {
    id: 'design',
    label: 'Design',
    icon: <Hammer className="h-4 w-4" />,
    url: 'fractionalforge.app/the-forge',
    image: '/images/screenshots/design-modules.png',
    headline: 'From idea to product design',
    description: 'Describe your product and the platform walks through the materials, hardware, software, and equipment you will need. Every component links directly to suppliers who can make it.',
    callouts: [
      { text: 'Product modules, explained', position: 'top-[10%] left-[5%]' },
      { text: 'Link to matched suppliers', position: 'top-[35%] right-[5%]' },
    ],
  },
  // 2. Recruits — fractional executives marketplace
  {
    id: 'recruits',
    label: 'Recruits',
    icon: <UserPlus className="h-4 w-4" />,
    url: 'fractionalforge.app/recruits',
    image: '/images/screenshots/marketplace.png',
    headline: 'Experienced professionals, on your terms',
    description: 'A marketplace of experienced professionals with decades of domain expertise. Search by specialism, see their background, and engage them directly at their own day rate.',
    callouts: [
      { text: 'Search by specialism', position: 'top-[10%] left-[5%]' },
      { text: 'Rates set by the professionals', position: 'top-[45%] right-[5%]' },
    ],
  },
  // 3. Investors — fundraising
  {
    id: 'investors',
    label: 'Investors',
    icon: <TrendingUp className="h-4 w-4" />,
    url: 'fractionalforge.app/investors',
    image: '/images/screenshots/investors.png',
    headline: '7,800+ investors, pre-researched',
    description: 'Venture capital, private equity, angels, family offices, and grants. Every firm researched with fund sizes, sector focus, stage distribution, and partner contacts.',
    callouts: [
      { text: 'AI matching by stage + sector', position: 'top-[10%] left-[5%]' },
      { text: 'Partner contacts included', position: 'bottom-[15%] right-[5%]' },
    ],
  },
  // 4. Specialists — the 13 AI agents
  {
    id: 'specialists',
    label: 'Specialists',
    icon: <Briefcase className="h-4 w-4" />,
    url: 'fractionalforge.app/specialists',
    image: '/images/screenshots/specialists-huddles.png',
    headline: '13 specialist AI agents',
    description: 'Strategy, CTO, engineering, manufacturing, supply chain, finance, legal, sales, marketing, product, HR, fundraising, and chief of staff. They fill expertise gaps across every discipline.',
    callouts: [
      { text: 'Live data analysis', position: 'top-[15%] left-[5%]' },
      { text: 'You make the decisions', position: 'bottom-[20%] right-[5%]' },
    ],
  },
  // 5. Source — 13,700+ UK and European manufacturers
  {
    id: 'source',
    label: 'Source',
    icon: <ShoppingCart className="h-4 w-4" />,
    url: 'fractionalforge.app/the-forge/source',
    image: '/images/screenshots/source-sankey.png',
    headline: '13,700+ UK and European manufacturers',
    description: 'Every part of your design linked to the manufacturers who can actually make it. Search by capability, location, and specialism — reach out directly for real expertise.',
    callouts: [
      { text: 'Matched to your design', position: 'top-[15%] right-[5%]' },
      { text: 'Reach out to real suppliers', position: 'top-[50%] left-[5%]' },
    ],
  },
  // 6. Strategy — objectives and tasks for distributed teams
  {
    id: 'strategy',
    label: 'Strategy',
    icon: <Target className="h-4 w-4" />,
    url: 'fractionalforge.app/strategy',
    image: '/images/screenshots/strategy-river.png',
    headline: 'Keep a distributed team aligned',
    description: 'Break your strategy into objectives and those into weekly tasks. Assign work to teammates or directly to the 13 specialist AI agents — everyone knows what they are doing and why.',
    callouts: [
      { text: 'Objectives into weekly tasks', position: 'top-[15%] left-[5%]' },
      { text: 'Live progress across the team', position: 'top-[45%] right-[5%]' },
    ],
  },
  // 7. Team — your full team visualised
  {
    id: 'team',
    label: 'Team',
    icon: <Users className="h-4 w-4" />,
    url: 'fractionalforge.app/team',
    image: '/images/screenshots/team.png',
    headline: 'Your team, visualised',
    description: 'See every role covered and every gap at a glance. 13 specialist AI agents plus your human team — organised by function with live workload and capacity tracking.',
    callouts: [
      { text: 'Coverage + gaps', position: 'top-[15%] left-[5%]' },
      { text: 'Live capacity tracking', position: 'bottom-[15%] right-[5%]' },
    ],
  },
  // 8. Cash Burn — financial modelling
  {
    id: 'cash-burn',
    label: 'Cash Burn',
    icon: <Flame className="h-4 w-4" />,
    url: 'fractionalforge.app/cash-burn',
    image: '/images/screenshots/cash-burn.png',
    headline: 'Runway and P&L in one place',
    description: 'Model what is going out, what is coming in, and your resulting profit and loss. Test scenarios, project runway against current burn, and see where things tighten.',
    callouts: [
      { text: 'Scenario modelling', position: 'top-[15%] right-[5%]' },
      { text: 'Runway projection', position: 'top-[45%] left-[5%]' },
    ],
  },
]

const ROTATION_MS = 6000

/**
 * ProductShowcase — tabbed screenshot section for marketing page.
 */
export function ProductShowcase() {
  const [activeTab, setActiveTab] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const advance = useCallback(() => {
    setActiveTab(prev => (prev + 1) % TABS.length)
  }, [])

  // Auto-rotation
  useEffect(() => {
    if (isPaused) return
    timerRef.current = setInterval(advance, ROTATION_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [advance, isPaused])

  const handleTabClick = (index: number) => {
    setActiveTab(index)
    setIsPaused(true)
    // Resume after 15 seconds of inactivity
    setTimeout(() => setIsPaused(false), 15000)
  }

  const tab = TABS[activeTab]

  return (
    <section className="py-16 sm:py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center space-y-4 mb-12">
          <p className="text-xs font-bold tracking-[0.3em] uppercase text-international-orange">
            See ForgeOS
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground tracking-tight">
            Everything you need to build,
            <br />
            <span className="text-international-orange">in one place.</span>
          </h2>
        </div>

        {/* Tab strip */}
        <div className="relative mb-8">
          <div className="flex items-center justify-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none px-2">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabClick(i)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all min-h-[44px]',
                  i === activeTab
                    ? 'bg-international-orange text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {t.icon}
                <span className="hidden xs:inline">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none sm:hidden" />
        </div>

        {/* Progress bar */}
        <div className="max-w-md mx-auto mb-8">
          <div className="h-0.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              key={`progress-${activeTab}-${isPaused}`}
              className="h-full bg-international-orange"
              initial={{ width: '0%' }}
              animate={{ width: isPaused ? undefined : '100%' }}
              transition={{ duration: ROTATION_MS / 1000, ease: 'linear' }}
            />
          </div>
        </div>

        {/* Screenshot + description */}
        <div
          className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-center"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Browser frame with screenshot */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <BrowserFrame url={tab.url}>
                  <div className="relative aspect-[16/10]">
                    <Image
                      src={tab.image}
                      alt={`ForgeOS ${tab.label} interface`}
                      fill
                      className="object-cover object-top"
                      sizes="(max-width: 1024px) 100vw, 60vw"
                      priority
                    />
                    {/* Callout badges — hidden on mobile to prevent overflow */}
                    {tab.callouts.map((callout, ci) => (
                      <motion.div
                        key={callout.text}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 + ci * 0.15, duration: 0.4 }}
                        className={cn(
                          'absolute px-3 py-1.5 rounded-full bg-international-orange text-white text-xs font-semibold shadow-lg hidden sm:block',
                          callout.position,
                        )}
                      >
                        {callout.text}
                      </motion.div>
                    ))}
                  </div>
                </BrowserFrame>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Description */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="h-1 w-12 bg-international-orange rounded-full" />
                <h3 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                  {tab.headline}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {tab.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
