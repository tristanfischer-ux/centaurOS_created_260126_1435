// @ts-nocheck
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { logOTJTTime } from '@/actions/otjt-tracking'
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@/types/apprenticeship'
import { toast } from 'sonner'
import { Clock, Loader2, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface OTJTLoggerDialogProps {
  enrollmentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OTJTLoggerDialog({ enrollmentId, open, onOpenChange }: OTJTLoggerDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    logDate: new Date().toISOString().split('T')[0],
    hours: '',
    activityType: '' as ActivityType | '',
    description: '',
    learningOutcomes: ''
  })
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.activityType) {
      toast.error('Please select an activity type')
      return
    }
    
    if (!formData.hours || parseFloat(formData.hours) <= 0) {
      toast.error('Please enter valid hours')
      return
    }
    
    setIsLoading(true)
    
    const result = await logOTJTTime({
      enrollmentId,
      logDate: formData.logDate,
      hours: parseFloat(formData.hours),
      activityType: formData.activityType,
      description: formData.description || undefined,
      learningOutcomes: formData.learningOutcomes || undefined
    })
    
    setIsLoading(false)
    
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('OTJT hours logged! Awaiting mentor approval.')
      onOpenChange(false)
      // Reset form
      setFormData({
        logDate: new Date().toISOString().split('T')[0],
        hours: '',
        activityType: '',
        description: '',
        learningOutcomes: ''
      })
    }
  }
  
  const activityTypes = Object.entries(ACTIVITY_TYPE_LABELS) as [ActivityType, { label: string; description: string }][]
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Log OTJT Hours
          </DialogTitle>
          <DialogDescription>
            Record your off-the-job training hours. Your mentor will review and approve.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="logDate">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="logDate"
                type="date"
                value={formData.logDate}
                onChange={(e) => setFormData({ ...formData, logDate: e.target.value })}
                max={new Date().toISOString().split('T')[0]}
                required
                aria-required="true"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hours">
                Hours <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hours"
                type="number"
                step="0.5"
                min="0.5"
                max="8"
                placeholder="e.g., 2.5"
                value={formData.hours}
                onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                required
                aria-required="true"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="activityType">
              Activity Type <span className="text-destructive">*</span>
            </Label>
            <Select 
              value={formData.activityType} 
              onValueChange={(value) => setFormData({ ...formData, activityType: value as ActivityType })}
              required
            >
              <SelectTrigger id="activityType">
                <SelectValue placeholder="Select activity type" />
              </SelectTrigger>
              <SelectContent>
                {activityTypes.map(([value, { label, description }]) => (
                  <SelectItem key={value} value={value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">{description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What training activity did you do?"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="learningOutcomes">Learning Outcomes</Label>
            <Textarea
              id="learningOutcomes"
              placeholder="What did you learn? What skills did you develop?"
              value={formData.learningOutcomes}
              onChange={(e) => setFormData({ ...formData, learningOutcomes: e.target.value })}
              rows={2}
            />
          </div>
          
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>OTJT Requirements:</strong> Must be new learning (not just doing your job), 
              during paid work hours, and relevant to your apprenticeship standard.
            </AlertDescription>
          </Alert>
          
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Logging...
                </>
              ) : (
                'Log Hours'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
