/**
 * @file finance-section-intro.tsx — Client component for the Finance section intro page
 *
 * @description Wraps the shared SectionIntroPage with finance section data,
 * plus a financial health narrative and quick-start links.
 */

'use client'

import Link from 'next/link'
import {
  PoundSterling,
  BarChart3,
  FileText,
  Map,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'

import { SectionIntroPage } from '@/components/sidebar/SectionIntroPage'
import { getSectionById } from '@/lib/features/section-registry'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const section = getSectionById('finance')!

const FINANCIAL_FLOW = [
  {
    icon: PoundSterling,
    title: 'See your financial health',
    description: 'Cash position, revenue, expenses, and margins — all in one dashboard.',
    href: '/finance',
    label: 'Overview',
    accent: 'bg-international-orange/10 text-international-orange',
    ring: 'ring-international-orange/20',
  },
  {
    icon: Map,
    title: 'Map your money',
    description: 'Visualise revenue streams and cost structures with the Money Map.',
    href: '/finance/money-map',
    label: 'Money Map',
    accent: 'bg-status-success/10 text-status-success',
    ring: 'ring-status-success/20',
  },
  {
    icon: FileText,
    title: 'Track your invoices',
    description: 'Monitor outstanding payments, aging buckets, and overdue amounts.',
    href: '/finance/invoices',
    label: 'Invoices',
    accent: 'bg-electric-blue/10 text-electric-blue',
    ring: 'ring-electric-blue/20',
  },
] as const

export function FinanceSectionIntro(): React.ReactElement {
  return (
    <div className="space-y-0">
      <SectionIntroPage section={section} />

      {/* Financial Flow — the core narrative */}
      <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-2">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
          Your financial command centre
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FINANCIAL_FLOW.map((step, index) => {
            const Icon = step.icon
            return (
              <Link key={step.label} href={step.href} className="group block">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step.accent} font-semibold text-sm shrink-0 ring-1 ${step.ring} group-hover:scale-110 transition-transform`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {index < FINANCIAL_FLOW.length - 1 && (
                      <div className="w-0.5 flex-1 bg-muted mt-2 hidden md:block" />
                    )}
                  </div>
                  <div className="pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors">
                        {step.title}
                      </h3>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Dashboard Showcase */}
      <div className="px-4 sm:px-6 lg:px-8 pt-8">
        <Link href="/finance" className="block group">
          <Card className="rounded-xl border-0 shadow-lg overflow-hidden bg-gradient-to-br from-international-orange/[0.06] via-background to-status-success/[0.04] hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <CardContent className="pt-8 pb-8 px-8">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-international-orange/10">
                      <BarChart3 className="h-4 w-4 text-international-orange" />
                    </div>
                    <span className="text-xs font-mono uppercase tracking-widest text-international-orange">
                      Dashboard
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground group-hover:text-international-orange transition-colors">
                    Financial Overview
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                    See your complete financial picture — cash position, revenue trends,
                    expense breakdown, and outstanding invoices all in one place.
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-international-orange hover:bg-international-orange/90"
                      tabIndex={-1}
                    >
                      <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                      View Dashboard
                    </Button>
                  </div>
                </div>
                {/* Visual preview — abstract chart illustration */}
                <div className="hidden md:flex items-center justify-center w-48 h-32">
                  <svg viewBox="0 0 200 120" className="w-full h-full" aria-hidden="true">
                    {/* Revenue bars */}
                    <rect x="20" y="60" width="20" height="50" rx="4" fill="hsl(var(--status-success))" opacity="0.3" />
                    <rect x="50" y="45" width="20" height="65" rx="4" fill="hsl(var(--status-success))" opacity="0.4" />
                    <rect x="80" y="30" width="20" height="80" rx="4" fill="hsl(var(--status-success))" opacity="0.5" />
                    <rect x="110" y="20" width="20" height="90" rx="4" fill="hsl(var(--status-success))" opacity="0.6" />
                    <rect x="140" y="15" width="20" height="95" rx="4" fill="hsl(var(--status-success))" opacity="0.7" />
                    {/* Trend line */}
                    <path d="M30,55 L60,40 L90,25 L120,15 L150,10" stroke="hsl(var(--international-orange))" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    {/* Dots on trend */}
                    <circle cx="30" cy="55" r="3" fill="hsl(var(--international-orange))" />
                    <circle cx="60" cy="40" r="3" fill="hsl(var(--international-orange))" />
                    <circle cx="90" cy="25" r="3" fill="hsl(var(--international-orange))" />
                    <circle cx="120" cy="15" r="3" fill="hsl(var(--international-orange))" />
                    <circle cx="150" cy="10" r="3" fill="hsl(var(--international-orange))" />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Money Map Discovery */}
      <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <Link href="/finance/money-map" className="block group">
          <Card className="border border-dashed border-status-success/20 hover:border-status-success/40 hover:shadow-md hover:-translate-y-0.5 transition-all bg-gradient-to-br from-background to-status-success/[0.02]">
            <CardContent className="pt-5 pb-4 flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-status-success/10 shrink-0 group-hover:bg-status-success/20 transition-colors">
                <Map className="h-5 w-5 text-status-success" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground group-hover:text-status-success transition-colors">
                  Already using Money Map? It&apos;s here too
                </p>
                <p className="text-xs text-muted-foreground">
                  Your revenue streams and cost items now power the Finance dashboard
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-status-success transition-colors shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
