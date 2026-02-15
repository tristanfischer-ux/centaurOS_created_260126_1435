"use client"

import { createObjective } from "@/actions/objectives"
import { getObjectivePacks, ObjectivePack } from "@/actions/packs"
import { analyzeBusinessPlan, AnalyzedObjective } from "@/actions/analyze"
import { smartifyGoal } from "@/actions/smart-goals"
import { generateStrategicPlan, applyStrategicPlan } from "@/actions/strategic-planner"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import {
    Loader2,
    Plus,
    FileText,
    Package,
    Upload,
    ArrowLeft,
    Calendar,
    Map,
    Check,
    Briefcase,
    Globe,
    Scale,
    Building,
    Rocket,
    Server,
    ChevronDown,
    ChevronUp,
    Shield,
    FileCheck,
    Target,
    PoundSterling,
    ShieldCheck,
    Search,
    UserPlus,
    ClipboardCheck,
    Users,
    Sparkles,
    Lightbulb,
    BarChart3,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Markdown } from "@/components/ui/markdown"
import { cn } from "@/lib/utils"
import { AskSpecialistButton } from "@/components/specialists/ask-specialist-button"
import { PrivacyShareControl, type ShareTarget } from "@/components/ui/privacy-share-control"
import { createClient } from "@/lib/supabase/client"
import { SmartScoreCard, getOverallScore } from "@/components/smart/smart-score-card"

import type { SmartScore, SmartGoalSuggestion, SmartGoalContext } from "@/actions/smart-goals"

type CreationMode = 'guided' | 'manual' | 'pack' | 'import' | 'strategic'

/** Steps for the guided SMART wizard */
type GuidedStep = 'capture' | 'refine' | 'measure' | 'create'

const GUIDED_STEPS: { id: GuidedStep; title: string; icon: React.ElementType }[] = [
    { id: 'capture', title: 'Capture', icon: Lightbulb },
    { id: 'refine', title: 'Refine', icon: Sparkles },
    { id: 'measure', title: 'Measure', icon: BarChart3 },
    { id: 'create', title: 'Create', icon: CheckCircle2 },
]

const PACK_ICONS: Record<string, any> = {
    'briefcase': Briefcase,
    'globe': Globe,
    'scale': Scale,
    'building': Building,
    'rocket': Rocket,
    'server': Server,
    'shield': Shield,
    'file-check': FileCheck,
    'target': Target,
    'dollar-sign': PoundSterling,
    'shield-check': ShieldCheck,
    'search': Search,
    'user-plus': UserPlus,
    'clipboard-check': ClipboardCheck,
    'users': Users,
}

interface CreateObjectiveDialogProps {
    children?: React.ReactNode
    /** Pre-fill the guided wizard with a raw idea (from contextual CTAs) */
    prefill?: string
    /** Source context for AI-powered refinement */
    prefillContext?: SmartGoalContext
    /** Control open state externally */
    externalOpen?: boolean
    /** Callback when open state changes externally */
    onExternalOpenChange?: (open: boolean) => void
}

export function CreateObjectiveDialog({ children, prefill, prefillContext, externalOpen, onExternalOpenChange }: CreateObjectiveDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const open = externalOpen !== undefined ? externalOpen : internalOpen
    const setOpen = onExternalOpenChange || setInternalOpen
    const [mode, setMode] = useState<CreationMode>('guided')
    const [isLoading, setIsLoading] = useState(false)
    const [prefillConsumed, setPrefillConsumed] = useState(false)

    // Auto-open dialog when prefill text is provided (e.g. from ?prefill= URL param)
    useEffect(() => {
        if (prefill && !prefillConsumed) {
            setPrefillConsumed(true)
            setInternalOpen(true)
        }
    }, [prefill, prefillConsumed])

    // Guided SMART wizard state
    const [guidedStep, setGuidedStep] = useState<GuidedStep>('capture')
    const [rawIdea, setRawIdea] = useState("")
    const [isRefining, setIsRefining] = useState(false)
    const [smartSuggestion, setSmartSuggestion] = useState<SmartGoalSuggestion | null>(null)
    const [smartScore, setSmartScore] = useState<SmartScore | null>(null)
    const [measurable, setMeasurable] = useState("")
    const [suggestedTimeframe, setSuggestedTimeframe] = useState("")

    // Manual Data
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [extendedDescription, setExtendedDescription] = useState("")
    const [titleError, setTitleError] = useState<string | null>(null)
    const [descriptionError, setDescriptionError] = useState<string | null>(null)
    const [extendedDescriptionError, setExtendedDescriptionError] = useState<string | null>(null)
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Pack Data
    const [packs, setPacks] = useState<ObjectivePack[]>([])
    const [selectedPack, setSelectedPack] = useState<ObjectivePack | null>(null)
    const [isPackLoading, setIsPackLoading] = useState(false)
    const [packError, setPackError] = useState<string | null>(null)
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
    const [packSearchQuery, setPackSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

    // Strategic Pillar linking (pre-link during creation)
    const [strategicPillarId, setStrategicPillarId] = useState<string | null>(null)
    const [strategicPillars, setStrategicPillars] = useState<{ id: string; title: string }[]>([])

    // Privacy & Sharing
    const [isPrivate, setIsPrivate] = useState(false)
    const [sharedWith, setSharedWith] = useState<ShareTarget[]>([])
    const [dialogMembers, setDialogMembers] = useState<{ id: string; full_name: string | null; role: string }[]>([])
    const [dialogTeams, setDialogTeams] = useState<{ id: string; name: string }[]>([])
    const [currentUserId, setCurrentUserId] = useState('')

    // Import Data
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analyzedObjectives, setAnalyzedObjectives] = useState<AnalyzedObjective[]>([])
    const [selectedAnalysisIndex, setSelectedAnalysisIndex] = useState<number | null>(null)
    const [analysisFile, setAnalysisFile] = useState<File | null>(null)

    async function loadPacks() {
        setIsPackLoading(true)
        setPackError(null)
        try {
            const { packs, error } = await getObjectivePacks()
            if (error) {
                setPackError(error)
                setPacks([])
            } else {
                setPacks(packs || [])
            }
        } catch (e) {
            setPackError('Failed to load objective packs')
            console.error('Pack loading error:', e)
            setPacks([])
        } finally {
            setIsPackLoading(false)
        }
    }

    const loadPacksCallback = useCallback(loadPacks, [])

    // Load members and teams for sharing
    const loadMembersAndTeams = useCallback(async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) setCurrentUserId(user.id)

        // SECURITY: Get user's foundry_id to scope queries (RLS disabled on profiles)
        const { data: userProfile } = user ? await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single() : { data: null }

        const foundryId = userProfile?.foundry_id
        if (!foundryId) return

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, role')
            .eq('foundry_id', foundryId)

        if (profiles) setDialogMembers(profiles)

        const { data: teams } = await supabase
            .from('teams')
            .select('id, name')
            .eq('foundry_id', foundryId)

        if (teams) setDialogTeams(teams)

        // Fetch strategic pillars for the "Link to Strategy" dropdown
        const { data: pillars } = await supabase
            .from('objectives')
            .select('id, title')
            .eq('foundry_id', foundryId)
            .eq('is_strategic_goal', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })

        if (pillars) setStrategicPillars(pillars)
    }, [])

    // Load packs + members/teams on open; handle prefill
    useEffect(() => {
        if (open) {
            loadPacksCallback()
            loadMembersAndTeams()
            // If prefill text provided, start in guided mode with it pre-populated
            if (prefill) {
                setMode('guided')
                setRawIdea(prefill)
                setGuidedStep('capture')
            }
        } else {
            // Reset state on close
            setTimeout(() => {
                setMode('guided')
                setTitle("")
                setDescription("")
                setExtendedDescription("")
                setSelectedPack(null)
                setSelectedTaskIds([])
                setAnalyzedObjectives([])
                setSelectedAnalysisIndex(null)
                setAnalysisFile(null)
                setPackError(null)
                setPackSearchQuery('')
                setSelectedCategory(null)
                setShowAdvanced(false)
                setIsPrivate(false)
                setSharedWith([])
                setStrategicPillarId(null)
                // Reset guided state
                setGuidedStep('capture')
                setRawIdea("")
                setSmartSuggestion(null)
                setSmartScore(null)
                setMeasurable("")
                setSuggestedTimeframe("")
                setIsRefining(false)
            }, 300)
        }
    }, [open, loadPacksCallback, loadMembersAndTeams, prefill])

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setAnalysisFile(file)
        setIsAnalyzing(true)
        setAnalyzedObjectives([])
        setSelectedAnalysisIndex(null)

        const formData = new FormData()
        formData.append('file', file)

        const result = await analyzeBusinessPlan(formData)
        setIsAnalyzing(false)

        if (result.error) {
            toast.error(result.error)
            setAnalysisFile(null)
        } else if (result.objectives && result.objectives.length > 0) {
            setAnalyzedObjectives(result.objectives)
            setSelectedAnalysisIndex(0) // Default to first
            // Pre-fill manual fields from first result
            setTitle(result.objectives[0].title)
            setDescription(result.objectives[0].description)
            toast.success(`Analysis complete: Found ${result.objectives.length} objectives`)
        } else {
            toast.warning("No objectives found in document")
        }
    }

    const handleCreateAll = async () => {
        if (analyzedObjectives.length === 0) return

        setIsLoading(true)
        let successCount = 0
        let errorCount = 0

        for (const obj of analyzedObjectives) {
            try {
                const formData = new FormData()
                formData.append('title', obj.title)
                formData.append('description', obj.description)
                obj.tasks.forEach(task => {
                    formData.append('aiTasks', JSON.stringify(task))
                })

                const res = await createObjective(formData)
                if (!res?.error) {
                    successCount++
                } else {
                    errorCount++
                    console.error(`Failed to create objective "${obj.title}":`, res.error)
                }
            } catch (e) {
                errorCount++
                console.error(`Error creating objective "${obj.title}":`, e)
            }
        }

        setIsLoading(false)
        
        if (successCount > 0) {
            toast.success(`Successfully created ${successCount} ${successCount === 1 ? 'objective' : 'objectives'}`)
        }
        if (errorCount > 0) {
            toast.error(`Failed to create ${errorCount} ${errorCount === 1 ? 'objective' : 'objectives'}`)
        }
        
        if (successCount > 0) {
            setOpen(false)
        }
    }

    const handleCreate = async (extendedDescriptionOverride?: string) => {
        // Reset errors
        setTitleError(null)
        setDescriptionError(null)
        setExtendedDescriptionError(null)

        // Use override if provided (e.g., from guided wizard where setState is async)
        const effectiveExtendedDescription = extendedDescriptionOverride ?? extendedDescription

        // Validate title
        if (!title.trim()) {
            setTitleError("Objective title is required")
            toast.error("Objective title is required")
            return
        }

        if (title.trim().length > 200) {
            setTitleError("Objective title must be 200 characters or less")
            toast.error("Objective title must be 200 characters or less")
            return
        }

        // Validate description (optional but if provided, must meet requirements)
        if (description && description.trim().length > 500) {
            setDescriptionError("Summary must be 500 characters or less")
            toast.error("Summary must be 500 characters or less")
            return
        }

        // Validate extended description
        if (effectiveExtendedDescription && effectiveExtendedDescription.trim().length > 50000) {
            setExtendedDescriptionError("Extended description must be 50,000 characters or less")
            toast.error("Extended description must be 50,000 characters or less")
            return
        }

        setIsLoading(true)
        const formData = new FormData()
        formData.append('title', title)
        formData.append('description', description)
        formData.append('extendedDescription', effectiveExtendedDescription)
        formData.append('is_private', String(isPrivate))
        if (strategicPillarId) {
            formData.append('parent_objective_id', strategicPillarId)
        }
        if (isPrivate && sharedWith.length > 0) {
            formData.append('share_with', JSON.stringify(sharedWith))
        }

        // Add special handling for Packs
        if (mode === 'pack' && selectedPack) {
            formData.append('playbookId', selectedPack.id)
            // Use user-selected tasks
            selectedTaskIds.forEach(id => {
                formData.append('selectedTaskIds', id)
            })
        }

        // Add special handling for Imports
        if (mode === 'import' && selectedAnalysisIndex !== null) {
            const obj = analyzedObjectives[selectedAnalysisIndex]
            // We use the 'aiTasks' mechanism from the backend
            // The backend expects json strings for tasks
            obj.tasks.forEach(task => {
                formData.append('aiTasks', JSON.stringify(task))
            })
        }

        try {
            const res = await createObjective(formData)
            if (res?.error) {
                // Set error on appropriate field or show general error
                if (res.error.toLowerCase().includes('title')) {
                    setTitleError(res.error)
                } else if (res.error.toLowerCase().includes('description')) {
                    setDescriptionError(res.error)
                } else {
                    toast.error(res.error)
                }
            } else {
                toast.success("Objective Initiated")
                setOpen(false)
            }
        } catch (e) {
            toast.error("An unexpected error occurred")
            console.error(e)
        } finally {
            setIsLoading(false)
        }
    }

    // --- Guided SMART wizard handlers ---

    const guidedStepIndex = GUIDED_STEPS.findIndex(s => s.id === guidedStep)
    const isFirstGuidedStep = guidedStepIndex === 0
    const isLastGuidedStep = guidedStepIndex === GUIDED_STEPS.length - 1

    /** AI-refine the raw idea into SMART format */
    const handleSmartRefine = async () => {
        if (!rawIdea.trim() || isRefining) return
        setIsRefining(true)

        const result = await smartifyGoal({
            rawIdea: rawIdea.trim(),
            type: 'objective',
            context: prefillContext,
        })

        if (result.suggestion) {
            setSmartSuggestion(result.suggestion)
            setSmartScore(result.suggestion.smartScore)
            setTitle(result.suggestion.title)
            setDescription(result.suggestion.description)
            setMeasurable(result.suggestion.measurable)
            setSuggestedTimeframe(result.suggestion.suggestedTimeframe || '')
            setGuidedStep('refine')
        } else {
            toast.error(result.error || 'Failed to refine idea')
        }
        setIsRefining(false)
    }

    /** Navigate to next guided step */
    const goToNextGuidedStep = () => {
        const nextIndex = guidedStepIndex + 1
        if (nextIndex < GUIDED_STEPS.length) {
            setGuidedStep(GUIDED_STEPS[nextIndex].id)
        }
    }

    /** Navigate to previous guided step */
    const goToPrevGuidedStep = () => {
        const prevIndex = guidedStepIndex - 1
        if (prevIndex >= 0) {
            setGuidedStep(GUIDED_STEPS[prevIndex].id)
        }
    }

    const getModeIcon = (m: CreationMode) => {
        switch (m) {
            case 'guided': return Sparkles;
            case 'manual': return FileText;
            case 'pack': return Package;
            case 'import': return Upload;
            case 'strategic': return Map;
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || (
                    <Button size="sm" className="bg-background text-foreground hover:bg-muted border border-transparent shadow-sm">
                        <Plus className="h-4 w-4" /> New Objective
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent size="lg" className="w-[calc(100vw-2rem)] max-h-[90dvh] flex flex-col p-0 gap-0 bg-background sm:rounded-xl overflow-hidden">
                {/* Header Section */}
                <div className="p-6 pb-4 bg-muted/50">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">
                            {mode === 'guided' && "Create a SMART Objective"}
                            {mode === 'manual' && "Define Strategic Objective"}
                            {mode === 'pack' && (selectedPack ? "Configure Objective Pack" : "Select Objective Pack")}
                            {mode === 'import' && "Import from Business Plan"}
                            {mode === 'strategic' && "Create Strategic Goal"}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {mode === 'guided' && "AI-guided creation to make your objective Specific, Measurable, Achievable, Relevant, and Time-bound."}
                            {mode === 'manual' && "Manually define your objective and success criteria."}
                            {mode === 'pack' && !selectedPack && "Choose a pre-configured template to jumpstart your strategy."}
                            {mode === 'pack' && selectedPack && `Review tasks included in the "${selectedPack.title}" pack.`}
                            {mode === 'import' && "Upload a business plan to automatically generate objectives."}
                            {mode === 'strategic' && "Define a big goal with a deadline. AI will build a full plan with phases, tasks, dependencies, and resource recommendations."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Mode Selector - Always show, but make it smaller/less prominent when in a sub-flow */}
                    <div className={cn(
                        "flex items-center gap-2 mt-6 transition-all flex-wrap",
                        ((mode === 'guided' && guidedStep !== 'capture') || (mode === 'pack' && selectedPack) || (mode === 'import' && analyzedObjectives.length > 0)) && "opacity-60 scale-95"
                    )}>
                        {(['guided', 'strategic', 'manual', 'pack', 'import'] as CreationMode[]).map((m) => {
                            const Icon = getModeIcon(m)
                            const isDisabled = (mode === 'guided' && guidedStep !== 'capture' && m !== 'guided') ||
                                            (mode === 'pack' && selectedPack && m !== 'pack') || 
                                            (mode === 'import' && analyzedObjectives.length > 0 && m !== 'import')
                            return (
                                <button
                                    key={m}
                                    onClick={() => {
                                        if (!isDisabled) {
                                            setMode(m)
                                            // Reset sub-flow state when switching modes
                                            if (m !== 'guided') {
                                                setGuidedStep('capture')
                                                setSmartSuggestion(null)
                                                setSmartScore(null)
                                            }
                                            if (m !== 'pack') setSelectedPack(null)
                                            if (m !== 'import') {
                                                setAnalyzedObjectives([])
                                                setSelectedAnalysisIndex(null)
                                                setAnalysisFile(null)
                                            }
                                        }
                                    }}
                                    disabled={isDisabled}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
                                        mode === m
                                            ? "bg-foreground text-background shadow-md"
                                            : "bg-background text-muted-foreground hover:bg-muted shadow-sm",
                                        isDisabled && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                    {m === 'guided' ? 'Guided' : m.charAt(0).toUpperCase() + m.slice(1)}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Main Content Area - min-h-0 enables flex child to shrink and scroll */}
                <div className="flex-1 min-h-0 overflow-y-auto bg-background">
                    <div className="p-6">

                        {/* GUIDED SMART WIZARD MODE */}
                        {mode === 'guided' && (
                            <div className="space-y-6 max-w-2xl mx-auto pt-4">
                                {/* Progress Stepper */}
                                <div className="flex items-center gap-2">
                                    {GUIDED_STEPS.map((step, index) => {
                                        const StepIcon = step.icon
                                        const isActive = step.id === guidedStep
                                        const isCompleted = index < guidedStepIndex

                                        return (
                                            <div key={step.id} className={cn('flex items-center gap-2 flex-1', index > 0 && 'pl-2')}>
                                                {index > 0 && (
                                                    <div className={cn(
                                                        'h-0.5 flex-1 rounded-full transition-colors',
                                                        isCompleted ? 'bg-international-orange' : 'bg-muted'
                                                    )} />
                                                )}
                                                <div className={cn(
                                                    'flex items-center justify-center rounded-full h-8 w-8 transition-colors shrink-0',
                                                    isActive && 'bg-international-orange text-background',
                                                    isCompleted && !isActive && 'bg-orange-100 text-international-orange',
                                                    !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                                                )}>
                                                    <StepIcon className="h-4 w-4" />
                                                </div>
                                                <span className={cn(
                                                    'text-xs font-medium hidden sm:block',
                                                    isActive ? 'text-foreground' : 'text-muted-foreground'
                                                )}>
                                                    {step.title}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Step 1: Capture */}
                                {guidedStep === 'capture' && (
                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2">
                                                What do you want to achieve?
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                Describe your goal in your own words. Don&apos;t worry about making it perfect -- AI will help you refine it into a SMART objective.
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="raw-idea">
                                                Your idea <span className="text-destructive ml-1" aria-label="required">*</span>
                                            </Label>
                                            <Textarea
                                                id="raw-idea"
                                                placeholder="e.g. I want to get more customers, or I need to build an MVP, or I should hire a fractional CFO..."
                                                value={rawIdea}
                                                onChange={(e) => setRawIdea(e.target.value)}
                                                className="min-h-[120px] resize-none"
                                                autoFocus
                                                maxLength={2000}
                                            />
                                            <p className="text-xs text-muted-foreground text-right">
                                                {rawIdea.length} / 2,000 characters
                                            </p>
                                        </div>

                                        {/* Pre-creation specialist consultation */}
                                        <div className="flex items-center gap-2 pt-1">
                                            <AskSpecialistButton
                                                context={{
                                                    type: 'objective',
                                                    title: 'New Objective Planning',
                                                    description: 'The user is creating a new objective and wants strategic input on what to set.',
                                                    metadata: {
                                                        notes: rawIdea ? `Current idea: "${rawIdea}"` : 'No idea captured yet — looking for strategic direction.',
                                                    },
                                                }}
                                                specialistId="strategist"
                                                specialistName="Sage"
                                                variant="chip"
                                                label="Not sure? Talk to Sage first"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Step 2: Refine */}
                                {guidedStep === 'refine' && smartSuggestion && (
                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2">
                                                Here&apos;s your SMART objective
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                AI refined your idea. Edit anything you&apos;d like to change.
                                            </p>
                                        </div>

                                        {smartScore && (
                                            <div className="flex items-center gap-3">
                                                <SmartScoreCard score={smartScore} suggestions={smartSuggestion.suggestions} />
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <Label htmlFor="guided-title">
                                                Objective Title <span className="text-destructive ml-1" aria-label="required">*</span>
                                            </Label>
                                            <Input
                                                id="guided-title"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                maxLength={200}
                                                autoFocus
                                            />
                                            <p className="text-xs text-muted-foreground text-right">
                                                {title.length} / 200 characters
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="guided-description">Description</Label>
                                            <Textarea
                                                id="guided-description"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                className="min-h-[80px] resize-none"
                                                maxLength={500}
                                            />
                                            <p className="text-xs text-muted-foreground text-right">
                                                {description.length} / 500 characters
                                            </p>
                                        </div>

                                        {smartSuggestion.suggestions.length > 0 && (
                                            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                                                <p className="text-xs font-medium text-muted-foreground">Tips to strengthen your objective:</p>
                                                {smartSuggestion.suggestions.map((tip, i) => (
                                                    <p key={i} className="text-xs text-muted-foreground">
                                                        &bull; {tip}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Step 3: Measure */}
                                {guidedStep === 'measure' && (
                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2">
                                                How will you know you&apos;ve succeeded?
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                Define the concrete criteria or metrics that prove this objective is complete.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="guided-measurable">
                                                Success criteria <span className="text-destructive ml-1" aria-label="required">*</span>
                                            </Label>
                                            <Textarea
                                                id="guided-measurable"
                                                placeholder="e.g. 10 paying customers, £5k MRR, MVP shipped and tested by 5 users..."
                                                value={measurable}
                                                onChange={(e) => setMeasurable(e.target.value)}
                                                className="min-h-[80px] resize-none"
                                                autoFocus
                                                maxLength={500}
                                            />
                                            <p className="text-xs text-muted-foreground text-right">
                                                {measurable.length} / 500 characters
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="guided-timeframe">Suggested timeframe</Label>
                                            <Input
                                                id="guided-timeframe"
                                                placeholder="e.g. 2 weeks, End of Q1, March 15th"
                                                value={suggestedTimeframe}
                                                onChange={(e) => setSuggestedTimeframe(e.target.value)}
                                                maxLength={200}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                When should this be completed? Set a realistic deadline.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Step 4: Review & Create */}
                                {guidedStep === 'create' && (
                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2">
                                                Review your objective
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                Everything looks good? Hit create to make it official.
                                            </p>
                                        </div>

                                        {smartScore && (
                                            <SmartScoreCard score={smartScore} suggestions={smartSuggestion?.suggestions} />
                                        )}

                                        <Card>
                                            <CardContent className="pt-6 space-y-3">
                                                <div>
                                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</p>
                                                    <p className="text-foreground font-medium">{title}</p>
                                                </div>
                                                {description && (
                                                    <div>
                                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</p>
                                                        <p className="text-sm text-muted-foreground">{description}</p>
                                                    </div>
                                                )}
                                                {measurable && (
                                                    <div>
                                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Success Criteria</p>
                                                        <p className="text-sm text-muted-foreground">{measurable}</p>
                                                    </div>
                                                )}
                                                {suggestedTimeframe && (
                                                    <div>
                                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Timeframe</p>
                                                        <p className="text-sm text-muted-foreground">{suggestedTimeframe}</p>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Strategic Pillar Dropdown */}
                                        {strategicPillars.length > 0 && (
                                            <div className="space-y-2">
                                                <Label htmlFor="guided-strategic-pillar">Link to Strategy (optional)</Label>
                                                <Select
                                                    value={strategicPillarId || 'none'}
                                                    onValueChange={(v) => setStrategicPillarId(v === 'none' ? null : v)}
                                                >
                                                    <SelectTrigger id="guided-strategic-pillar" className="w-full">
                                                        <SelectValue placeholder="No strategy selected" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">No strategy</SelectItem>
                                                        {strategicPillars.map((p) => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.title}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground">
                                                    Connect this objective to a strategic pillar for alignment tracking
                                                </p>
                                            </div>
                                        )}

                                        {/* Privacy & Sharing */}
                                        <PrivacyShareControl
                                            isPrivate={isPrivate}
                                            onPrivateChange={setIsPrivate}
                                            sharedWith={sharedWith}
                                            onSharedWithChange={setSharedWith}
                                            members={dialogMembers}
                                            teams={dialogTeams}
                                            currentUserId={currentUserId}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* MANUAL MODE */}
                        {mode === 'manual' && (
                            <div className="space-y-6 max-w-2xl mx-auto pt-4">
                                <div className="space-y-2">
                                    <Label htmlFor="title">
                                        Objective Title <span className="text-destructive ml-1" aria-label="required">*</span>
                                    </Label>
                                    <Input
                                        id="title"
                                        placeholder="e.g. Q1 Market Expansion"
                                        value={title}
                                        onChange={(e) => {
                                            setTitle(e.target.value)
                                            setTitleError(null)
                                        }}
                                        className={cn(titleError && "border-destructive")}
                                        autoFocus
                                        aria-describedby={titleError ? "title-error" : undefined}
                                        aria-invalid={!!titleError}
                                    />
                                    {titleError && (
                                        <p id="title-error" className="text-sm text-destructive mt-1" role="alert">
                                            {titleError}
                                        </p>
                                    )}
                                    {!titleError && title && (
                                        <p className="text-xs text-muted-foreground text-right">
                                            {title.length} / 200 characters
                                        </p>
                                    )}
                                </div>
                                
                                {/* Strategic Pillar Dropdown */}
                                {strategicPillars.length > 0 && (
                                    <div className="space-y-2">
                                        <Label htmlFor="strategic-pillar">Link to Strategy (optional)</Label>
                                        <Select
                                            value={strategicPillarId || 'none'}
                                            onValueChange={(v) => setStrategicPillarId(v === 'none' ? null : v)}
                                        >
                                            <SelectTrigger id="strategic-pillar" className="w-full">
                                                <SelectValue placeholder="No strategy selected" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No strategy</SelectItem>
                                                {strategicPillars.map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        {p.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            Connect this objective to a strategic pillar for alignment tracking
                                        </p>
                                    </div>
                                )}

                                {/* Toggle Button */}
                                <div className="pt-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        className="text-muted-foreground"
                                    >
                                        {showAdvanced ? (
                                            <>
                                                <ChevronUp className="w-4 h-4 mr-1" />
                                                Hide Description
                                            </>
                                        ) : (
                                            <>
                                                <ChevronDown className="w-4 h-4 mr-1" />
                                                Add Description
                                            </>
                                        )}
                                    </Button>
                                </div>

                                {/* Optional Descriptions */}
                                {showAdvanced && (
                                    <div className="space-y-6">
                                        {/* Short Summary */}
                                        <div className="space-y-2">
                                            <Label htmlFor="description" className="text-base font-semibold">Summary</Label>
                                            <p className="text-sm text-muted-foreground">A brief 1-2 sentence overview shown in lists</p>
                                            <Textarea
                                                id="description"
                                                placeholder="e.g. Acquire first 10 paying customers through systematic cold outreach..."
                                                value={description}
                                                onChange={(e) => {
                                                    setDescription(e.target.value)
                                                    setDescriptionError(null)
                                                }}
                                                className={cn("min-h-[80px] resize-none", descriptionError && "border-destructive")}
                                                aria-describedby={descriptionError ? "description-error" : undefined}
                                                aria-invalid={!!descriptionError}
                                            />
                                            {descriptionError && (
                                                <p id="description-error" className="text-sm text-destructive mt-1" role="alert">
                                                    {descriptionError}
                                                </p>
                                            )}
                                            {!descriptionError && (
                                                <p className="text-xs text-muted-foreground text-right">
                                                    {description.length} / 500 characters
                                                </p>
                                            )}
                                        </div>

                                        {/* Extended Description */}
                                        <div className="space-y-2">
                                            <Label htmlFor="extendedDescription" className="text-base font-semibold">Extended Description</Label>
                                            <p className="text-sm text-muted-foreground">Full context, background, success criteria, and detailed instructions</p>
                                            <Textarea
                                                id="extendedDescription"
                                                placeholder="## Background&#10;Explain the context and why this objective matters...&#10;&#10;## Success Criteria&#10;- Metric 1&#10;- Metric 2&#10;&#10;## Approach&#10;Detailed strategy and methodology..."
                                                value={extendedDescription}
                                                onChange={(e) => {
                                                    setExtendedDescription(e.target.value)
                                                    setExtendedDescriptionError(null)
                                                }}
                                                className={cn("min-h-[250px] resize-none font-mono text-sm", extendedDescriptionError && "border-destructive")}
                                                aria-describedby={extendedDescriptionError ? "extended-description-error" : undefined}
                                                aria-invalid={!!extendedDescriptionError}
                                            />
                                            {extendedDescriptionError && (
                                                <p id="extended-description-error" className="text-sm text-destructive mt-1" role="alert">
                                                    {extendedDescriptionError}
                                                </p>
                                            )}
                                            {!extendedDescriptionError && (
                                                <p className="text-xs text-muted-foreground text-right">
                                                    {extendedDescription.length} / 50,000 characters (Markdown supported)
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Privacy & Sharing */}
                                <PrivacyShareControl
                                    isPrivate={isPrivate}
                                    onPrivateChange={setIsPrivate}
                                    sharedWith={sharedWith}
                                    onSharedWithChange={setSharedWith}
                                    members={dialogMembers}
                                    teams={dialogTeams}
                                    currentUserId={currentUserId}
                                />
                            </div>
                        )}

                        {/* PACK MODE */}
                        {mode === 'pack' && (
                            <div className="h-full">
                                {!selectedPack ? (
                                    <>
                                        {packs.length > 0 && (
                                            <div className="mb-4 space-y-3">
                                                <Input
                                                    placeholder="Search packs..."
                                                    value={packSearchQuery}
                                                    onChange={(e) => setPackSearchQuery(e.target.value)}
                                                    className="max-w-md"
                                                />
                                                {/* Category chips */}
                                                <div className="flex flex-wrap gap-2">
                                                    {Array.from(new Set(packs.map(p => p.category).filter(Boolean))).map(cat => (
                                                        <button
                                                            key={cat}
                                                            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                                                            className={cn(
                                                                "px-3 py-1 rounded-full text-sm",
                                                                selectedCategory === cat ? "bg-foreground text-background" : "bg-muted"
                                                            )}
                                                        >
                                                            {cat}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {/* Pack Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {isPackLoading ? (
                                                <div className="col-span-full flex items-center justify-center py-20">
                                                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                                </div>
                                            ) : packError ? (
                                                <div className="col-span-full border-2 border-dashed border-destructive/20 rounded-lg">
                                                    <EmptyState
                                                        icon={<Package className="h-12 w-12 text-destructive" />}
                                                        title="Failed to load packs"
                                                        description={packError}
                                                    />
                                                </div>
                                            ) : packs.length === 0 ? (
                                                <div className="col-span-full bg-muted/50 rounded-lg">
                                                    <EmptyState
                                                        icon={<Package className="h-12 w-12" />}
                                                        title="No packs available"
                                                        description="Objective packs are not currently available. Try creating an objective manually."
                                                    />
                                                </div>
                                            ) : (() => {
                                                const filteredPacks = packs.filter(pack => {
                                                    const matchesSearch = !packSearchQuery || 
                                                        pack.title.toLowerCase().includes(packSearchQuery.toLowerCase()) ||
                                                        pack.description?.toLowerCase().includes(packSearchQuery.toLowerCase())
                                                    const matchesCategory = !selectedCategory || pack.category === selectedCategory
                                                    return matchesSearch && matchesCategory
                                                })
                                                
                                                if (filteredPacks.length === 0) {
                                                    return (
                                                        <div className="col-span-full bg-muted/50 rounded-lg py-8 text-center">
                                                            <p className="text-muted-foreground">No packs match your search criteria.</p>
                                                        </div>
                                                    )
                                                }
                                                
                                                return filteredPacks.map((pack) => {
                                                    const Icon = pack.icon_name ? PACK_ICONS[pack.icon_name] || Package : Package
                                                    return (
                                                        <Card
                                                            key={pack.id}
                                                            className="cursor-pointer hover:shadow-lg transition-all group"
                                                            onClick={() => {
                                                                setSelectedPack(pack)
                                                                setSelectedTaskIds(pack.items?.map(i => i.id) || []) // Auto-select all by default
                                                                setTitle(pack.title)
                                                                setDescription(pack.description || "")
                                                            }}
                                                        >
                                                            <CardHeader className="space-y-1">
                                                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-2 group-hover:bg-electric-blue-light group-hover:text-electric-blue transition-colors">
                                                                    <Icon className="w-5 h-5 text-muted-foreground group-hover:text-electric-blue" />
                                                                </div>
                                                                <CardTitle className="text-lg">{pack.title}</CardTitle>
                                                                <CardDescription className="line-clamp-2">{pack.description}</CardDescription>
                                                            </CardHeader>
                                                            <CardContent>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {pack.category && <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">{pack.category}</Badge>}
                                                                    <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">{pack.items?.length || 0} Tasks</Badge>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    )
                                                })
                                            })()}
                                        </div>
                                    </>
                                ) : (
                                    // Selected Pack Details
                                    <div className="space-y-6 max-w-3xl mx-auto">
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedPack(null)} className="mb-2 -ml-2 text-muted-foreground hover:text-foreground">
                                            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Packs
                                        </Button>

                                        <div className="space-y-4">
                                            <div>
                                                <h3 className="text-2xl font-bold text-foreground">{selectedPack.title}</h3>
                                                <p className="text-muted-foreground mt-1 text-lg">{selectedPack.description}</p>
                                            </div>

                                            <div className="border rounded-xl overflow-hidden bg-muted">
                                                <div className="px-4 py-3 border-b bg-background font-medium text-sm text-muted-foreground flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <Checkbox
                                                            checked={selectedTaskIds.length === (selectedPack.items?.length || 0) && (selectedPack.items?.length ?? 0) > 0}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedTaskIds(selectedPack.items?.map(i => i.id) || [])
                                                                } else {
                                                                    setSelectedTaskIds([])
                                                                }
                                                            }}
                                                        />
                                                        <span>Select All Tasks</span>
                                                    </div>
                                                    <span>{selectedTaskIds.length} of {selectedPack.items?.length || 0} selected</span>
                                                </div>
                                                <div className="divide-y divide-muted">
                                                    {selectedPack.items?.map((item) => (
                                                        <div key={item.id} className="p-4 flex items-start gap-4 hover:bg-muted/50 transition-colors">
                                                            <div className="mt-1">
                                                                <Checkbox
                                                                    checked={selectedTaskIds.includes(item.id)}
                                                                    onCheckedChange={(checked) => {
                                                                        if (checked) {
                                                                            setSelectedTaskIds(prev => [...prev, item.id])
                                                                        } else {
                                                                            setSelectedTaskIds(prev => prev.filter(id => id !== item.id))
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <p className="font-medium text-foreground text-sm">{item.title}</p>
                                                                <div className="text-sm">
                                                                    <Markdown content={item.description || ''} className="text-muted-foreground" />
                                                                </div>
                                                                {/* Role removed for later assignment */}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* IMPORT MODE */}
                        {mode === 'import' && (
                            <div className="max-w-2xl mx-auto pt-4 h-full flex flex-col items-center">
                                {!analyzedObjectives.length && !isAnalyzing ? (
                                    <div className="w-full">
                                        <div
                                            className="bg-muted/50 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4 hover:bg-electric-blue-light/20 transition-all cursor-pointer group relative"
                                        >
                                            <Input
                                                type="file"
                                                accept=".pdf,.txt,.md"
                                                className="absolute inset-0 opacity-0 cursor-pointer h-full z-10"
                                                onChange={handleFileUpload}
                                            />
                                            <div className="w-16 h-16 rounded-full bg-electric-blue-light flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Upload className="w-8 h-8 text-electric-blue" />
                                            </div>
                                            <div className="space-y-2">
                                                <h3 className="text-lg font-semibold text-foreground">Upload Business Plan</h3>
                                                <p className="text-muted-foreground max-w-sm mx-auto">
                                                    Drag and drop your PDF, TXT, or MD file to automatically extract strategic objectives.
                                                </p>
                                            </div>
                                            <Badge variant="secondary" className="mt-4">AI Powered Analysis</Badge>
                                        </div>
                                    </div>
                                ) : isAnalyzing ? (
                                    <div className="flex flex-col items-center justify-center py-20 space-y-6">
                                        <div className="relative">
                                            <div className="w-16 h-16 rounded-full bg-muted border-t-4 border-t-electric-blue animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <img src="/icons/sparkles.svg" className="w-6 h-6 opacity-20" alt="" />
                                            </div>
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h3 className="text-lg font-medium text-foreground">Analyzing Strategy...</h3>
                                            <p className="text-muted-foreground">Extracting actionable objectives from {analysisFile?.name}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-semibold text-foreground">Found {analyzedObjectives.length} Objectives</h3>
                                            <Button variant="ghost" size="sm" onClick={() => {
                                                setAnalyzedObjectives([])
                                                setAnalysisFile(null)
                                            }}>Upload Different File</Button>
                                        </div>

                                        {analyzedObjectives.length > 0 && (
                                            <Button
                                                variant="secondary"
                                                onClick={handleCreateAll}
                                                className="mb-4 w-full"
                                                disabled={isLoading}
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Creating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="h-4 w-4 mr-2" />
                                                        Create All {analyzedObjectives.length} Objectives
                                                    </>
                                                )}
                                            </Button>
                                        )}

                                        <div className="grid gap-3">
                                            {analyzedObjectives.map((obj, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => {
                                                        setSelectedAnalysisIndex(idx)
                                                        setTitle(obj.title)
                                                        setDescription(obj.description)
                                                    }}
                                                    className={cn(
                                                        "p-4 rounded-xl border text-left cursor-pointer transition-all",
                                                        selectedAnalysisIndex === idx
                                                            ? "border-electric-blue bg-electric-blue-light/30 ring-1 ring-electric-blue shadow-sm"
                                                            : "hover:shadow-md bg-background"
                                                    )}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h4 className="font-semibold text-foreground">{obj.title}</h4>
                                                        {selectedAnalysisIndex === idx && <Check className="w-4 h-4 text-electric-blue" />}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground line-clamp-2">{obj.description}</p>
                                                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                                                            {obj.tasks.length} Tasks Generated
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {selectedAnalysisIndex !== null && (
                                            <div className="space-y-4 pt-4 mt-4">
                                                <Label>Refine Selected Objective</Label>
                                                <Input
                                                    value={title}
                                                    onChange={(e) => {
                                                        setTitle(e.target.value)
                                                        setTitleError(null)
                                                    }}
                                                    className={cn("bg-background", titleError && "border-destructive")}
                                                    aria-describedby={titleError ? "title-error-import" : undefined}
                                                    aria-invalid={!!titleError}
                                                />
                                                {titleError && (
                                                    <p id="title-error-import" className="text-sm text-destructive mt-1" role="alert">
                                                        {titleError}
                                                    </p>
                                                )}
                                                <Textarea
                                                    value={description}
                                                    onChange={(e) => {
                                                        setDescription(e.target.value)
                                                        setDescriptionError(null)
                                                    }}
                                                    className={cn("resize-none h-24 bg-background", descriptionError && "border-destructive")}
                                                    aria-describedby={descriptionError ? "description-error-import" : undefined}
                                                    aria-invalid={!!descriptionError}
                                                />
                                                {descriptionError && (
                                                    <p id="description-error-import" className="text-sm text-destructive mt-1" role="alert">
                                                        {descriptionError}
                                                    </p>
                                                )}
                                                {!descriptionError && description && (
                                                    <p className="text-xs text-muted-foreground text-right">
                                                        {description.length} / 10,000 characters
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STRATEGIC GOAL MODE */}
                        {mode === 'strategic' && (
                            <div className="max-w-2xl mx-auto pt-4 space-y-6">
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">
                                        What big goal do you want to achieve?
                                    </h3>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Describe your strategic goal. AI will create a full plan with phases,
                                        tasks, dependencies, and resource recommendations.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="strategic-goal">
                                        Goal <span className="text-destructive" aria-label="required">*</span>
                                    </Label>
                                    <Textarea
                                        id="strategic-goal"
                                        value={title}
                                        onChange={(e) => {
                                            setTitle(e.target.value)
                                            if (titleError) setTitleError(null)
                                        }}
                                        placeholder="e.g., Raise 500k seed round, Launch product in 3 markets, Hire 5 key executives..."
                                        className={cn(titleError && "border-destructive")}
                                        aria-required
                                        aria-invalid={!!titleError}
                                        aria-describedby={titleError ? "strategic-goal-error" : undefined}
                                    />
                                    {titleError && (
                                        <p id="strategic-goal-error" role="alert" className="text-sm text-destructive">{titleError}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">{title.length} / 500 characters</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="strategic-description">
                                        Additional context (optional)
                                    </Label>
                                    <Textarea
                                        id="strategic-description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Any additional context the AI should know about - your team size, budget, industry constraints..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="strategic-deadline">
                                        Target deadline <span className="text-destructive" aria-label="required">*</span>
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="strategic-deadline"
                                            type="date"
                                            value={suggestedTimeframe}
                                            onChange={(e) => setSuggestedTimeframe(e.target.value)}
                                            className="w-auto"
                                            aria-required
                                            min={new Date().toISOString().split('T')[0]}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Privacy toggle for pack/import modes (manual mode has it inline) */}
                {mode !== 'manual' && (
                    <div className="px-6 pb-2">
                        <PrivacyShareControl
                            isPrivate={isPrivate}
                            onPrivateChange={setIsPrivate}
                            sharedWith={sharedWith}
                            onSharedWithChange={setSharedWith}
                            members={dialogMembers}
                            teams={dialogTeams}
                            currentUserId={currentUserId}
                        />
                    </div>
                )}

                {/* Footer Actions */}
                <DialogFooter className="p-6 pt-4 bg-muted/50">
                    {mode === 'guided' ? (
                        /* Guided mode: wizard navigation */
                        <div className="flex w-full items-center justify-between">
                            <Button
                                variant="secondary"
                                onClick={isFirstGuidedStep ? () => setOpen(false) : goToPrevGuidedStep}
                                disabled={isLoading || isRefining}
                            >
                                {isFirstGuidedStep ? 'Cancel' : (
                                    <>
                                        <ChevronLeft className="h-4 w-4 mr-1" />
                                        Back
                                    </>
                                )}
                            </Button>

                            {guidedStep === 'capture' && (
                                <Button
                                    onClick={handleSmartRefine}
                                    disabled={isRefining || rawIdea.trim().length < 5}
                                    className="min-w-[160px]"
                                >
                                    {isRefining ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Refining...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4" />
                                            Refine with AI
                                        </>
                                    )}
                                </Button>
                            )}

                            {guidedStep === 'refine' && (
                                <Button
                                    onClick={goToNextGuidedStep}
                                    disabled={!title.trim()}
                                >
                                    Next: Measure
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            )}

                            {guidedStep === 'measure' && (
                                <Button
                                    onClick={goToNextGuidedStep}
                                >
                                    Next: Review
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            )}

                            {guidedStep === 'create' && (
                                <Button
                                    onClick={() => {
                                        // Build extended description from measurable + timeframe
                                        // Pass directly to handleCreate to avoid async setState race condition
                                        const extDesc = [
                                            measurable && `## Success Criteria\n${measurable}`,
                                            suggestedTimeframe && `## Timeframe\n${suggestedTimeframe}`,
                                        ].filter(Boolean).join('\n\n')
                                        setExtendedDescription(extDesc)
                                        handleCreate(extDesc)
                                    }}
                                    disabled={isLoading || !title.trim()}
                                    className="min-w-[160px]"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-4 w-4" />
                                            Create Objective
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    ) : mode === 'strategic' ? (
                        /* Strategic mode: generate plan */
                        <div className="flex w-full items-center justify-between">
                            <Button variant="secondary" onClick={() => setOpen(false)} disabled={isLoading}>
                                Cancel
                            </Button>
                            <Button
                                onClick={async () => {
                                    if (!title.trim()) {
                                        setTitleError('Please describe your goal')
                                        return
                                    }
                                    if (!suggestedTimeframe) {
                                        toast.error('Please set a target deadline')
                                        return
                                    }
                                    setIsLoading(true)
                                    const { plan, error: planError } = await generateStrategicPlan(
                                        title,
                                        suggestedTimeframe
                                    )
                                    if (planError || !plan) {
                                        toast.error(planError || 'Failed to generate plan')
                                        setIsLoading(false)
                                        return
                                    }
                                    const { objectiveId, error: applyError } = await applyStrategicPlan(
                                        title,
                                        description,
                                        suggestedTimeframe,
                                        plan
                                    )
                                    setIsLoading(false)
                                    if (applyError || !objectiveId) {
                                        toast.error(applyError || 'Failed to apply plan')
                                        return
                                    }
                                    toast.success('Strategic plan created!')
                                    setOpen(false)
                                    window.location.href = `/strategic-planner/${objectiveId}`
                                }}
                                disabled={isLoading || !title.trim() || !suggestedTimeframe}
                                className="min-w-[200px]"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        AI is building your plan...
                                    </>
                                ) : (
                                    <>
                                        <Map className="h-4 w-4" />
                                        Generate Strategic Plan
                                    </>
                                )}
                            </Button>
                        </div>
                    ) : (
                        /* Other modes: original footer */
                        <>
                            <div className="flex-1 text-sm text-muted-foreground">
                                {mode === 'pack' && selectedPack && "This will create 1 objective and multiple tasks."}
                                {mode === 'import' && selectedAnalysisIndex !== null && "AI generated tasks will be created."}
                            </div>

                            <Button variant="secondary" onClick={() => setOpen(false)} disabled={isLoading}>
                                Cancel
                            </Button>

                            <Button
                                onClick={() => handleCreate()}
                                variant="default"
                                disabled={isLoading || (mode === 'pack' && !selectedPack) || (mode === 'import' && selectedAnalysisIndex === null) || !title.trim()}
                                className="min-w-[140px] shadow-sm"
                            >
                                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                {!isLoading && <Plus className="h-4 w-4" />}
                                {mode === 'manual' ? 'Create Objective' : 'Add Objective and Tasks'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
