'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Focus, Clock, Bell, BellOff, Zap } from 'lucide-react'
import { usePresenceContext } from '@/components/PresenceProvider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, addHours, addMinutes } from 'date-fns'

const durationOptions = [
    { value: '30', label: '30 minutes' },
    { value: '60', label: '1 hour' },
    { value: '90', label: '1.5 hours' },
    { value: '120', label: '2 hours' },
    { value: '180', label: '3 hours' },
    { value: '240', label: '4 hours' },
    { value: 'custom', label: 'Custom...' },
]

interface FocusModeToggleProps {
    compact?: boolean
    showLabel?: boolean
    className?: string
}

export function FocusModeToggle({ compact = false, showLabel = true, className }: FocusModeToggleProps) {
    const { myPresence, goFocus, goOnline } = usePresenceContext()
    const [showDialog, setShowDialog] = useState(false)
    const [duration, setDuration] = useState('60')
    const [customMinutes, setCustomMinutes] = useState('60')
    const [statusMessage, setStatusMessage] = useState('Deep work - will respond later')

    const isFocusMode = myPresence?.status === 'focus'
    const focusUntil = myPresence?.focus_until ? new Date(myPresence.focus_until) : null

    const handleToggle = () => {
        if (isFocusMode) {
            goOnline()
            toast.success('Focus mode ended')
        } else {
            setShowDialog(true)
        }
    }

    const handleStartFocus = () => {
        const minutes = duration === 'custom' ? parseInt(customMinutes) : parseInt(duration)
        
        // Update presence with focus status and message
        goFocus(statusMessage)
        
        toast.success(`Focus mode enabled for ${minutes} minutes`, {
            description: 'Notifications will be muted'
        })
        setShowDialog(false)
    }

    // Auto-end focus mode when time expires
    useEffect(() => {
        if (focusUntil && focusUntil <= new Date()) {
            goOnline()
            toast.info('Focus mode ended automatically')
        }
    }, [focusUntil, goOnline])

    if (compact) {
        return (
            <button
                onClick={handleToggle}
                className={cn(
                    'relative p-2 rounded-full transition-colors',
                    isFocusMode 
                        ? 'bg-purple-100 text-purple-600 hover:bg-purple-200' 
                        : 'hover:bg-muted text-muted-foreground',
                    className
                )}
                title={isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'}
            >
                <Focus className="h-5 w-5" />
                {isFocusMode && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-purple-500 rounded-full animate-pulse" />
                )}
            </button>
        )
    }

    return (
        <>
            <div className={cn('flex items-center gap-3', className)}>
                <Switch
                    checked={isFocusMode}
                    onCheckedChange={handleToggle}
                    className={isFocusMode ? 'data-[state=checked]:bg-purple-600' : ''}
                />
                {showLabel && (
                    <div className="flex items-center gap-2">
                        <Focus className={cn(
                            'h-4 w-4',
                            isFocusMode ? 'text-purple-600' : 'text-muted-foreground'
                        )} />
                        <span className={cn(
                            'text-sm font-medium',
                            isFocusMode ? 'text-purple-600' : 'text-foreground'
                        )}>
                            Focus Mode
                        </span>
                        {isFocusMode && (
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">
                                Active
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            {/* Focus Mode Setup Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="sm:max-w-[400px] bg-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                            <Focus className="h-5 w-5 text-purple-600" />
                            Enter Focus Mode
                        </DialogTitle>
                        <DialogDescription>
                            Mute notifications and let your team know you're doing deep work
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Duration</Label>
                            <Select value={duration} onValueChange={setDuration}>
                                <SelectTrigger className="bg-background">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {durationOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {duration === 'custom' && (
                                <div className="flex items-center gap-2 mt-2">
                                    <Input
                                        type="number"
                                        value={customMinutes}
                                        onChange={(e) => setCustomMinutes(e.target.value)}
                                        min={15}
                                        max={480}
                                        className="w-24 bg-white"
                                    />
                                    <span className="text-sm text-muted-foreground">minutes</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <Label>Status Message</Label>
                            <Input
                                value={statusMessage}
                                onChange={(e) => setStatusMessage(e.target.value)}
                                placeholder="What are you working on?"
                                className="bg-background"
                            />
                            <p className="text-xs text-muted-foreground">
                                Shown to team members who try to message you
                            </p>
                        </div>

                        <div className="bg-purple-50 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                                <BellOff className="h-4 w-4 text-purple-600" />
                                <span className="text-purple-800">Notifications will be muted</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <Zap className="h-4 w-4 text-amber-500" />
                                <span className="text-purple-800">Urgent messages can still break through</span>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowDialog(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleStartFocus}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            <Focus className="h-4 w-4 mr-2" />
                            Start Focus Mode
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

// Indicator component for showing focus mode status in various places
export function FocusModeIndicator({ 
    isFocusMode, 
    focusMessage,
    size = 'md' 
}: { 
    isFocusMode: boolean
    focusMessage?: string | null
    size?: 'sm' | 'md' | 'lg'
}) {
    if (!isFocusMode) return null

    const sizeClasses = {
        sm: 'text-xs px-1.5 py-0.5',
        md: 'text-xs px-2 py-1',
        lg: 'text-sm px-3 py-1.5'
    }

    return (
        <Badge 
            variant="secondary" 
            className={cn(
                'bg-purple-100 text-purple-700 border-purple-200',
                sizeClasses[size]
            )}
        >
            <Focus className={cn(
                'mr-1',
                size === 'sm' ? 'h-3 w-3' : size === 'md' ? 'h-3.5 w-3.5' : 'h-4 w-4'
            )} />
            Focus Mode
        </Badge>
    )
}

// Urgent message override component (for founders/executives to break through)
interface UrgentOverrideProps {
    recipientId: string
    recipientName: string
    onSend: (message: string) => void
    isLoading?: boolean
}

export function UrgentOverrideButton({ 
    recipientId, 
    recipientName, 
    onSend,
    isLoading 
}: UrgentOverrideProps) {
    const [showDialog, setShowDialog] = useState(false)
    const [message, setMessage] = useState('')

    const handleSend = () => {
        if (!message.trim()) {
            toast.error('Please enter a message')
            return
        }
        onSend(message)
        setMessage('')
        setShowDialog(false)
    }

    return (
        <>
            <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDialog(true)}
                className="text-amber-600 border-amber-200 hover:bg-amber-50"
            >
                <Zap className="h-3 w-3 mr-1" />
                Urgent
            </Button>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="sm:max-w-[400px] bg-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                            <Zap className="h-5 w-5 text-amber-500" />
                            Send Urgent Message
                        </DialogTitle>
                        <DialogDescription>
                            {recipientName} is in focus mode. This will send a high-priority notification that breaks through.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4">
                        <Label>Message</Label>
                        <Input
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="What's urgent?"
                            className="mt-2 bg-white"
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowDialog(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSend}
                            disabled={isLoading || !message.trim()}
                            className="bg-amber-500 hover:bg-amber-600 text-white"
                        >
                            <Zap className="h-4 w-4 mr-2" />
                            Send Urgent
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
