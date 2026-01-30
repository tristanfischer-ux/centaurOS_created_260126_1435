// @ts-nocheck
'use client'

import { useState, useEffect, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Badge } from '@/components/ui/badge'
import { 
  GraduationCap, 
  Calendar,
  Users,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info
} from 'lucide-react'
import { 
  createEnrollment,
  getApprenticeProgrammes,
  getEligibleApprentices,
  getPotentialMentors
} from '@/actions/apprenticeship-enrollment'

interface Programme {
  id: string
  title: string
  level: number
  standard_code: string
  duration_months: number
  otjt_hours_required: number
  description: string
}

interface Person {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  role?: string
}

interface EnrollmentCreateDialogProps {
  foundryId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function EnrollmentCreateDialog({ 
  foundryId, 
  open, 
  onOpenChange,
  onSuccess 
}: EnrollmentCreateDialogProps) {
  const [loading, setLoading] = useState(true)
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [eligibleApprentices, setEligibleApprentices] = useState<Person[]>([])
  const [potentialMentors, setPotentialMentors] = useState<Person[]>([])
  
  const [selectedApprentice, setSelectedApprentice] = useState<string>('')
  const [selectedProgramme, setSelectedProgramme] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [seniorMentor, setSeniorMentor] = useState<string>('')
  const [workplaceBuddy, setWorkplaceBuddy] = useState<string>('')
  const [weeklyHours, setWeeklyHours] = useState<string>('30')
  const [wageBand, setWageBand] = useState<string>('apprentice_minimum')
  
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      loadData()
      // Reset form
      setSelectedApprentice('')
      setSelectedProgramme('')
      setStartDate(getDefaultStartDate())
      setSeniorMentor('')
      setWorkplaceBuddy('')
      setWeeklyHours('30')
      setWageBand('apprentice_minimum')
      setError(null)
    }
  }, [open, foundryId])

  function getDefaultStartDate() {
    // Default to next Monday
    const date = new Date()
    const day = date.getDay()
    const diff = (8 - day) % 7 || 7 // Days until next Monday
    date.setDate(date.getDate() + diff)
    return date.toISOString().split('T')[0]
  }

  async function loadData() {
    setLoading(true)
    
    const [programmeResult, apprenticeResult, mentorResult] = await Promise.all([
      getApprenticeProgrammes(),
      getEligibleApprentices(foundryId),
      getPotentialMentors(foundryId)
    ])
    
    if (programmeResult.programmes) {
      setProgrammes(programmeResult.programmes as Programme[])
    }
    if (apprenticeResult.apprentices) {
      setEligibleApprentices(apprenticeResult.apprentices)
    }
    if (mentorResult.mentors) {
      setPotentialMentors(mentorResult.mentors)
    }
    
    setLoading(false)
  }

  async function handleSubmit() {
    if (!selectedApprentice || !selectedProgramme || !startDate) {
      setError('Please fill in all required fields')
      return
    }
    
    setError(null)
    
    startTransition(async () => {
      const result = await createEnrollment({
        apprenticeId: selectedApprentice,
        programmeId: selectedProgramme,
        foundryId,
        startDate,
        seniorMentorId: seniorMentor || undefined,
        workplaceBuddyId: workplaceBuddy || undefined,
        weeklyHours: parseInt(weeklyHours),
        wageBand: wageBand as 'apprentice_minimum' | 'national_minimum' | 'living_wage' | 'above_living_wage'
      })
      
      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        onOpenChange(false)
        onSuccess?.()
      }
    })
  }

  const selectedProgrammeData = programmes.find(p => p.id === selectedProgramme)
  const selectedApprenticeData = eligibleApprentices.find(a => a.id === selectedApprentice)
  const selectedMentorData = potentialMentors.find(m => m.id === seniorMentor)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1 w-8 bg-international-orange rounded-full" />
          </div>
          <DialogTitle className="text-xl flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Enroll New Apprentice
          </DialogTitle>
          <DialogDescription>
            Create a new apprenticeship enrollment. This will initialize their learning journey.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Apprentice Selection */}
            <div className="space-y-2">
              <Label htmlFor="apprentice">
                Select Apprentice <span className="text-destructive" aria-label="required">*</span>
              </Label>
              {eligibleApprentices.length === 0 ? (
                <Card className="border-status-warning bg-status-warning-light">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-status-warning shrink-0" />
                    <div>
                      <p className="font-medium text-sm">No eligible apprentices</p>
                      <p className="text-xs text-muted-foreground">
                        All apprentice users already have active enrollments, or no users have the Apprentice role.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Select value={selectedApprentice} onValueChange={setSelectedApprentice}>
                  <SelectTrigger id="apprentice">
                    <SelectValue placeholder="Choose an apprentice..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleApprentices.map((apprentice) => (
                      <SelectItem key={apprentice.id} value={apprentice.id}>
                        <div className="flex items-center gap-2">
                          <span>{apprentice.full_name}</span>
                          <span className="text-muted-foreground text-xs">({apprentice.email})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {selectedApprenticeData && (
                <Card className="mt-2">
                  <CardContent className="p-3 flex items-center gap-3">
                    <UserAvatar 
                      name={selectedApprenticeData.full_name}
                      avatarUrl={selectedApprenticeData.avatar_url}
                      role="Apprentice"
                      size="md"
                    />
                    <div>
                      <p className="font-medium">{selectedApprenticeData.full_name}</p>
                      <p className="text-sm text-muted-foreground">{selectedApprenticeData.email}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Programme Selection */}
            <div className="space-y-2">
              <Label htmlFor="programme">
                Select Programme <span className="text-destructive" aria-label="required">*</span>
              </Label>
              <Select value={selectedProgramme} onValueChange={setSelectedProgramme}>
                <SelectTrigger id="programme">
                  <SelectValue placeholder="Choose a programme..." />
                </SelectTrigger>
                <SelectContent>
                  {programmes.map((programme) => (
                    <SelectItem key={programme.id} value={programme.id}>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">L{programme.level}</Badge>
                        <span>{programme.title}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedProgrammeData && (
                <Card className="mt-2">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{selectedProgrammeData.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {selectedProgrammeData.standard_code}
                        </p>
                      </div>
                      <Badge>Level {selectedProgrammeData.level}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {selectedProgrammeData.description}
                    </p>
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {selectedProgrammeData.duration_months} months
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {selectedProgrammeData.otjt_hours_required} OTJT hours
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label htmlFor="start-date">
                Start Date <span className="text-destructive" aria-label="required">*</span>
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Learning modules unlock 1 week after start date (Flying Start)
              </p>
            </div>

            {/* Weekly Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weekly-hours">Weekly Working Hours</Label>
                <Select value={weeklyHours} onValueChange={setWeeklyHours}>
                  <SelectTrigger id="weekly-hours">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20 hours (Part-time)</SelectItem>
                    <SelectItem value="25">25 hours</SelectItem>
                    <SelectItem value="30">30 hours (Standard)</SelectItem>
                    <SelectItem value="35">35 hours</SelectItem>
                    <SelectItem value="37">37.5 hours (Full-time)</SelectItem>
                    <SelectItem value="40">40 hours</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  OTJT target: {Math.round(parseInt(weeklyHours) * 0.2)} hrs/week (20%)
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="wage-band">Wage Band</Label>
                <Select value={wageBand} onValueChange={setWageBand}>
                  <SelectTrigger id="wage-band">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apprentice_minimum">Apprentice Minimum</SelectItem>
                    <SelectItem value="national_minimum">National Minimum</SelectItem>
                    <SelectItem value="living_wage">Living Wage</SelectItem>
                    <SelectItem value="above_living_wage">Above Living Wage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Mentor Assignment */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4" />
                Mentor Assignment (Optional)
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="senior-mentor">Senior Mentor</Label>
                  <Select value={seniorMentor} onValueChange={setSeniorMentor}>
                    <SelectTrigger id="senior-mentor">
                      <SelectValue placeholder="Select mentor..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {potentialMentors.map((mentor) => (
                        <SelectItem key={mentor.id} value={mentor.id}>
                          {mentor.full_name} ({mentor.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="workplace-buddy">Workplace Buddy</Label>
                  <Select value={workplaceBuddy} onValueChange={setWorkplaceBuddy}>
                    <SelectTrigger id="workplace-buddy">
                      <SelectValue placeholder="Select buddy..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {potentialMentors.map((mentor) => (
                        <SelectItem key={mentor.id} value={mentor.id}>
                          {mentor.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <Card className="border-destructive bg-status-error-light">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!selectedApprentice || !selectedProgramme || !startDate || isPending || loading}
            className="bg-international-orange hover:bg-international-orange-hover"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Create Enrollment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
