/**
 * @file Sample Engineering Package Page
 *
 * @description Public marketing page showcasing a real Fractional Forge engineering
 * package output. Uses the smart-irrigation example (a sensor- and
 * connectivity-equipped product, exactly the kind of smart-product wave
 * the Forge is built for) to demonstrate platform value to non-logged-in
 * visitors.
 *
 * Server component — exports metadata for SEO.
 */

import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Box,
  CheckCircle2,
  ClipboardList,
  Factory,
  FileCheck,
  Layers,
  Scale,
  ShieldCheck,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

export const metadata: Metadata = {
  title: "Sample Design Dossier",
  description:
    "See what the Anvil engine produces from a paragraph of plain English: a buildable design, costed bill of materials, financial model, engineering drawings, worked calculations and regulatory register.",
  openGraph: {
    title: "Sample Design Dossier — Smart Agricultural Irrigation System",
    description:
      "A buildable design, costed bill of materials, financial model, engineering drawings, worked calculations and regulatory register, built by the Anvil engine.",
    type: "website",
    url: "https://fractionalforge.app/sample-package",
    siteName: "Fractional Forge",
  },
  alternates: {
    canonical: "https://fractionalforge.app/sample-package",
  },
}

// ─── Data ──────────────────────────────────────────────────────────────────

const BOM_ROWS = [
  {
    component: "SIM868 GSM/GPRS + GPS Module",
    material: "IC / SMD",
    cost1k: "$4.20",
    cost10k: "$3.10",
    cost100k: "$2.40",
  },
  {
    component: "UV-Resistant Polycarbonate Enclosure",
    material: "Polycarbonate (PC)",
    cost1k: "$6.80",
    cost10k: "$4.50",
    cost100k: "$3.20",
  },
  {
    component: "10W Monocrystalline Solar Panel",
    material: "Silicon / Aluminium frame",
    cost1k: "$8.50",
    cost10k: "$6.20",
    cost100k: "$4.80",
  },
  {
    component: "Capacitive Soil Moisture Sensor",
    material: "FR4 PCB / Corrosion-resistant",
    cost1k: "$2.90",
    cost10k: "$1.80",
    cost100k: "$1.20",
  },
  {
    component: "18650 Li-Ion Battery Pack (7-day)",
    material: "Lithium-ion cells",
    cost1k: "$11.00",
    cost10k: "$8.40",
    cost100k: "$6.50",
  },
] as const

const DFM_RECOMMENDATIONS = [
  {
    title: "Local Assembly in East Africa",
    description:
      "Design for assembly in Kenya or Uganda to reduce import duties by up to 25% and support local supply chains.",
  },
  {
    title: "Replace Custom Connectors",
    description:
      "Automotive-grade weatherproof connectors reduce per-unit cost by 30% vs custom alternatives, with better availability.",
  },
  {
    title: "Standard Enclosures Over Custom Tooling",
    description:
      "Off-the-shelf weather-resistant enclosures (rated to Ingress Protection 65) eliminate $15,000+ in injection mould tooling costs for initial production runs.",
  },
  {
    title: "Field-Repairable Design",
    description:
      "All components accessible with basic tools available in rural hardware shops. No specialised equipment required.",
  },
] as const

interface Competitor {
  name: string
  price: string
  iot: string
  positioning: string
  highlight?: boolean
}

// "iot" column captures whether the product has internet-of-things connectivity
// (sensors plus remote data link). Header label kept short for table layout.
const COMPETITORS: readonly Competitor[] = [
  {
    name: "SunCulture RainMaker2",
    price: "$450",
    iot: "Yes",
    positioning: "Premium",
  },
  {
    name: "iSense Controller",
    price: "$250",
    iot: "Limited",
    positioning: "Mid-range",
  },
  {
    name: "Basic Drip Kit",
    price: "$80",
    iot: "No",
    positioning: "Budget",
  },
  {
    name: "This product (Anvil output)",
    price: "$95-100",
    iot: "Full 2G and narrowband cellular",
    positioning: "Smart and affordable",
    highlight: true,
  },
]

const CERTIFICATIONS = [
  "Conformité Européenne (CE) marking for electronic components",
  "Ingress Protection rating 65 testing for water and dust resistance",
  "Federal Communications Commission and local telecom approval for 2G mobile modules",
  "Solar panel efficiency certification",
  "Restriction of Hazardous Substances (RoHS) compliance for European Union export",
] as const

const ARCHITECTURE_SPECS = [
  { label: "Form Factor", value: "300mm x 200mm x 100mm control unit + wireless sensor nodes" },
  { label: "Housing", value: "Ultraviolet-resistant polycarbonate, standard enclosures" },
  { label: "Water-Contact Parts", value: "Stainless steel and brass" },
  { label: "Total Components", value: "Under 50 parts" },
  { label: "Connectivity", value: "Dual 2G mobile and narrowband cellular with short-message fallback" },
  { label: "Power", value: "Solar-powered with 7-day battery backup" },
] as const

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SamplePackagePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />

      <main className="flex-1 px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="mx-auto max-w-5xl space-y-16 sm:space-y-24">
          {/* ── Hero ──────────────────────────────────────────────── */}
          <section className="pt-8 sm:pt-12 space-y-6">
            <div className="space-y-4">
              <Badge variant="brand" size="lg">
                Sample Design Dossier
              </Badge>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
                Smart agricultural irrigation system
              </h1>
              <p className="max-w-2xl text-lg sm:text-xl text-muted-foreground leading-relaxed">
                This Design Dossier for a sensor-equipped irrigation controller
                was built by the Anvil engine from a paragraph of plain English,
                using open engineering libraries and real component prices. It
                shows the buildable design, costs and engineering evidence
                delivered within a few days.
              </p>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Delivery", value: "A few days" },
                { label: "Components Specified", value: "47" },
                { label: "Workbook", value: "Live Excel" },
                { label: "Target Unit Cost", value: "<$100" },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="pt-4 pb-4 text-center">
                    <p className="text-2xl font-bold text-international-orange">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stat.label}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── The Brief ─────────────────────────────────────────── */}
          <section className="space-y-6">
            <SectionHeader
              icon={ClipboardList}
              label="The Brief"
              title="What the founder described"
            />
            <Card>
              <CardContent className="pt-6">
                <p className="mb-4 text-sm text-muted-foreground">
                  The founder submitted this plain-English description:
                </p>
                <ul className="space-y-2">
                  {[
                    "Solar-powered with 7-day battery backup",
                    "Short-message and 2G mobile connectivity for remote monitoring",
                    "Soil moisture sensors with 50m wireless range",
                    "Weather-resistant housing rated to Ingress Protection 65",
                    "Target cost: under $100 at 10,000 units",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* ── Product Architecture ──────────────────────────────── */}
          <section className="space-y-6">
            <SectionHeader
              icon={Layers}
              label="Section 1"
              title="Product Architecture"
            />
            <p className="text-muted-foreground">
              Modular design optimised for low-cost manufacturing and
              field serviceability.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {ARCHITECTURE_SPECS.map((spec) => (
                <Card key={spec.label}>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {spec.label}
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {spec.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Bill of materials ─────────────────────────────────── */}
          <section className="space-y-6">
            <SectionHeader
              icon={Box}
              label="Section 2"
              title="Bill of materials preview"
            />
            <p className="text-muted-foreground">
              Cost modelling at three production volumes. The full bill of
              materials includes 47 line items — here are the key components.
            </p>
            <Card>
              <CardContent className="pt-0 pb-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-3 pr-4 font-semibold text-foreground">
                        Component
                      </th>
                      <th className="py-3 pr-4 font-semibold text-foreground hidden sm:table-cell">
                        Material
                      </th>
                      <th className="py-3 pr-4 text-right font-semibold text-foreground">
                        1K
                      </th>
                      <th className="py-3 pr-4 text-right font-semibold text-foreground">
                        10K
                      </th>
                      <th className="py-3 text-right font-semibold text-foreground">
                        100K
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {BOM_ROWS.map((row) => (
                      <tr key={row.component} className="border-b last:border-0">
                        <td className="py-3 pr-4 text-foreground">
                          {row.component}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground hidden sm:table-cell">
                          {row.material}
                        </td>
                        <td className="py-3 pr-4 text-right text-muted-foreground">
                          {row.cost1k}
                        </td>
                        <td className="py-3 pr-4 text-right text-foreground font-medium">
                          {row.cost10k}
                        </td>
                        <td className="py-3 text-right text-muted-foreground">
                          {row.cost100k}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">
              Prices are indicative and based on real component catalogue data
              available at the time of generation.
            </p>
          </section>

          {/* ── Design-for-manufacturing analysis ─────────────────── */}
          <section className="space-y-6">
            <SectionHeader
              icon={Zap}
              label="Section 3"
              title="Design-for-manufacturing highlights"
            />
            <p className="text-muted-foreground">
              Design-for-manufacturing recommendations that reduce cost and
              improve producibility.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {DFM_RECOMMENDATIONS.map((rec) => (
                <Card key={rec.title}>
                  <CardContent className="pt-5 pb-5 space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {rec.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {rec.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Competitive Benchmarking ──────────────────────────── */}
          <section className="space-y-6">
            <SectionHeader
              icon={Scale}
              label="Section 4"
              title="Competitive Benchmarking"
            />
            <p className="text-muted-foreground">
              Market positioning analysis against existing solutions.
            </p>
            <Card>
              <CardContent className="pt-0 pb-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-3 pr-4 font-semibold text-foreground">
                        Product
                      </th>
                      <th className="py-3 pr-4 text-right font-semibold text-foreground">
                        Price
                      </th>
                      <th className="py-3 pr-4 font-semibold text-foreground hidden sm:table-cell">
                        Connectivity
                      </th>
                      <th className="py-3 font-semibold text-foreground">
                        Positioning
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPETITORS.map((comp) => (
                      <tr
                        key={comp.name}
                        className={
                          comp.highlight
                            ? "border-b last:border-0 bg-international-orange/5"
                            : "border-b last:border-0"
                        }
                      >
                        <td className="py-3 pr-4 text-foreground font-medium">
                          {comp.name}
                          {comp.highlight && (
                            <Badge
                              variant="brand"
                              size="sm"
                              className="ml-2"
                            >
                              Fractional Forge
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right text-foreground">
                          {comp.price}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground hidden sm:table-cell">
                          {comp.iot}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {comp.positioning}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </section>

          {/* ── Certification Roadmap ─────────────────────────────── */}
          <section className="space-y-6">
            <SectionHeader
              icon={ShieldCheck}
              label="Section 5"
              title="Certification Roadmap"
            />
            <p className="text-muted-foreground">
              Regulatory pathway mapped automatically based on product type,
              target markets, and component selection.
            </p>
            <Card>
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {CERTIFICATIONS.map((cert) => (
                    <li
                      key={cert}
                      className="flex items-start gap-3 text-sm text-foreground"
                    >
                      <FileCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-international-orange" />
                      <span>{cert}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* ── Matched Suppliers ─────────────────────────────────── */}
          <section className="space-y-6">
            <SectionHeader
              icon={Factory}
              label="Section 6"
              title="Traceable engineering record"
            />
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-international-orange">
                    Every
                  </span>
                  <span className="text-lg text-foreground font-medium">
                    number is a traceable formula
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The live Excel workbook links the design, component prices,
                  true cost, financial model, engineering calculations and
                  regulatory risks so that each figure can be checked.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {[
                    "Buildable Design",
                    "Costed Bill of Materials",
                    "Engineering Drawings",
                    "Worked Calculations",
                    "Risk and Regulatory Register",
                  ].map((cap) => (
                    <Badge key={cap} variant="outline" size="sm">
                      {cap}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Comparison Banner ─────────────────────────────────── */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
              Traditional vs Fractional Forge
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Traditional Approach
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>4–8 weeks timeline</li>
                    <li>£5,000–£15,000 in freelance fees</li>
                    <li>Multiple freelancers to coordinate</li>
                    <li>Static deliverables</li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-international-orange/30">
                <CardContent className="pt-6 space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-international-orange">
                    With Fractional Forge
                  </h3>
                  <ul className="space-y-2 text-sm text-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      Delivered within a few days
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      £2,500 per Design Dossier
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      Built by the Anvil engine
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      Live Excel workbook with traceable formulas
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── CTA ───────────────────────────────────────────────── */}
          <section className="text-center space-y-6 py-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Get your own Design Dossier
            </h2>
            <p className="mx-auto max-w-lg text-muted-foreground">
              Describe your idea in a short brief. The Anvil engine builds a
              live Excel workbook containing a buildable design, costed bill of
              materials, true cost and financial model, engineering drawings,
              worked calculations, and a risk and regulatory register. It is
              delivered within a few days. Fractional Forge does not review the
              engineering, so your own engineers should check it.
            </p>
            <Link
              href="/brief"
              className="inline-flex items-center gap-2 rounded-lg bg-international-orange px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start a brief
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-xs text-muted-foreground">
              £2,500 per Design Dossier, or £6,000 a month for up to three.
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}

// ─── Section Header Component ──────────────────────────────────────────────

/**
 * @description Consistent section header with icon accent bar,
 * section label, and title.
 */
function SectionHeader({
  icon: Icon,
  label,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  title: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-international-orange/10">
          <Icon className="h-4 w-4 text-international-orange" />
        </div>
        <span className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
        {title}
      </h2>
    </div>
  )
}
