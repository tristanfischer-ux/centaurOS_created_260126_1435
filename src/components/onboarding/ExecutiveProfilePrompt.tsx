'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Briefcase, Sparkles, Target, Clock, ArrowRight, X, Check } from 'lucide-react'
import { toast } from 'sonner'

const PROFILE_PROMPT_KEY = 'centauros:executive:profile_prompt_dismissed'

interface ExecutiveProfilePromptProps {
  userRole?: string
  hasCompletedProfile?: boolean
  onComplete?: () => void
}

const expertiseAreas = [
  'Product Strategy',
  'Engineering Leadership',
  'Operations',
  'Finance & Accounting',
  'Sales & BD',
  'Marketing',
  'HR & People Ops',
  'Legal & Compliance',
  'Manufacturing',
  'Supply Chain',
  'Design & UX',
  'Data & Analytics',
]

export function ExecutiveProfilePrompt({ 
  userRole,
  hasCompletedProfile = false,
  onComplete 
}: ExecutiveProfilePromptProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedExpertise, setSelectedExpertise] = useState<string[]>([])
  const [bio, setBio] = useState('')
  const [availability, setAvailability] = useState('10-20')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    // Only show for Executives who haven't completed their profile
    if (userRole !== 'Executive') return
    if (hasCompletedProfile) return

    // Check if user has dismissed this prompt before
    const dismissed = localStorage.getItem(PROFILE_PROMPT_KEY)
    if (dismissed) return

    // Show prompt after a short delay
    const timer = setTimeout(() => setIsOpen(true), 2000)
    return () => clearTimeout(timer)
  }, [userRole, hasCompletedProfile])

  const handleDismiss = () => {
    localStorage.setItem(PROFILE_PROMPT_KEY, 'true')
    setIsOpen(false)
  }

  const handleSubmit = async () => {
    if (selectedExpertise.length === 0) {
      toast.error('Please select at least one area of expertise')
      return
    }

    setIsSubmitting(true)
    try {
      // Call API to update profile
      const response = await fetch('/api/profile/executive-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expertise: selectedExpertise,
          bio,
          availability_hours: availability,
        }),
      })

      if (response.ok) {
        toast.success('Profile updated! You\'re ready to start working with ventures.')
        localStorage.setItem(PROFILE_PROMPT_KEY, 'true')
        setIsOpen(false)
        onComplete?.()
      } else {
        toast.error('Failed to update profile. Please try again.')
      }
    } catch (error) {
      console.error('Profile update error:', error)
      toast.error('Failed to update profile. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleExpertise = (area: string) => {
    setSelectedExpertise(prev => 
      prev.includes(area) 
        ? prev.filter(a => a !== area)
        : [...prev, area]
    )
  }

  const completionPercentage = Math.min(100, 
    (selectedExpertise.length > 0 ? 40 : 0) +
    (bio.length > 20 ? 40 : bio.length > 0 ? 20 : 0) +
    20 // availability always has a default
  )

  if (userRole !== 'Executive') return null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
              Complete Your Profile
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-xs h-8">
              Skip for now
            </Button>
          </div>
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-4">
            <Briefcase className="h-6 w-6 text-orange-600" />
          </div>
          <DialogTitle className="text-xl">Set Up Your Executive Profile</DialogTitle>
          <DialogDescription className="text-base">
            Help us match you with the right ventures. Your expertise will be visible to founders looking for fractional executives.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Progress indicator */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Profile Completion</span>
              <span>{completionPercentage}%</span>
            </div>
            <Progress value={completionPercentage} className="h-2" />
          </div>

          {/* Expertise Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-500" />
              Areas of Expertise
            </Label>
            <div className="flex flex-wrap gap-2">
              {expertiseAreas.map((area) => (
                <button
                  key={area}
                  onClick={() => toggleExpertise(area)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                    selectedExpertise.includes(area)
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-orange-500/50'
                  }`}
                >
                  {selectedExpertise.includes(area) && (
                    <Check className="h-3 w-3 inline mr-1" />
                  )}
                  {area}
                </button>
              ))}
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio" className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-orange-500" />
              Professional Summary
            </Label>
            <Textarea
              id="bio"
              placeholder="Brief summary of your background and what you bring to ventures..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {bio.length}/200 characters
            </p>
          </div>

          {/* Availability */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              Weekly Availability
            </Label>
            <div className="flex gap-2">
              {['5-10', '10-20', '20-30', '30+'].map((hours) => (
                <button
                  key={hours}
                  onClick={() => setAvailability(hours)}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded border transition-all ${
                    availability === hours
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-orange-500/50'
                  }`}
                >
                  {hours} hrs
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2 mt-4">
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="flex-1 sm:flex-initial"
          >
            Later
          </Button>
          <Button 
            onClick={handleSubmit} 
            className="flex-1 sm:flex-initial bg-orange-600 hover:bg-orange-700"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Complete Profile'}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
