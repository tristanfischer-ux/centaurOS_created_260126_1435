'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EnrollmentCreateDialog } from './enrollment-create-dialog'
import { FundingCalculator } from './funding-calculator'
import {
  GraduationCap,
  PoundSterling,
  Users,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  BookOpen,
  ClipboardCheck,
  Award,
  Building2,
  Clock,
  TrendingUp,
} from 'lucide-react'

interface DiscoverLandingProps {
  /** The user's foundry ID, used when opening the enrollment dialog */
  foundryId?: string
  /** Whether the user can enroll apprentices (Executive/Founder) */
  canEnroll: boolean
  /** Number of programmes available (from DB) */
  programmeCount: number
  /** Callback to switch to the Programmes tab */
  onBrowseProgrammes: () => void
}

/**
 * Employer-facing landing page that sells the value of apprenticeships.
 *
 * @description Shown to Founders/Executives who don't yet have apprentices,
 * and to Apprentices who aren't yet enrolled. Covers the business case,
 * how it works, funding, and CTAs to get started.
 */
export function DiscoverLanding({
  foundryId,
  canEnroll,
  programmeCount,
  onBrowseProgrammes,
}: DiscoverLandingProps) {
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)

  return (
    <div className="space-y-12">
      {/* Hero Banner */}
      <div className="text-center max-w-3xl mx-auto space-y-4 pt-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-international-orange/10 rounded-full text-sm font-medium text-international-orange">
          <GraduationCap className="h-4 w-4" />
          UK Apprenticeships — Up to 95% Government Funded
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
          Build Your Future Workforce
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          UK Apprenticeships deliver skilled, loyal talent with government funding —
          and CentaurOS manages the entire journey from enrolment to certification.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button size="lg" onClick={onBrowseProgrammes}>
            <BookOpen className="h-4 w-4 mr-2" />
            Browse Programmes
          </Button>
          {canEnroll && foundryId && (
            <Button size="lg" variant="outline" onClick={() => setEnrollDialogOpen(true)}>
              Enroll Your First Apprentice
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {/* Why Apprenticeships — 3-column cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border bg-card">
          <CardContent className="pt-6 space-y-3">
            <div className="h-12 w-12 rounded-xl bg-status-success-light flex items-center justify-center">
              <PoundSterling className="h-6 w-6 text-status-success" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Funded Talent Pipeline</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The UK government covers up to 95% of training costs for SMEs.
              Levy-paying employers draw directly from their existing levy pot.
              No wasted budget — it&apos;s already allocated.
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-card">
          <CardContent className="pt-6 space-y-3">
            <div className="h-12 w-12 rounded-xl bg-electric-blue-light flex items-center justify-center">
              <Users className="h-6 w-6 text-electric-blue" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Develop Loyal Talent</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Apprentices learn YOUR workflows, tools, and culture from day one.
              86% of employers say apprenticeships helped them develop relevant skills.
              Retention rates outperform standard hires.
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-card">
          <CardContent className="pt-6 space-y-3">
            <div className="h-12 w-12 rounded-xl bg-international-orange/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-international-orange" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">CentaurOS Manages Everything</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              OTJT tracking, compliance reporting, progress reviews, legal documents,
              skills assessments — all built in. No external platforms needed.
              One dashboard for the entire apprenticeship lifecycle.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* How It Works — 4-step flow */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-display font-semibold text-foreground">How It Works</h2>
          <p className="text-muted-foreground mt-1">Four steps from discovery to qualification</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              step: 1,
              icon: BookOpen,
              title: 'Choose a Programme',
              desc: `Browse ${programmeCount} UK-accredited programmes from Level 3 to Level 7 — digital marketing to AI specialist.`,
            },
            {
              step: 2,
              icon: Users,
              title: 'Enroll Your Apprentice',
              desc: 'Select from your existing team or hire someone new. Assign a mentor and sign the paperwork — all digital.',
            },
            {
              step: 3,
              icon: ClipboardCheck,
              title: 'They Learn, We Track',
              desc: 'Learning modules, OTJT hours, skills assessments, and progress reviews — tracked automatically.',
            },
            {
              step: 4,
              icon: Award,
              title: 'EPA & Certification',
              desc: 'Gateway readiness tracking and End-Point Assessment preparation lead to a nationally recognised qualification.',
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.step} className="relative">
                <Card className="border bg-card h-full">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-international-orange text-white flex items-center justify-center text-sm font-bold">
                        {item.step}
                      </div>
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      </div>

      {/* Funding Calculator */}
      <FundingCalculator />

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: BookOpen, value: `${programmeCount}`, label: 'Programmes Available' },
          { icon: GraduationCap, value: 'L3 – L7', label: 'Qualification Levels' },
          { icon: Clock, value: '18–36 mo', label: 'Programme Durations' },
          { icon: TrendingUp, value: 'Up to 95%', label: 'Government Funded' },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="p-4 bg-muted/50 rounded-xl text-center">
              <Icon className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* CTA Footer */}
      {canEnroll && foundryId && (
        <Card className="border-international-orange/30 bg-international-orange/5">
          <CardContent className="py-8 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 mx-auto text-international-orange" />
            <h2 className="text-2xl font-display font-semibold text-foreground">
              Ready to get started?
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Enroll your first apprentice in minutes. Choose a programme, assign a mentor,
              and CentaurOS handles the rest.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button size="lg" onClick={() => setEnrollDialogOpen(true)}>
                <GraduationCap className="h-4 w-4 mr-2" />
                Enroll New Apprentice
              </Button>
              <Button size="lg" variant="outline" onClick={onBrowseProgrammes}>
                Browse Programmes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Non-employer CTA */}
      {!canEnroll && (
        <Card className="border bg-muted/30">
          <CardContent className="py-8 text-center space-y-4">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-display font-semibold text-foreground">
              Interested in becoming an apprentice?
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Speak with your manager about apprenticeship options, or browse available
              programmes to find one that matches your career goals.
            </p>
            <Button variant="outline" onClick={onBrowseProgrammes}>
              <BookOpen className="h-4 w-4 mr-2" />
              Browse Programmes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Enrollment Dialog */}
      {foundryId && (
        <EnrollmentCreateDialog
          foundryId={foundryId}
          open={enrollDialogOpen}
          onOpenChange={setEnrollDialogOpen}
        />
      )}
    </div>
  )
}
