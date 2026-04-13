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
import { Hammer, LayoutDashboard, TrendingUp, Target, ShoppingCart, Briefcase, Flame } from 'lucide-react'

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
  // 1. Lead with the product — the hero feature
  {
    id: 'forge',
    label: 'The Forge',
    icon: <Hammer className="h-4 w-4" />,
    url: 'fractionalforge.app/the-forge/design',
    image: '/images/screenshots/design-modules.png',
    headline: 'From idea to engineering package',
    description: 'Describe your product. Get module decomposition, isometric illustrations, detailed specs, and a full bill of materials in minutes.',
    callouts: [
      { text: '7 modules auto-generated', position: 'top-[10%] left-[5%]' },
      { text: 'Isometric CAD illustrations', position: 'top-[35%] right-[5%]' },
    ],
  },
  // 2. Source — natural next step after design
  {
    id: 'source',
    label: 'Source',
    icon: <ShoppingCart className="h-4 w-4" />,
    url: 'fractionalforge.app/the-forge/source',
    image: '/images/screenshots/source-sankey.png',
    headline: 'Component to supplier, mapped',
    description: 'Every part in your design automatically matched to manufacturing techniques and real suppliers. Visual flow from specs to quotes.',
    callouts: [
      { text: 'Auto-matched suppliers', position: 'top-[15%] right-[5%]' },
      { text: 'Full BOM coverage', position: 'top-[50%] left-[5%]' },
    ],
  },
  // 3. Specialists — the "team meeting" wow factor
  {
    id: 'specialists',
    label: 'Specialists',
    icon: <Briefcase className="h-4 w-4" />,
    url: 'fractionalforge.app/specialists',
    image: '/images/screenshots/specialists-huddles.png',
    headline: 'Leadership huddles',
    description: 'Run strategy, technology, legal, and finance meetings with your specialist team. They pull live data, debate the issues, and you make the call.',
    callouts: [
      { text: 'Live data analysis', position: 'top-[15%] left-[5%]' },
      { text: 'You decide who speaks', position: 'bottom-[20%] right-[5%]' },
    ],
  },
  // 4. Dashboard — daily command centre
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-4 w-4" />,
    url: 'fractionalforge.app/today',
    image: '/images/screenshots/dashboard-today.png',
    headline: 'Your morning briefing',
    description: 'Tasks, objectives, team pulse, and strategic health. Everything you need, one screen.',
    callouts: [
      { text: 'Daily briefing', position: 'top-[10%] left-[5%]' },
      { text: 'Onboarding checklist', position: 'top-[55%] right-[5%]' },
    ],
  },
  // 5. Cash Burn — financial modelling
  {
    id: 'cash-burn',
    label: 'Cash Burn',
    icon: <Flame className="h-4 w-4" />,
    url: 'fractionalforge.app/cash-burn',
    image: '/images/screenshots/cash-burn.png',
    headline: '52-week runway modelling',
    description: 'Model your cash position with scenario planning. Adjust revenue delays, cost overruns, and growth assumptions — see the impact instantly.',
    callouts: [
      { text: 'Scenario modelling', position: 'top-[15%] right-[5%]' },
      { text: 'Runway projection', position: 'top-[45%] left-[5%]' },
    ],
  },
  // 6. Strategy — objectives tracking
  {
    id: 'strategy',
    label: 'Strategy',
    icon: <Target className="h-4 w-4" />,
    url: 'fractionalforge.app/strategy',
    image: '/images/screenshots/strategy-river.png',
    headline: 'Strategic objectives, visualised',
    description: 'See your company objectives flow from vision to execution. Track progress, spot blockers, stay aligned.',
    callouts: [
      { text: 'Objective river', position: 'top-[15%] left-[5%]' },
      { text: 'Live progress', position: 'top-[45%] right-[5%]' },
    ],
  },
  // 7. Investors — fundraising
  {
    id: 'investors',
    label: 'Investors',
    icon: <TrendingUp className="h-4 w-4" />,
    url: 'fractionalforge.app/investors',
    image: '/images/screenshots/investors.png',
    headline: '1,200+ investors pre-researched',
    description: 'UK VC and PE firms with fund sizes, sector focus, and contact details. Ready when you are.',
    callouts: [
      { text: '1,200+ investors', position: 'top-[15%] left-[5%]' },
      { text: 'Fund sizes + contacts', position: 'top-[45%] right-[5%]' },
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
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8 overflow-x-auto scrollbar-none px-2">
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
                    {/* Callout badges */}
                    {tab.callouts.map((callout, ci) => (
                      <motion.div
                        key={callout.text}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 + ci * 0.15, duration: 0.4 }}
                        className={cn(
                          'absolute px-3 py-1.5 rounded-full bg-international-orange text-white text-xs font-semibold shadow-lg',
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
