/**
 * @file demo-projects.ts — Canonical metadata for the five Forge demo packs.
 *
 * @description Single source of truth for the five real project packs generated
 * against the live Forge pipeline on 25 April 2026. Shared between the homepage
 * demo grid (`/`), the workspace Examples section (`/the-forge-v2`), and the
 * public demo route (`/forge/demos` + `/forge/demos/<slug>`).
 *
 * All numbers come directly from the generated PDFs. Two of the five came back
 * over the declared cost ceiling — the metadata reflects that honestly.
 *
 * Spell-out rule: no acronym leaks in user-visible fields. The `acronym` field
 * holds the short form for parenthetical use only.
 *
 * @security Public — all assets are static under /public/forge-demos/.
 */

export interface ForgeDemo {
  /**
   * URL slug used in /forge/demos/<slug> and as the card key.
   * Must be URL-safe, kebab-case.
   */
  slug: string
  /** Spelled-out heading — no acronym. */
  heading: string
  /**
   * Optional short form shown in parentheses after the heading.
   * May include the acronym (the only place it is permitted in user copy).
   */
  acronym?: string
  /** One-sentence sub-heading. */
  subHeading: string
  /** Two-sentence founder-voice summary. Used in cards and meta descriptions. */
  summary: string
  /**
   * Longer founder-voice paragraph for the per-demo detail page.
   * Extends the summary with product rationale and technical context.
   */
  description: string
  /** Absolute path to the cover render under /public/. */
  coverPath: string
  /** Absolute path to the PDF under /public/. */
  pdfPath: string
  /** Pack stats drawn directly from the generated PDF. */
  stats: {
    pages: number
    modules: number
    keyParts: number
    bomRows: number
    suppliers: number
    failureModes: number
    openQuestions: number
    standards: number
    reviews: number
  }
  /** Cost envelope — unit cost vs ceiling, headroom positive = under budget. */
  cost: {
    /** Formatted unit cost string, e.g. "£1,276,480". */
    unit: string
    /** Formatted cost ceiling string, e.g. "£180,000". */
    ceiling: string
    /**
     * Headroom in pounds — positive means under budget, negative means over.
     * Used to drive colour coding and the pill label.
     */
    headroomGbp: number
    /** Human-readable headroom label for the pill. */
    headroomLabel: string
  }
}

/**
 * The five Forge demo packs. Order matches the PDF numbering so the list is
 * stable and predictable.
 *
 * DO NOT add mock or placeholder entries here. Every row must correspond to a
 * real PDF in /public/forge-demos/.
 */
export const FORGE_DEMOS: readonly ForgeDemo[] = [
  {
    slug: 'bess',
    heading: 'Battery energy storage system',
    acronym: 'BESS',
    subHeading: 'Forty-foot containerised, 1.5 megawatt-hour, 500 kilowatt',
    summary:
      'Lithium iron phosphate cells, grid-forming bi-directional power conversion, liquid-cooled thermal management, certified fire detection and suppression. Built to ship on a flatbed lorry, install on a prepared concrete pad, and commission inside two days against the United Kingdom G99 grid code.',
    description:
      'A forty-foot ISO container housing 1.5 megawatt-hours of lithium iron phosphate storage and a 500 kilowatt bi-directional power conversion system. Engineering modules cover the cell block, thermal management, power electronics, fire suppression, grid interconnect, and site works. Target installed capital cost under £180k. Designed to ship complete on a flatbed lorry, install on a prepared concrete pad, and commission inside two days.',
    coverPath: '/forge-demos/thumbnails/01-BESS-cover.png',
    pdfPath: '/forge-demos/01-BESS.pdf',
    stats: {
      pages: 58,
      modules: 6,
      keyParts: 43,
      bomRows: 53,
      suppliers: 29,
      failureModes: 24,
      openQuestions: 18,
      standards: 12,
      reviews: 6,
    },
    cost: {
      unit: '£1,276,480',
      ceiling: '£180,000',
      headroomGbp: -1_096_480,
      headroomLabel: 'Over by £1.1m',
    },
  },
  {
    slug: 'haps-wren',
    heading: 'High-altitude pseudo-satellite',
    acronym: 'HAPS, Wren-style',
    subHeading: 'Solar plus hydrogen hybrid, twenty-kilometre operating ceiling',
    summary:
      'Modelled on the Wren Aerospace platform: solar arrays sized for daytime cruise, fuel-cell-grade hydrogen storage for night and cloud-cover endurance, a regenerative buffer battery, and a space-grade composite airframe. Thirty-five-metre wingspan, twenty-five-kilogram sensor payload, multi-week stratospheric loiter from a two-hundred-metre runway.',
    description:
      'A stratospheric platform modelled on the Wren Aerospace hybrid architecture — solar arrays for daytime cruise power, compressed hydrogen and fuel cells for night and overcast endurance, and a regenerative lithium buffer battery to smooth the transitions. Eight modules cover the airframe, propulsion, power generation and storage, guidance and communications, payload integration, ground support, and launch operations. The bill of materials covers 86 rows from 25 suppliers. Unit cost came back at £1.47m against a £2.5m ceiling, leaving £1.0m of headroom — a credible first-pass envelope for a programme of this complexity.',
    coverPath: '/forge-demos/thumbnails/02-HAPS-Wren-cover.png',
    pdfPath: '/forge-demos/02-HAPS-Wren.pdf',
    stats: {
      pages: 59,
      modules: 8,
      keyParts: 53,
      bomRows: 86,
      suppliers: 25,
      failureModes: 32,
      openQuestions: 22,
      standards: 16,
      reviews: 8,
    },
    cost: {
      unit: '£1,473,750',
      ceiling: '£2,500,000',
      headroomGbp: 1_026_250,
      headroomLabel: 'Under by £1.0m',
    },
  },
  {
    slug: 'vertical-farm',
    heading: 'Modular vertical farm',
    subHeading: 'Forty-foot high cube reefer, year-round leafy greens',
    summary:
      'Five growing layers on two rack runs with a central walking aisle, housed in a forty-foot high cube reefer container. The reefer unit manages air handling, temperature, humidity, and carbon dioxide. A small fertigation unit at the front handles nutrient mixing and recirculating water supply. Light-emitting-diode grow-lights with daily light integral control, sensor mesh feeding a remote farm-management dashboard.',
    description:
      'A forty-foot high cube reefer container converted into a modular vertical farm for short leafy salad greens. Five growing layers on two rack runs down the length of the container — one on the left, one on the right — with a central walking aisle for operator access. The reefer unit manages air handling, temperature, humidity, and carbon dioxide levels, eliminating the need for a separate climate system. A small fertigation unit sits at the front by the door, handling nutrient mixing and recirculating water supply to all five tiers. Target yield four tonnes per year per container. Target installed capital cost under £150,000.',
    coverPath: '/forge-demos/thumbnails/03-Vertical-Farm-cover.png',
    pdfPath: '/forge-demos/03-Vertical-Farm.pdf',
    stats: {
      pages: 60,
      modules: 8,
      keyParts: 55,
      bomRows: 70,
      suppliers: 32,
      failureModes: 28,
      openQuestions: 20,
      standards: 14,
      reviews: 8,
    },
    cost: {
      unit: '£69,555',
      ceiling: '£150,000',
      headroomGbp: 80_445,
      headroomLabel: 'Under by £80k',
    },
  },
  {
    slug: 'desalination',
    heading: 'Containerised seawater desalination',
    acronym: 'sea water reverse osmosis',
    subHeading: 'Five hundred cubic metres of potable water per day',
    summary:
      'Pre-treatment, two-pass reverse osmosis, post-treatment with remineralisation and chlorination, fifty per cent recovery rate, energy-recovery device on the brine stream. Ships complete on a flatbed lorry, plugs into three-phase mains or a diesel generator set, starts producing water within four hours of arrival on site.',
    description:
      'A containerised seawater reverse osmosis plant producing 500 cubic metres of potable water per day. Seven modules cover pre-filtration, first-pass reverse osmosis, second-pass polishing, post-treatment and remineralisation, energy recovery and pumping, electrical distribution, and controls and monitoring. The bill of materials runs to 68 rows from 32 suppliers. Unit cost came back at £247,980 against a £350,000 ceiling — £102k of headroom, which is a healthy margin for a system that ships, installs, and operates in remote or hostile environments.',
    coverPath: '/forge-demos/thumbnails/04-Desalination-cover.png',
    pdfPath: '/forge-demos/04-Desalination.pdf',
    stats: {
      pages: 60,
      modules: 7,
      keyParts: 46,
      bomRows: 68,
      suppliers: 32,
      failureModes: 26,
      openQuestions: 18,
      standards: 13,
      reviews: 7,
    },
    cost: {
      unit: '£247,980',
      ceiling: '£350,000',
      headroomGbp: 102_020,
      headroomLabel: 'Under by £102k',
    },
  },
  {
    slug: 'hedgerow',
    heading: 'Hedgerow garden bird feeder',
    subHeading: 'Premium, camera plus solar plus on-device inference',
    summary:
      'A garden bird feeder reimagined as a smart product: twelve-megapixel camera with optical zoom, on-device species and individual-bird identification, solar power, ceramic or powder-coated steel body designed to look beautiful in year five not year one. Citizen-science data feed into the British Trust for Ornithology Garden BirdWatch programme.',
    description:
      'A premium garden bird feeder with a twelve-megapixel camera, optical zoom, and an on-device neural processing unit that identifies species and individual birds without sending footage to a cloud. Solar charging keeps it wire-free. The body is ceramic or powder-coated steel — designed to look beautiful in year five, not year one. Seven modules cover optics and sensing, edge inference, solar and power management, connectivity, the feeder mechanism itself, the body and fixings, and cloud data. The bill of materials runs to 70 rows from 21 suppliers. Unit cost came back at £354 against a £155 ceiling — over by £199. The Forge surfaced that gap so you can decide whether to simplify the optics, move inference to the cloud, or revise the price target.',
    coverPath: '/forge-demos/thumbnails/05-Hedgerow-cover.png',
    pdfPath: '/forge-demos/05-Hedgerow.pdf',
    stats: {
      pages: 49,
      modules: 7,
      keyParts: 45,
      bomRows: 70,
      suppliers: 21,
      failureModes: 22,
      openQuestions: 16,
      standards: 10,
      reviews: 7,
    },
    cost: {
      unit: '£354',
      ceiling: '£155',
      headroomGbp: -199,
      headroomLabel: 'Over by £199',
    },
  },
] as const
