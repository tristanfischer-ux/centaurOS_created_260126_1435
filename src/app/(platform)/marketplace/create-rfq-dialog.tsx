"use client"

/**
 * @deprecated This component is deprecated. Use CreateRFQSheet instead.
 * The new component uses the unified RFQCreator with side-by-side preview.
 * This file is kept temporarily for reference and will be removed in a future update.
 */

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { submitRFQ } from "@/actions/marketplace"
import { Loader2, ChevronDown, ChevronUp, Mic, Square } from "lucide-react"
import { toast } from "sonner" // Assuming sonner is used, or I'll use a basic alert if not available

export function CreateRFQDialog() {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [formData, setFormData] = useState({
        title: "",
        specifications: "",
        budget_range: "",
    })
    const [budgetError, setBudgetError] = useState<string | null>(null)
    const [titleError, setTitleError] = useState<string | null>(null)
    const [specsError, setSpecsError] = useState<string | null>(null)

    // Voice recording state
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [recordingDuration, setRecordingDuration] = useState(0)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
            }
        }
    }, [])

    // Budget range validation - accepts formats like "$500 - $1,000", "$500-$1000", "$500 to $1000", etc.
    const validateBudgetRange = (budget: string): boolean => {
        if (!budget || !budget.trim()) return false
        
        // Remove whitespace and convert to lowercase for easier matching
        const cleaned = budget.trim().toLowerCase()
        
        // Pattern: $number (optional separator like -, to, or space) $number
        // Also accepts just a single number with $ prefix
        const budgetPattern = /^\$?\d{1,9}(?:[,\s]?\d{3})*(?:\s*(?:-|to|–)\s*\$?\d{1,9}(?:[,\s]?\d{3})*)?$/i
        
        return budgetPattern.test(cleaned)
    }

    // Voice recording functions
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            mediaRecorderRef.current = new MediaRecorder(stream)
            chunksRef.current = []
            setRecordingDuration(0)

            // Start recording duration timer
            timerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1)
            }, 1000)

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            mediaRecorderRef.current.onstop = async () => {
                // Clear timer
                if (timerRef.current) {
                    clearInterval(timerRef.current)
                    timerRef.current = null
                }

                const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
                await handleVoiceSubmit(audioBlob)
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorderRef.current.start()
            setIsRecording(true)
            toast.info("Recording... Describe your RFQ requirements")
        } catch (error) {
            console.error("Error accessing microphone:", error)
            toast.error("Could not access microphone. Please check permissions.")
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
        }
    }

    async function handleVoiceSubmit(audioBlob: Blob) {
        setIsTranscribing(true)
        const formData = new FormData()
        formData.append('file', audioBlob, 'recording.webm')
        
        try {
            const response = await fetch('/api/rfq/voice', {
                method: 'POST',
                body: formData
            })
            const data = await response.json()
            if (data.title) {
                setFormData(prev => ({
                    ...prev,
                    title: data.title || prev.title,
                    specifications: data.specifications || prev.specifications,
                    budget_range: data.budget_range || prev.budget_range
                }))
                // Auto-expand the advanced section if we have specs
                if (data.specifications) setShowAdvanced(true)
                toast.success("Voice transcription complete!")
            }
        } catch (error) {
            console.error('Voice transcription failed:', error)
            toast.error('Voice transcription failed')
        } finally {
            setIsTranscribing(false)
            setRecordingDuration(0)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        // Reset errors
        setBudgetError(null)
        setTitleError(null)
        setSpecsError(null)

        // Validate title
        if (!formData.title || !formData.title.trim()) {
            setTitleError('Project title is required')
            return
        }

        if (formData.title.trim().length > 200) {
            setTitleError('Project title must be 200 characters or less')
            return
        }

        // Validate budget range (only if provided)
        if (formData.budget_range && formData.budget_range.trim()) {
            if (!validateBudgetRange(formData.budget_range)) {
                setBudgetError('Please enter a valid budget range (e.g., "$500 - $1,000" or "$500-$1000")')
                return
            }
        }

        // Validate specifications (only if provided)
        if (formData.specifications && formData.specifications.trim()) {
            if (formData.specifications.trim().length < 10) {
                setSpecsError('Specifications must be at least 10 characters')
                return
            }

            if (formData.specifications.trim().length > 5000) {
                setSpecsError('Specifications must be 5,000 characters or less')
                return
            }
        }

        setIsLoading(true)

        try {
            const result = await submitRFQ(formData)
            if (result.error) {
                toast.error(result.error)
                return
            }

            setOpen(false)
            setFormData({ title: "", specifications: "", budget_range: "" })
            setBudgetError(null)
            setTitleError(null)
            setSpecsError(null)
            toast.success("RFQ submitted successfully")
        } catch (error) {
            console.error(error)
            toast.error("Something went wrong")
        } finally {
            setIsLoading(false)
        }
    }

    // Handle dialog open state change with form reset
    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen)
        if (!newOpen) {
            // Reset state after dialog close animation
            setTimeout(() => {
                setFormData({ title: "", specifications: "", budget_range: "" })
                setShowAdvanced(false)
            }, 300)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button size="sm" variant="default" className="shadow-md">Create RFQ</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-white text-slate-900 border-slate-200">
                <DialogHeader>
                    <DialogTitle>Create Manufacturing RFQ</DialogTitle>
                    <DialogDescription>
                        Submit your specifications to our network of vetted manufacturers.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    {/* Voice recording status */}
                    {(isRecording || isTranscribing) && (
                        <div className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium ${
                            isRecording ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-amber-50 text-amber-600'
                        }`}>
                            {isRecording ? (
                                <>
                                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                    Recording... {formatDuration(recordingDuration)}
                                </>
                            ) : (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Transcribing...
                                </>
                            )}
                        </div>
                    )}

                    {/* Always visible - Required */}
                    <div className="grid gap-2">
                        <Label htmlFor="title">Project Title</Label>
                        <div className="flex gap-2">
                            <Input
                                id="title"
                                value={formData.title}
                                onChange={(e) => {
                                    setFormData({ ...formData, title: e.target.value })
                                    setTitleError(null)
                                }}
                                placeholder="e.g. Aluminum Enclosure Prototype"
                                required
                                enterKeyHint="next"
                                className={`flex-1 ${titleError ? 'border-red-500' : ''}`}
                                aria-describedby={titleError ? "title-error" : undefined}
                                aria-invalid={!!titleError}
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant={isRecording ? "destructive" : "secondary"}
                                onClick={isRecording ? stopRecording : startRecording}
                                disabled={isTranscribing}
                                className={isRecording ? "animate-pulse" : ""}
                                title={isRecording ? "Stop recording" : "Voice fill form"}
                            >
                                {isTranscribing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : isRecording ? (
                                    <Square className="h-4 w-4 fill-current" />
                                ) : (
                                    <Mic className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                        {titleError && (
                            <p id="title-error" className="text-sm text-red-600 mt-1" role="alert">
                                {titleError}
                            </p>
                        )}
                    </div>

                    {/* Toggle Button */}
                    <div className="pt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="text-slate-500"
                        >
                            {showAdvanced ? (
                                <>
                                    <ChevronUp className="w-4 h-4 mr-1" />
                                    Hide Details
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="w-4 h-4 mr-1" />
                                    Add Details
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Optional Fields */}
                    {showAdvanced && (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="budget">Budget Range (Optional)</Label>
                                <Input
                                    id="budget"
                                    value={formData.budget_range}
                                    onChange={(e) => {
                                        setFormData({ ...formData, budget_range: e.target.value })
                                        setBudgetError(null)
                                    }}
                                    placeholder="e.g. $500 - $1,000"
                                    enterKeyHint="next"
                                    className={budgetError ? 'border-red-500' : ''}
                                    aria-describedby={budgetError ? "budget-error" : undefined}
                                    aria-invalid={!!budgetError}
                                />
                                {budgetError && (
                                    <p id="budget-error" className="text-sm text-red-600 mt-1" role="alert">
                                        {budgetError}
                                    </p>
                                )}
                                {!budgetError && (
                                    <p className="text-xs text-slate-500">Format: $500 - $1,000 or $500-$1000</p>
                                )}
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="specs">Specifications (Optional)</Label>
                                <Textarea
                                    id="specs"
                                    value={formData.specifications}
                                    onChange={(e) => {
                                        setFormData({ ...formData, specifications: e.target.value })
                                        setSpecsError(null)
                                    }}
                                    placeholder="Detailed requirements, materials, tolerances..."
                                    className={`h-32 ${specsError ? 'border-red-500' : ''}`}
                                    enterKeyHint="done"
                                    aria-describedby={specsError ? "specs-error" : undefined}
                                    aria-invalid={!!specsError}
                                />
                                {specsError && (
                                    <p id="specs-error" className="text-sm text-red-600 mt-1" role="alert">
                                        {specsError}
                                    </p>
                                )}
                                {!specsError && formData.specifications && (
                                    <p className="text-xs text-slate-500 text-right">
                                        {formData.specifications.length} / 5,000 characters
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                    <DialogFooter className="gap-2 pt-4 border-t border-slate-100">
                        <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="default" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit RFQ
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
