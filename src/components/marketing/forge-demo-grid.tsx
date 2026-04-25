/**
 * @file forge-demo-grid.tsx
 *
 * @description Marketing-surface gallery of five real Forge project packs,
 * generated against the live pipeline on 25 April 2026. Each card shows the
 * cover render, a short founder-voice summary, the project stats (modules,
 * key parts, bill-of-materials rows, suppliers), and the cost envelope. Two
 * of the five came back over the declared ceiling (battery energy storage
 * system and the bird feeder); the system surfaces that honestly rather than
 * smoothing it over. Each card links to the full project pack PDF served
 * statically from /forge-demos/.
 *
 * Solves spec 6e (Forge demo projects) for the marketing surface and
 * addresses the "no proof of Forge output" friction the buy-or-bounce v4
 * report flagged: a logged-out visitor can read a finished sixty-page pack
 * before spending a minute creating an account.
 *
 * @security Public — all assets are static under /public/forge-demos/.
 */

'use client'

import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { AnimatedSection, AnimatedCard } from '@/components/marketing/animations'

interface ForgeDemo {
  /** Slug used for asset filenames and the card key. */
  slug: string
  /** Card heading, spelled-out (no acronym leaks). */
  heading: string
  /** Optional acronym to render in parentheses after the heading. */
  acronym?: string
  /** One-sentence sub-heading. */
  subHeading: string
  /** Two-sentence founder-voice summary. */
  summary: string
  /** Cover render path under /forge-demos/thumbnails/. */
  coverPath: string
  /** Static PDF path under /forge-demos/. */
  pdfPath: string
  /** Pack stats — every demo has all six declared. */
  stats: {
    pages: number
    modules: number
    keyParts: number
    bomRows: number
    suppliers: number
  }
  /** Cost envelope. */
  cost: {
    unit: string
    ceiling: string
    /** Positive = under, negative = over. Used for color + label. */
    headroomGbp: number
    headroomLabel: string
  }
}

const DEMOS: readonly ForgeDemo[] = [
  {
    slug: '01-BESS',
    heading: 'Battery energy storage system',
    acronym: 'BESS',
    subHeading: 'Forty-foot containerised, 3.5 megawatt-hour, 1.5 megawatt',
    summary:
      'Lithium iron phosphate cells, grid-forming bi-directional power conversion, liquid-cooled thermal management, certified fire detection and suppression. Built to ship on a flatbed lorry, install on a prepared concrete pad, and commission inside two days against the United Kingdom G99 grid code.',
    coverPath: '/forge-demos/thumbnails/01-BESS-cover.png',
    pdfPath: '/forge-demos/01-BESS.pdf',
    stats: { pages: 58, modules: 6, keyParts: 43, bomRows: 53, suppliers: 29 },
    cost: {
      unit: '£1,276,480',
      ceiling: '£180,000',
      headroomGbp: -1_096_480,
      headroomLabel: 'Over by £1.1m',
    },
  },
  {
    slug: '02-HAPS-Wren',
    heading: 'High-altitude pseudo-satellite',
    acronym: 'HAPS, Wren-style',
    subHeading: 'Solar plus hydrogen hybrid, twenty-kilometre operating ceiling',
    summary:
      'Modelled on the Wren Aerospace platform: solar arrays sized for daytime cruise, fuel-cell-grade hydrogen storage for night and cloud-cover endurance, a regenerative buffer battery, and a space-grade composite airframe. Thirty-five-metre wingspan, twenty-five-kilogram sensor payload, multi-week stratospheric loiter from a two-hundred-metre runway.',
    coverPath: '/forge-demos/thumbnails/02-HAPS-Wren-cover.png',
    pdfPath: '/forge-demos/02-HAPS-Wren.pdf',
    stats: { pages: 59, modules: 8, keyParts: 53, bomRows: 86, suppliers: 25 },
    cost: {
      unit: '£1,473,750',
      ceiling: '£2,500,000',
      headroomGbp: 1_026_250,
      headroomLabel: 'Under by £1.0m',
    },
  },
  {
    slug: '03-Vertical-Farm',
    heading: 'Modular vertical farm',
    subHeading: 'Forty-foot container, year-round leafy greens',
    summary:
      'Six thousand simultaneous plant slots across multi-tier hydroponic stacks, four tonnes of yield per container per year. Light-emitting-diode grow-lights with daily light integral control, climate and carbon-dioxide dosing, recirculating nutrient system, sensor mesh feeding a remote farm-management dashboard.',
    coverPath: '/forge-demos/thumbnails/03-Vertical-Farm-cover.png',
    pdfPath: '/forge-demos/03-Vertical-Farm.pdf',
    stats: { pages: 60, modules: 8, keyParts: 55, bomRows: 70, suppliers: 32 },
    cost: {
      unit: '£69,555',
      ceiling: '£150,000',
      headroomGbp: 80_445,
      headroomLabel: 'Under by £80k',
    },
  },
  {
    slug: '04-Desalination',
    heading: 'Containerised seawater desalination',
    acronym: 'sea water reverse osmosis',
    subHeading: 'Five hundred cubic metres of potable water per day',
    summary:
      'Pre-treatment, two-pass reverse osmosis, post-treatment with remineralisation and chlorination, fifty per cent recovery rate, energy-recovery device on the brine stream. Ships complete on a flatbed lorry, plugs into three-phase mains or a diesel genset, starts producing water within four hours of arrival on site.',
    coverPath: '/forge-demos/thumbnails/04-Desalination-cover.png',
    pdfPath: '/forge-demos/04-Desalination.pdf',
    stats: { pages: 60, modules: 7, keyParts: 46, bomRows: 68, suppliers: 32 },
    cost: {
      unit: '£247,980',
      ceiling: '£350,000',
      headroomGbp: 102_020,
      headroomLabel: 'Under by £102k',
    },
  },
  {
    slug: '05-Hedgerow',
    heading: 'Hedgerow garden bird feeder',
    subHeading: 'Premium, camera plus solar plus on-device inference',
    summary:
      'A garden bird feeder reimagined as a smart product: twelve-megapixel camera with optical zoom, on-device species and individual-bird identification, solar power, ceramic or powder-coated steel body designed to look beautiful in year five not year one. Citizen-science data feed into the British Trust for Ornithology Garden BirdWatch programme.',
    coverPath: '/forge-demos/thumbnails/05-Hedgerow-cover.png',
    pdfPath: '/forge-demos/05-Hedgerow.pdf',
    stats: { pages: 49, modules: 7, keyParts: 45, bomRows: 70, suppliers: 21 },
    cost: {
      unit: '£354',
      ceiling: '£155',
      headroomGbp: -199,
      headroomLabel: 'Over by £199',
    },
  },
] as const

/**
 * Forge demo grid section. Renders five real project packs as evidence the
 * platform produces founder-grade output, complete with two over-budget cases
 * the system reports honestly rather than papering over.
 */
export function ForgeDemoGrid() {
  return (
    <section
      id="forge-demos"
      className="py-12 sm:py-16 md:py-24 bg-background border-t border-muted scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <AnimatedSection className="text-center mb-8 sm:mb-10 md:mb-12">
          <span className="text-xs text-international-orange font-mono uppercase tracking-widest mb-3 sm:mb-4 block">
            What the Forge produces
          </span>
          <h2 className="font-playfair text-2xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            Five real Forge runs,{' '}
            <span className="text-international-orange">full project packs</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
            Each pack: brief, modules, bill of materials, supplier shortlist,
            failure modes, standards, cost envelope. Two of them came back over
            budget. The system tells you. You decide.
          </p>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-7">
          {DEMOS.map((demo) => (
            <AnimatedCard key={demo.slug}>
              <DemoCard demo={demo} />
            </AnimatedCard>
          ))}
        </div>

        <AnimatedSection delay={0.2} className="mt-8 sm:mt-10">
          <p className="text-muted-foreground text-xs sm:text-sm text-center max-w-3xl mx-auto leading-relaxed">
            Generated 25 April 2026 against the live Forge pipeline. Same
            pipeline a £20 Starter user gets. Click any pack to read the full
            sixty-page document.
          </p>
        </AnimatedSection>
      </div>
    </section>
  )
}

function DemoCard({ demo }: { demo: ForgeDemo }): React.JSX.Element {
  const isOverBudget = demo.cost.headroomGbp < 0
  const headroomToneClass = isOverBudget ? 'text-warning' : 'text-success'
  const pillToneClass = isOverBudget
    ? 'bg-warning/10 text-warning border-warning/20'
    : 'bg-success/10 text-success border-success/20'

  return (
    <a
      href={demo.pdfPath}
      target="_blank"
      rel="noopener noreferrer"
      className="group block h-full"
      aria-label={`Open the ${demo.heading} project pack PDF in a new tab`}
    >
      <Card className="h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group-active:scale-[0.99]">
        {/* Cover render — page 1 of the PDF rasterised at 144 dpi. */}
        <div className="relative aspect-[3/4] w-full bg-muted overflow-hidden">
          <Image
            src={demo.coverPath}
            alt={`Cover render of the ${demo.heading} project pack`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover object-top"
          />
        </div>

        <CardContent className="p-5 sm:p-6 flex flex-col gap-3.5">
          <div>
            <div className="flex items-start justify-between gap-2 flex-wrap mb-1.5">
              <h3 className="font-playfair text-lg sm:text-xl font-black text-foreground leading-tight">
                {demo.heading}
                {demo.acronym ? (
                  <span className="font-sans font-normal text-sm text-muted-foreground">
                    {' '}
                    ({demo.acronym})
                  </span>
                ) : null}
              </h3>
              <span
                className={`inline-flex shrink-0 items-center px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-widest ${pillToneClass}`}
              >
                {demo.cost.headroomLabel}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">
              {demo.subHeading}
            </p>
          </div>

          <p className="text-sm text-foreground leading-relaxed">
            {demo.summary}
          </p>

          {/* Pack stats row — the bones of a sixty-page document. */}
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2 pt-2 border-t border-border">
            <Stat label="Pages" value={demo.stats.pages} />
            <Stat label="Modules" value={demo.stats.modules} />
            <Stat label="Suppliers" value={demo.stats.suppliers} />
            <Stat label="Key parts" value={demo.stats.keyParts} />
            <Stat label="Bill-of-materials rows" value={demo.stats.bomRows} compact />
            <Stat label="" value="" empty />
          </dl>

          {/* Cost envelope — unit cost vs ceiling, with honest headroom. */}
          <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground mb-0.5">
                Unit cost
              </div>
              <div className="text-base sm:text-lg font-black text-foreground">
                {demo.cost.unit}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground mb-0.5">
                Ceiling
              </div>
              <div className={`text-base sm:text-lg font-black ${headroomToneClass}`}>
                {demo.cost.ceiling}
              </div>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 text-sm text-international-orange group-hover:text-international-orange-hover font-semibold transition-colors mt-1">
            View the full project pack
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </a>
  )
}

function Stat({
  label,
  value,
  compact = false,
  empty = false,
}: {
  label: string
  value: number | string
  compact?: boolean
  empty?: boolean
}): React.JSX.Element {
  if (empty) {
    return <div aria-hidden className="hidden sm:block" />
  }
  return (
    <div className="flex flex-col">
      <dt
        className={`text-[10px] uppercase tracking-widest font-mono text-muted-foreground ${
          compact ? 'leading-tight' : ''
        }`}
      >
        {label}
      </dt>
      <dd className="text-sm font-bold text-foreground">{value}</dd>
    </div>
  )
}
