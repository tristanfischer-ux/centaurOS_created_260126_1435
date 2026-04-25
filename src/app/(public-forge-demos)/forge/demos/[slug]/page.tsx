/**
 * @file forge/demos/[slug]/page.tsx — /forge/demos/<slug> per-demo detail.
 *
 * @description Per-demo page for each of the five Forge project packs. Shows
 * the cover render, full project name, description, totals-at-a-glance stats,
 * an embedded PDF viewer, and a "Start your own project" call-to-action. No
 * login required.
 *
 * Slugs: bess | haps-wren | vertical-farm | desalination | hedgerow.
 *
 * The embedded viewer uses a native <iframe> with a Download fallback. On
 * mobile, most browsers will prompt for a download instead of rendering inline;
 * the fallback button handles that gracefully.
 *
 * @security Public — no auth check. All assets are static under
 * /public/forge-demos/.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, ArrowRight, Download } from "lucide-react"

import { FORGE_DEMOS, type ForgeDemo } from "@/lib/forge/demo-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Static params — the five slugs are known at build time.
// ---------------------------------------------------------------------------

export function generateStaticParams(): Array<{ slug: string }> {
  return FORGE_DEMOS.map((d) => ({ slug: d.slug }))
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const demo = FORGE_DEMOS.find((d) => d.slug === slug)
  if (!demo) return {}
  return {
    title: `${demo.heading} — Forge demo`,
    description: demo.summary,
    openGraph: {
      title: `${demo.heading} — Forge demo`,
      description: demo.summary,
      type: "website",
    },
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ForgeDemoDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<React.ReactNode> {
  const { slug } = await params
  const demo = FORGE_DEMOS.find((d) => d.slug === slug)
  if (!demo) notFound()

  const isOverBudget = demo.cost.headroomGbp < 0

  return (
    <div className="space-y-10">
      {/* ── Back link ───────────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb">
        <Link
          href="/forge/demos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-international-orange transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All demo projects
        </Link>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
        {/* Cover */}
        <div className="w-full lg:w-48 xl:w-56 shrink-0">
          <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-muted shadow-sm">
            <Image
              src={demo.coverPath}
              alt={`Cover render of the ${demo.heading} project pack`}
              fill
              sizes="(max-width: 1024px) 100vw, 224px"
              className="object-cover object-top"
              priority
            />
          </div>
        </div>

        {/* Title + description */}
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div
              className="mt-1 h-6 w-1 rounded-full bg-international-orange shrink-0"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h1 className="font-playfair text-2xl sm:text-3xl lg:text-4xl font-black text-foreground leading-tight">
                {demo.heading}
                {demo.acronym ? (
                  <span className="font-sans font-normal text-base sm:text-lg text-muted-foreground">
                    {" "}
                    ({demo.acronym})
                  </span>
                ) : null}
              </h1>
              <p className="text-sm sm:text-base font-medium text-muted-foreground">
                {demo.subHeading}
              </p>
            </div>
          </div>

          <p className="text-sm sm:text-base text-foreground leading-relaxed max-w-2xl">
            {demo.description}
          </p>

          <div className="flex gap-3 flex-wrap pt-2">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="gap-1.5"
            >
              <a
                href={demo.pdfPath}
                download
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download pack
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Stats at a glance ───────────────────────────────────────────── */}
      <section aria-labelledby="stats-heading">
        <h2
          id="stats-heading"
          className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4"
        >
          Pack contents at a glance
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile label="Pages" value={demo.stats.pages} />
          <StatTile label="Modules" value={demo.stats.modules} />
          <StatTile label="Key parts" value={demo.stats.keyParts} />
          <StatTile
            label="Bill-of-materials rows"
            value={demo.stats.bomRows}
          />
          <StatTile label="Suppliers" value={demo.stats.suppliers} />
          <StatTile label="Failure modes" value={demo.stats.failureModes} />
          <StatTile label="Open questions" value={demo.stats.openQuestions} />
          <StatTile label="Standards" value={demo.stats.standards} />
          <StatTile label="Specialist reviews" value={demo.stats.reviews} />
        </div>
      </section>

      {/* ── Cost envelope ───────────────────────────────────────────────── */}
      <section aria-labelledby="cost-heading">
        <h2
          id="cost-heading"
          className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4"
        >
          Cost envelope
        </h2>
        <Card className="rounded-xl">
          <CardContent className="py-5 sm:py-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-center">
              {/* Unit cost */}
              <div className="space-y-1">
                <dt className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
                  Unit cost
                </dt>
                <dd className="text-2xl font-black text-foreground">
                  {demo.cost.unit}
                </dd>
              </div>

              {/* Ceiling */}
              <div className="space-y-1">
                <dt className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
                  Declared ceiling
                </dt>
                <dd className="text-2xl font-black text-foreground">
                  {demo.cost.ceiling}
                </dd>
              </div>

              {/* Headroom */}
              <div
                className={cn(
                  "rounded-lg border px-4 py-3 space-y-1",
                  isOverBudget
                    ? "bg-warning/10 border-warning/20"
                    : "bg-success/10 border-success/20",
                )}
              >
                <dt className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
                  Headroom
                </dt>
                <dd
                  className={cn(
                    "text-xl font-black",
                    isOverBudget ? "text-warning" : "text-success",
                  )}
                >
                  {demo.cost.headroomLabel}
                </dd>
                {isOverBudget && (
                  <p className="text-xs text-muted-foreground leading-snug pt-1">
                    The Forge surfaces this gap so you can decide whether to
                    descope, phase the build, or revise the cost ceiling.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Embedded PDF viewer ─────────────────────────────────────────── */}
      <section aria-labelledby="pdf-heading">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2
            id="pdf-heading"
            className="text-xs font-mono uppercase tracking-widest text-muted-foreground"
          >
            Full project pack
          </h2>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={demo.pdfPath} download>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download
            </a>
          </Button>
        </div>

        {/* iframe viewer — renders in-browser on desktop, prompts download on
            most mobile browsers. The Download button above is the fallback. */}
        <div
          className="rounded-xl overflow-hidden border border-border bg-muted"
          style={{ height: "80vh", minHeight: "480px" }}
        >
          <iframe
            src={demo.pdfPath}
            title={`${demo.heading} project pack PDF`}
            className="w-full h-full"
            aria-label={`Embedded ${demo.heading} project pack document`}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          If the document does not display,{" "}
          <a
            href={demo.pdfPath}
            download
            className="underline hover:text-international-orange transition-colors"
          >
            download the PDF directly
          </a>
          .
        </p>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="demo-cta-heading"
        className="rounded-xl border border-border bg-muted/30 px-6 py-8 sm:px-8 sm:py-10 text-center space-y-4"
      >
        <h2
          id="demo-cta-heading"
          className="font-playfair text-xl sm:text-2xl font-black text-foreground"
        >
          Start your own project
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Describe a paragraph — what you want to build, your target cost, how
          it ships. The Forge produces a first-pass plan like this one in twenty
          minutes, then adds detail over the hours after.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="gap-2 bg-international-orange hover:bg-international-orange/90 text-white min-w-[220px]"
          >
            <Link
              href="/signup?from=forge-demos&plan=starter_v2"
            >
              Start your own project
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/login">Already have an account</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          First pass in twenty minutes.{" "}
          <Link
            href="/forge/demos"
            className="underline hover:text-international-orange transition-colors"
          >
            See all five demo projects.
          </Link>
        </p>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatTile — a stat box in the at-a-glance grid
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
}: {
  label: string
  value: number | string
}): React.JSX.Element {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4 flex flex-col gap-1">
        <dt className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground leading-tight">
          {label}
        </dt>
        <dd className="text-xl font-black text-foreground">{value}</dd>
      </CardContent>
    </Card>
  )
}
