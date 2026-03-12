'use client'

/**
 * @file setup-wizard.tsx
 *
 * @description 5-step first-run setup wizard that guides founders through
 * configuring their foundry: mission, team, and first objective. Uses the
 * existing WizardStepper + Dialog components.
 */

import { useState, useTransition } from 'react'
import { Sparkles, Compass, Users, Target, PartyPopper } from 'lucide-react'
import Link from 'next/link'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { WizardStepper, useWizardSteps } from '@/components/ui/wizard-stepper'
import { DatePickerWithShortcuts } from '@/components/ui/date-picker-with-shortcuts'
import { ConfettiCelebration } from '@/components/onboarding/ConfettiCelebration'
import {
  completeSetupWizard,
  saveWizardMission,
  createWizardTeam,
  createWizardObjective,
} from '@/actions/setup-wizard'

import type { WizardStep } from '@/components/ui/wizard-stepper'

const WIZARD_STEPS: WizardStep[] = [
  { id: 'welcome', title: 'Welcome', icon: Sparkles },
  { id: 'mission', title: 'Mission', icon: Compass },
  { id: 'team', title: 'Team', icon: Users },
  { id: 'objective', title: 'Objective', icon: Target },
  { id: 'done', title: 'Done', icon: PartyPopper },
]

interface SetupWizardProps {
  userName: string
  onComplete: () => void
}

/**
 * SetupWizard — 5-step onboarding dialog for new foundry founders.
 *
 * @description Steps: Welcome → Mission → Team → Objective → Done.
 * Each step (2–4) has Skip + Next buttons. Closing the dialog at any
 * point marks onboarding complete so it won't reappear.
 */
export function SetupWizard({ userName, onComplete }: SetupWizardProps) {
  const wizard = useWizardSteps(WIZARD_STEPS)
  const [open, setOpen] = useState(true)
  const [isPending, startTransition] = useTransition()

  // Step 2: Mission
  const [mission, setMission] = useState('')

  // Step 3: Team
  const [teamName, setTeamName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')

  // Step 4: Objective
  const [objectiveTitle, setObjectiveTitle] = useState('')
  const [targetDate, setTargetDate] = useState<Date | undefined>()

  // Step 5: Show confetti
  const [showConfetti, setShowConfetti] = useState(false)

  const handleClose = () => {
    // GOTCHA: On the Done step, completeSetupWizard was already called by
    // finishWizard — don't call it again.
    if (wizard.currentStep === 'done') {
      setOpen(false)
      onComplete()
      return
    }
    startTransition(async () => {
      await completeSetupWizard()
      setOpen(false)
      onComplete()
    })
  }

  const handleSkip = () => {
    wizard.goNext()
  }

  const handleMissionNext = () => {
    if (!mission.trim()) {
      wizard.goNext()
      return
    }
    startTransition(async () => {
      const result = await saveWizardMission(mission)
      if ('error' in result) {
        console.error('[SetupWizard]', result.error)
      }
      wizard.goNext()
    })
  }

  const handleTeamNext = () => {
    if (!teamName.trim()) {
      wizard.goNext()
      return
    }
    startTransition(async () => {
      const result = await createWizardTeam(teamName, inviteEmail || undefined)
      if ('error' in result) {
        console.error('[SetupWizard]', result.error)
      }
      wizard.goNext()
    })
  }

  const handleObjectiveNext = () => {
    if (!objectiveTitle.trim()) {
      finishWizard()
      return
    }
    startTransition(async () => {
      const result = await createWizardObjective(
        objectiveTitle,
        targetDate?.toISOString().split('T')[0]
      )
      if ('error' in result) {
        console.error('[SetupWizard]', result.error)
      }
      finishWizard()
    })
  }

  const finishWizard = () => {
    wizard.goNext()
    setShowConfetti(true)
    startTransition(async () => {
      await completeSetupWizard()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent size="lg" className="gap-0">
        {/* Stepper — hidden on welcome and done steps */}
        {wizard.currentStep !== 'welcome' && wizard.currentStep !== 'done' && (
          <div className="pb-4 border-b mb-4">
            <WizardStepper
              steps={WIZARD_STEPS}
              currentStep={wizard.currentStep}
              completedSteps={wizard.completedSteps}
            />
          </div>
        )}

        {/* Step 1: Welcome */}
        {wizard.currentStep === 'welcome' && (
          <>
            <DialogHeader className="text-center pt-4 pb-2">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-international-orange/10">
                <Sparkles className="h-8 w-8 text-international-orange" />
              </div>
              <DialogTitle className="text-2xl">
                Welcome to ForgeOS, {userName}!
              </DialogTitle>
              <DialogDescription className="text-base mt-2">
                Let&apos;s get your foundry set up in a few quick steps. You can skip any step
                and come back to it later.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center pt-6 pb-2">
              <Button size="lg" onClick={() => wizard.goNext()}>
                Get Started
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Mission */}
        {wizard.currentStep === 'mission' && (
          <>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Compass className="h-5 w-5 text-international-orange" />
                What&apos;s your foundry&apos;s mission?
              </DialogTitle>
              <DialogDescription>
                A short statement about why your company exists. This helps ForgeOS align
                suggestions with your goals.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-mission">Mission statement</Label>
                <Input
                  id="wizard-mission"
                  placeholder="e.g. We make sustainable packaging accessible to every brand"
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  maxLength={300}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-right">
                  {mission.length}/300
                </p>
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={handleSkip} disabled={isPending}>
                Skip
              </Button>
              <Button onClick={handleMissionNext} disabled={isPending}>
                {isPending ? 'Saving...' : 'Next'}
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Team */}
        {wizard.currentStep === 'team' && (
          <>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Users className="h-5 w-5 text-international-orange" />
                Create your first team
              </DialogTitle>
              <DialogDescription>
                Teams organise your people around shared objectives. You can add more members later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-team-name">Team name</Label>
                <Input
                  id="wizard-team-name"
                  placeholder="e.g. Product, Engineering, Leadership"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-invite-email">
                  Invite a teammate <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="wizard-invite-email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={handleSkip} disabled={isPending}>
                Skip
              </Button>
              <Button onClick={handleTeamNext} disabled={isPending}>
                {isPending ? 'Creating...' : 'Next'}
              </Button>
            </div>
          </>
        )}

        {/* Step 4: Objective */}
        {wizard.currentStep === 'objective' && (
          <>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Target className="h-5 w-5 text-international-orange" />
                Set your first objective
              </DialogTitle>
              <DialogDescription>
                What&apos;s one thing you want your team to accomplish? Objectives keep everyone
                aligned on what matters.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-objective-title">Objective title</Label>
                <Input
                  id="wizard-objective-title"
                  placeholder="e.g. Launch MVP by end of Q2"
                  value={objectiveTitle}
                  onChange={(e) => setObjectiveTitle(e.target.value)}
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Target date <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <DatePickerWithShortcuts
                  date={targetDate}
                  onDateChange={setTargetDate}
                  placeholder="When should this be done?"
                />
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => finishWizard()} disabled={isPending}>
                Skip
              </Button>
              <Button onClick={handleObjectiveNext} disabled={isPending}>
                {isPending ? 'Creating...' : 'Finish'}
              </Button>
            </div>
          </>
        )}

        {/* Step 5: Done */}
        {wizard.currentStep === 'done' && (
          <>
            {showConfetti && <ConfettiCelebration />}
            <DialogHeader className="text-center pt-4 pb-2">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <PartyPopper className="h-8 w-8 text-success" />
              </div>
              <DialogTitle className="text-2xl">You&apos;re all set!</DialogTitle>
              <DialogDescription className="text-base mt-2">
                Your foundry is ready to go. Here are some next steps to explore.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4 sm:grid-cols-3">
              <Link href="/objectives" onClick={() => setOpen(false)}>
                <Card className="h-full hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer">
                  <CardContent className="pt-4 pb-4 text-center">
                    <Target className="h-6 w-6 mx-auto mb-2 text-international-orange" />
                    <p className="text-sm font-medium text-foreground">View Objectives</p>
                    <p className="text-xs text-muted-foreground mt-1">Track progress on goals</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/the-forge" onClick={() => setOpen(false)}>
                <Card className="h-full hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer">
                  <CardContent className="pt-4 pb-4 text-center">
                    <Sparkles className="h-6 w-6 mx-auto mb-2 text-international-orange" />
                    <p className="text-sm font-medium text-foreground">Explore The Forge</p>
                    <p className="text-xs text-muted-foreground mt-1">Tools and specialists</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/settings" onClick={() => setOpen(false)}>
                <Card className="h-full hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer">
                  <CardContent className="pt-4 pb-4 text-center">
                    <Compass className="h-6 w-6 mx-auto mb-2 text-international-orange" />
                    <p className="text-sm font-medium text-foreground">Settings</p>
                    <p className="text-xs text-muted-foreground mt-1">Profile and preferences</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
            <div className="flex justify-center pt-2 pb-2">
              <Button onClick={() => { setOpen(false); onComplete() }}>
                Go to Dashboard
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
