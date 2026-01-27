"use client"

import { createObjective } from "@/actions/objectives"
import { getObjectivePacks, ObjectivePack } from "@/actions/packs"
import { analyzeBusinessPlan, AnalyzedObjective } from "@/actions/analyze"
import { toast } from "sonner"
import { useEffect, useState } from "react"
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
    Server
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
import { cn } from "@/lib/utils"

type CreationMode = 'manual' | 'pack' | 'import'

const PACK_ICONS: Record<string, any> = {
    'briefcase': Briefcase,
    'globe': Globe,
    'scale': Scale,
    'building': Building,
    'rocket': Rocket,
    'server': Server,
}

export function CreateObjectiveDialog() {
    const [open, setOpen] = useState(false)
    const [mode, setMode] = useState<CreationMode>('manual')
    const [loading, setLoading] = useState(false)

    // Manual Data
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")

    // Pack Data
    const [packs, setPacks] = useState<ObjectivePack[]>([])
    const [selectedPack, setSelectedPack] = useState<ObjectivePack | null>(null)
    const [packLoading, setPackLoading] = useState(false)
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])

    // Import Data
    const [analyzing, setAnalyzing] = useState(false)
    const [analyzedObjectives, setAnalyzedObjectives] = useState<AnalyzedObjective[]>([])
    const [selectedAnalysisIndex, setSelectedAnalysisIndex] = useState<number | null>(null)
    const [analysisFile, setAnalysisFile] = useState<File | null>(null)

    // Load packs on open
    useEffect(() => {
        if (open) {
            loadPacks()
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
            }, 300)
        }
    }, [open])

    async function loadPacks() {
        setPackLoading(true)
        const { packs } = await getObjectivePacks()
        setPacks(packs || [])
        setPackLoading(false)
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setAnalysisFile(file)
        setAnalyzing(true)
        setAnalyzedObjectives([])
        setSelectedAnalysisIndex(null)

        const formData = new FormData()
        formData.append('file', file)

        const result = await analyzeBusinessPlan(formData)
        setAnalyzing(false)

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

    const handleCreate = async () => {
        if (!title.trim()) {
            toast.error("Objective title is required")
            return
        }

        setLoading(true)
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
                toast.error(res.error)
            } else {
                toast.success("Objective Initiated")
                setOpen(false)
            }
        } catch (e) {
            toast.error("An unexpected error occurred")
            console.error(e)
        } finally {
            setLoading(false)
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
                <Button size="sm" className="bg-white text-black hover:bg-gray-200 border border-transparent shadow-sm">
                    <Plus className="mr-2 h-4 w-4" /> New Objective
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[800px] h-[600px] flex flex-col p-0 gap-0 bg-white sm:rounded-xl overflow-hidden">
                {/* Header Section */}
                <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
                            {mode === 'manual' && "Define Strategic Objective"}
                            {mode === 'pack' && (selectedPack ? "Configure Objective Pack" : "Select Objective Pack")}
                            {mode === 'import' && "Import from Business Plan"}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            {mode === 'manual' && "Manually define your objective and success criteria."}
                            {mode === 'pack' && !selectedPack && "Choose a pre-configured template to jumpstart your strategy."}
                            {mode === 'pack' && selectedPack && `Review tasks included in the "${selectedPack.title}" pack.`}
                            {mode === 'import' && "Upload a business plan to automatically generate objectives."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Mode Selector - Only show if not deep in a sub-flow (like selected pack) to keep it clean, 
                        OR show always for easy switching. Let's show always but disable if loading. */}
                    {!((mode === 'pack' && selectedPack) || (mode === 'import' && analyzedObjectives.length > 0)) && (
                        <div className="flex items-center gap-2 mt-6">
                            {(['manual', 'pack', 'import'] as CreationMode[]).map((m) => {
                                const Icon = getModeIcon(m)
                                return (
                                    <button
                                        key={m}
                                        onClick={() => setMode(m)}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
                                            mode === m
                                                ? "bg-slate-900 text-white shadow-md"
                                                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                                        )}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {m.charAt(0).toUpperCase() + m.slice(1)}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Main Content Area */}
                <ScrollArea className="flex-1 bg-white">
                    <div className="p-6">

                        {/* MANUAL MODE */}
                        {mode === 'manual' && (
                            <div className="space-y-6 max-w-2xl mx-auto pt-4">
                                <div className="space-y-2">
                                    <Label htmlFor="title" className="text-base font-semibold">Objective Title</Label>
                                    <Input
                                        id="title"
                                        placeholder="e.g. Q1 Market Expansion"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="h-12 text-lg"
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description" className="text-base font-semibold">Description & Success Criteria</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="Define the scope, key results, and success metrics..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="min-h-[200px] text-base resize-none p-4"
                                    />
                                    <p className="text-xs text-slate-400 text-right">Markdown supported</p>
                                </div>
                            </div>
                        )}

                        {/* PACK MODE */}
                        {mode === 'pack' && (
                            <div className="h-full">
                                {!selectedPack ? (
                                    // Pack Grid
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {packLoading ? (
                                            <div className="col-span-full flex items-center justify-center py-20">
                                                <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
                                            </div>
                                        ) : packs.map((pack) => {
                                            const Icon = pack.icon_name ? PACK_ICONS[pack.icon_name] || Package : Package
                                            return (
                                                <Card
                                                    key={pack.id}
                                                    className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group border-slate-200"
                                                    onClick={() => {
                                                        setSelectedPack(pack)
                                                        setSelectedTaskIds(pack.items?.map(i => i.id) || []) // Auto-select all by default
                                                        setTitle(pack.title)
                                                        setDescription(pack.description || "")
                                                    }}
                                                >
                                                    <CardHeader className="space-y-1">
                                                        <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center mb-2 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                                            <Icon className="w-5 h-5 text-slate-500 group-hover:text-blue-600" />
                                                        </div>
                                                        <CardTitle className="text-lg">{pack.title}</CardTitle>
                                                        <CardDescription className="line-clamp-2">{pack.description}</CardDescription>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <div className="flex flex-wrap gap-2">
                                                            {pack.category && <Badge variant="secondary" className="text-xs font-normal text-slate-500">{pack.category}</Badge>}
                                                            <Badge variant="outline" className="text-xs font-normal text-slate-500">{pack.items?.length || 0} Tasks</Badge>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    // Selected Pack Details
                                    <div className="space-y-6 max-w-3xl mx-auto">
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedPack(null)} className="mb-2 -ml-2 text-slate-500 hover:text-slate-900">
                                            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Packs
                                        </Button>

                                        <div className="space-y-4">
                                            <div>
                                                <h3 className="text-2xl font-bold text-slate-900">{selectedPack.title}</h3>
                                                <p className="text-slate-500 mt-1 text-lg">{selectedPack.description}</p>
                                            </div>

                                            <div className="border rounded-xl overflow-hidden bg-slate-50">
                                                <div className="px-4 py-3 border-b bg-white font-medium text-sm text-slate-500 flex justify-between items-center">
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
                                                        <div key={item.id} className="p-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors">
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
                                                                <p className="font-medium text-slate-900 text-sm">{item.title}</p>
                                                                <p className="text-sm text-slate-500">{item.description}</p>
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
                                {!analyzedObjectives.length && !analyzing ? (
                                    <div className="w-full">
                                        <div
                                            className="border-2 border-dashed border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4 hover:border-blue-500 hover:bg-blue-50/10 transition-all cursor-pointer group relative"
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
                                                <h3 className="text-lg font-semibold text-slate-900">Upload Business Plan</h3>
                                                <p className="text-slate-500 max-w-sm mx-auto">
                                                    Drag and drop your PDF, TXT, or MD file to automatically extract strategic objectives.
                                                </p>
                                            </div>
                                            <Badge variant="secondary" className="mt-4">AI Powered Analysis</Badge>
                                        </div>
                                    </div>
                                ) : analyzing ? (
                                    <div className="flex flex-col items-center justify-center py-20 space-y-6">
                                        <div className="relative">
                                            <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <img src="/icons/sparkles.svg" className="w-6 h-6 opacity-20" alt="" />
                                            </div>
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h3 className="text-lg font-medium text-slate-900">Analyzing Strategy...</h3>
                                            <p className="text-slate-500">Extracting actionable objectives from {analysisFile?.name}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-semibold text-slate-900">Found {analyzedObjectives.length} Objectives</h3>
                                            <Button variant="ghost" size="sm" onClick={() => {
                                                setAnalyzedObjectives([])
                                                setAnalysisFile(null)
                                            }}>Upload Different File</Button>
                                        </div>

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
                                                            : "border-slate-200 hover:border-slate-300 hover:shadow-sm bg-white"
                                                    )}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h4 className="font-semibold text-slate-900">{obj.title}</h4>
                                                        {selectedAnalysisIndex === idx && <Check className="w-4 h-4 text-blue-600" />}
                                                    </div>
                                                    <p className="text-sm text-slate-600 line-clamp-2">{obj.description}</p>
                                                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200">
                                                            {obj.tasks.length} Tasks Generated
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {selectedAnalysisIndex !== null && (
                                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                                <Label>Refine Selected Objective</Label>
                                                <Input
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    className="bg-white"
                                                />
                                                <Textarea
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    className="resize-none h-24 bg-white"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </ScrollArea>

                {/* Footer Actions */}
                <DialogFooter className="p-6 pt-4 border-t border-slate-100 bg-white">
                    <div className="flex-1 text-sm text-slate-500">
                        {mode === 'pack' && selectedPack && "This will create 1 objective and multiple tasks."}
                        {mode === 'import' && selectedAnalysisIndex !== null && "AI generated tasks will be created."}
                    </div>

                    <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                        Cancel
                    </Button>

                    <Button
                        onClick={handleCreate}
                        disabled={loading || (mode === 'pack' && !selectedPack) || (mode === 'import' && selectedAnalysisIndex === null) || !title.trim()}
                        className="bg-black hover:bg-slate-800 text-white min-w-[140px] shadow-sm"
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {!loading && <Plus className="mr-2 h-4 w-4" />}
                        {mode === 'manual' ? 'Create Objective' : 'Add Objective and Tasks'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
