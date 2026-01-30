"use client"

import { createObjective } from "@/actions/objectives"
import { getObjectivePacks, ObjectivePack } from "@/actions/packs"
import { analyzeBusinessPlan, AnalyzedObjective } from "@/actions/analyze"
import { toast } from "sonner"
import { useEffect, useState, useCallback } from "react"
import {
    Loader2,
    Plus,
    FileText,
    Package,
    Upload,
    ArrowLeft,
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
    DollarSign,
    ShieldCheck,
    Search,
    UserPlus,
    ClipboardCheck,
    Users
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"

type CreationMode = 'manual' | 'pack' | 'import'

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
    'dollar-sign': DollarSign,
    'shield-check': ShieldCheck,
    'search': Search,
    'user-plus': UserPlus,
    'clipboard-check': ClipboardCheck,
    'users': Users,
}

interface CreateObjectiveDialogProps {
    children?: React.ReactNode
}

export function CreateObjectiveDialog({ children }: CreateObjectiveDialogProps) {
    const [open, setOpen] = useState(false)
    const [mode, setMode] = useState<CreationMode>('manual')
    const [isLoading, setIsLoading] = useState(false)

    // Manual Data
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [titleError, setTitleError] = useState<string | null>(null)
    const [descriptionError, setDescriptionError] = useState<string | null>(null)
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Pack Data
    const [packs, setPacks] = useState<ObjectivePack[]>([])
    const [selectedPack, setSelectedPack] = useState<ObjectivePack | null>(null)
    const [isPackLoading, setIsPackLoading] = useState(false)
    const [packError, setPackError] = useState<string | null>(null)
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
    const [packSearchQuery, setPackSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

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

    // Load packs on open
    useEffect(() => {
        if (open) {
            loadPacksCallback()
        } else {
            // Reset state on close
            setTimeout(() => {
                setMode('manual')
                setTitle("")
                setDescription("")
                setSelectedPack(null)
                setSelectedTaskIds([])
                setAnalyzedObjectives([])
                setSelectedAnalysisIndex(null)
                setAnalysisFile(null)
                setPackError(null)
                setPackSearchQuery('')
                setSelectedCategory(null)
                setShowAdvanced(false)
            }, 300)
        }
    }, [open, loadPacksCallback])

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

    const handleCreate = async () => {
        // Reset errors
        setTitleError(null)
        setDescriptionError(null)

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
        if (description && description.trim().length > 10000) {
            setDescriptionError("Description must be 10,000 characters or less")
            toast.error("Description must be 10,000 characters or less")
            return
        }

        setIsLoading(true)
        const formData = new FormData()
        formData.append('title', title)
        formData.append('description', description)

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

    const getModeIcon = (m: CreationMode) => {
        switch (m) {
            case 'manual': return FileText;
            case 'pack': return Package;
            case 'import': return Upload;
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || (
                    <Button size="sm" className="bg-background text-black hover:bg-gray-200 border border-transparent shadow-sm">
                        <Plus className="h-4 w-4" /> New Objective
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[800px] max-h-[90dvh] flex flex-col p-0 gap-0 bg-background sm:rounded-xl overflow-hidden">
                {/* Header Section */}
                <div className="p-6 pb-4 bg-muted/50">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">
                            {mode === 'manual' && "Define Strategic Objective"}
                            {mode === 'pack' && (selectedPack ? "Configure Objective Pack" : "Select Objective Pack")}
                            {mode === 'import' && "Import from Business Plan"}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {mode === 'manual' && "Manually define your objective and success criteria."}
                            {mode === 'pack' && !selectedPack && "Choose a pre-configured template to jumpstart your strategy."}
                            {mode === 'pack' && selectedPack && `Review tasks included in the "${selectedPack.title}" pack.`}
                            {mode === 'import' && "Upload a business plan to automatically generate objectives."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Mode Selector - Always show, but make it smaller/less prominent when in a sub-flow */}
                    <div className={cn(
                        "flex items-center gap-2 mt-6 transition-all",
                        ((mode === 'pack' && selectedPack) || (mode === 'import' && analyzedObjectives.length > 0)) && "opacity-60 scale-95"
                    )}>
                        {(['manual', 'pack', 'import'] as CreationMode[]).map((m) => {
                            const Icon = getModeIcon(m)
                            const isDisabled = (mode === 'pack' && selectedPack && m !== 'pack') || 
                                            (mode === 'import' && analyzedObjectives.length > 0 && m !== 'import')
                            return (
                                <button
                                    key={m}
                                    onClick={() => {
                                        if (!isDisabled) {
                                            setMode(m)
                                            // Reset sub-flow state when switching modes
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
                                            ? "bg-slate-900 text-white shadow-md"
                                            : "bg-background text-muted-foreground hover:bg-muted shadow-sm",
                                        isDisabled && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                    {m.charAt(0).toUpperCase() + m.slice(1)}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Main Content Area */}
                <ScrollArea className="flex-1 bg-white">
                    <div className="p-6">

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

                                {/* Optional Description */}
                                {showAdvanced && (
                                    <div className="space-y-2">
                                        <Label htmlFor="description" className="text-base font-semibold">Description & Success Criteria</Label>
                                        <Textarea
                                            id="description"
                                            placeholder="Define the scope, key results, and success metrics..."
                                            value={description}
                                            onChange={(e) => {
                                                setDescription(e.target.value)
                                                setDescriptionError(null)
                                            }}
                                            className={cn("min-h-[200px] resize-none", descriptionError && "border-destructive")}
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
                                                {description.length} / 10,000 characters {description.length > 0 && '(Markdown supported)'}
                                            </p>
                                        )}
                                    </div>
                                )}
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
                                                                selectedCategory === cat ? "bg-slate-900 text-white" : "bg-muted"
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
                                                    <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
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
                                                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-2 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                                                    <Icon className="w-5 h-5 text-muted-foreground group-hover:text-blue-600" />
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
                                                <div className="divide-y divide-slate-100">
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
                                                                <p className="text-sm text-muted-foreground">{item.description}</p>
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
                                            className="bg-muted/50 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4 hover:bg-blue-50/20 transition-all cursor-pointer group relative"
                                        >
                                            <Input
                                                type="file"
                                                accept=".pdf,.txt,.md"
                                                className="absolute inset-0 opacity-0 cursor-pointer h-full z-10"
                                                onChange={handleFileUpload}
                                            />
                                            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Upload className="w-8 h-8 text-blue-600" />
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
                                            <div className="w-16 h-16 rounded-full bg-muted border-t-4 border-t-blue-600 animate-spin"></div>
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
                                                            ? "border-blue-600 bg-blue-50/30 ring-1 ring-blue-600 shadow-sm"
                                                            : "hover:shadow-md bg-white"
                                                    )}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h4 className="font-semibold text-foreground">{obj.title}</h4>
                                                        {selectedAnalysisIndex === idx && <Check className="w-4 h-4 text-blue-600" />}
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
                                                    className={cn("resize-none h-24 bg-white", descriptionError && "border-destructive")}
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

                    </div>
                </ScrollArea>

                {/* Footer Actions */}
                <DialogFooter className="p-6 pt-4 bg-muted/50">
                    <div className="flex-1 text-sm text-muted-foreground">
                        {mode === 'pack' && selectedPack && "This will create 1 objective and multiple tasks."}
                        {mode === 'import' && selectedAnalysisIndex !== null && "AI generated tasks will be created."}
                    </div>

                    <Button variant="secondary" onClick={() => setOpen(false)} disabled={isLoading}>
                        Cancel
                    </Button>

                    <Button
                        onClick={handleCreate}
                        variant="default"
                        disabled={isLoading || (mode === 'pack' && !selectedPack) || (mode === 'import' && selectedAnalysisIndex === null) || !title.trim()}
                        className="min-w-[140px] shadow-sm"
                    >
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {!isLoading && <Plus className="h-4 w-4" />}
                        {mode === 'manual' ? 'Create Objective' : 'Add Objective and Tasks'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
