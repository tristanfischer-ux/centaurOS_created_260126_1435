"use client"
import { createObjective } from "@/actions/objectives"
import { getObjectivePacks, getPackDetails, ObjectivePack } from "@/actions/packs"
import { analyzeBusinessPlan, AnalyzedObjective } from "@/actions/analyze"
import { toast } from "sonner"
import { useEffect, useState, useRef } from "react"
import { Loader2, Plus, BookTemplate, Upload, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function CreateObjectiveDialog({ disabled }: { disabled?: boolean }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    // Manual / Pack Mode State
    const [packs, setPacks] = useState<ObjectivePack[]>([])
    const [selectedPackId, setSelectedPackId] = useState<string>("none")
    const [selectedPack, setSelectedPack] = useState<ObjectivePack | null>(null)
    const [loadingPack, setLoadingPack] = useState(false)
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

    // AI Import Mode State
    const [analyzedObjectives, setAnalyzedObjectives] = useState<AnalyzedObjective[]>([])
    const [analyzing, setAnalyzing] = useState(false)
    const [selectedObjectiveIndex, setSelectedObjectiveIndex] = useState<number | null>(null)
    const [aiTasksSelected, setAiTasksSelected] = useState<Set<number>>(new Set()) // Indices of tasks in the selected objective

    useEffect(() => {
        async function loadPacks() {
            const { packs } = await getObjectivePacks()
            if (packs) setPacks(packs)
        }
        if (open) {
            loadPacks()
        }
    }, [open])

    // Load Pack Details
    useEffect(() => {
        if (selectedPackId === "none") return

        async function loadDetails() {
            setLoadingPack(true)
            const { pack, error } = await getPackDetails(selectedPackId)
            setLoadingPack(false)
            if (error) {
                toast.error("Failed to load pack details")
                return
            }
            if (pack) {
                setSelectedPack(pack)
                // Select all by default
                if (pack.items) {
                    setSelectedItems(new Set(pack.items.map(i => i.id)))
                }
            }
        }
        loadDetails()
    }, [selectedPackId])

    const toggleItem = (id: string) => {
        const next = new Set(selectedItems)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedItems(next)
    }

    // AI Analysis Handler
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setAnalyzing(true)
        setAnalyzedObjectives([])
        setSelectedObjectiveIndex(null)

        const formData = new FormData()
        formData.append('file', file)

        const result = await analyzeBusinessPlan(formData)
        setAnalyzing(false)

        if (result.error) {
            toast.error(result.error)
        } else if (result.objectives && result.objectives.length > 0) {
            setAnalyzedObjectives(result.objectives)
            // Auto-select first objective to show something
            setSelectedObjectiveIndex(0)
            // Auto-select all tasks for first objective
            const allTaskIndices = new Set(result.objectives[0].tasks.map((_, i) => i))
            setAiTasksSelected(allTaskIndices)
            toast.success(`Found ${result.objectives.length} strategic objectives!`)
        } else {
            toast.warning("No objectives found in document.")
        }
    }

    const toggleAiTask = (index: number) => {
        const next = new Set(aiTasksSelected)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        setAiTasksSelected(next)
    }

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setLoading(true)
        const formData = new FormData(event.currentTarget)

        try {
            const res = await createObjective(formData)
            if (res?.error) {
                toast.error(res.error)
            } else {
                toast.success("Objective Initiated")
                setOpen(false)
                // Reset selection
                setSelectedPackId("none")
                setSelectedPack(null)
                setSelectedItems(new Set())
                setAnalyzedObjectives([])
                setSelectedObjectiveIndex(null)
            }
        } catch (e) {
            toast.error("An unexpected error occurred")
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="bg-white text-black hover:bg-gray-200" disabled={disabled}>
                    <Plus className="mr-2 h-4 w-4" /> New Objective
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] bg-white text-slate-900 border-slate-200 max-h-[90vh] overflow-y-auto">
                <form onSubmit={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>Define Strategic Objective</DialogTitle>
                        <DialogDescription>
                            Create a new strategic objective to align your team.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="manual" className="w-full mt-4">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="manual">Manual / Pack</TabsTrigger>
                            <TabsTrigger value="import">Import Business Plan</TabsTrigger>
                        </TabsList>

                        <TabsContent value="manual" className="mt-0 space-y-4">
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="title">Objective Title</Label>
                                    <Input
                                        id="title"
                                        name="title"
                                        placeholder="e.g. Expand Market Share"
                                        required
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea
                                        id="description"
                                        name="description"
                                        placeholder="Success criteria and scope..."
                                        className="h-24"
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label className="flex items-center gap-2">
                                        <BookTemplate className="h-4 w-4" />
                                        Use Objective Pack (Optional)
                                    </Label>
                                    <Select name="playbookId" onValueChange={(val) => {
                                        setSelectedPackId(val)
                                        if (val === "none") {
                                            setSelectedPack(null)
                                            setSelectedItems(new Set())
                                        }
                                    }} value={selectedPackId}>
                                        <SelectTrigger className="bg-white border-slate-200">
                                            <SelectValue placeholder="Select a pack..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None (Empty Objective)</SelectItem>
                                            {packs.map(pb => (
                                                <SelectItem key={pb.id} value={pb.id}>
                                                    {pb.title} {pb.category ? `(${pb.category})` : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {loadingPack && <div className="text-sm text-slate-500 flex items-center py-2"><Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading pack details...</div>}

                                    {selectedPack && selectedPack.items && (
                                        <div className="border border-slate-200 rounded-md p-3 bg-slate-50 space-y-3 mt-2">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-semibold text-slate-800">Pack Tasks</h4>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500">{selectedItems.size} selected</span>
                                                    {selectedItems.size < (selectedPack.items.length || 0) && (
                                                        <Button size="sm" variant="ghost" className="h-auto p-0 text-xs text-blue-600" onClick={(e) => {
                                                            e.preventDefault()
                                                            if (selectedPack.items) setSelectedItems(new Set(selectedPack.items.map(i => i.id)))
                                                        }}>Select All</Button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                                {selectedPack.items.map(item => (
                                                    <div key={item.id} className="flex items-start space-x-2 group">
                                                        <Checkbox
                                                            id={item.id}
                                                            checked={selectedItems.has(item.id)}
                                                            onCheckedChange={() => toggleItem(item.id)}
                                                            className="mt-1"
                                                        />
                                                        {/* Hidden input to submit the selected IDs */}
                                                        <input
                                                            type="hidden"
                                                            name="selectedTaskIds"
                                                            value={item.id}
                                                            disabled={!selectedItems.has(item.id)}
                                                        />
                                                        <div className="grid gap-1.5 leading-none">
                                                            <label
                                                                htmlFor={item.id}
                                                                className="text-sm font-medium leading-tight cursor-pointer group-hover:text-slate-900 text-slate-700"
                                                            >
                                                                {item.title}
                                                            </label>
                                                            <p className="text-xs text-slate-500 line-clamp-2">
                                                                <span className="inline-block bg-slate-200 text-slate-600 px-1 rounded text-[10px] mr-1 mb-0.5">{item.role}</span>
                                                                {item.description}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="bg-slate-900 text-white"
                                >
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Initialize Objective
                                </Button>
                            </DialogFooter>
                        </TabsContent>

                        <TabsContent value="import" className="mt-0 space-y-4">
                            {!analyzedObjectives.length && !analyzing && (
                                <div className="border-2 border-dashed border-slate-200 rounded-lg p-10 flex flex-col items-center justify-center text-center space-y-4 hover:bg-slate-50 transition-colors">
                                    <div className="bg-blue-50 p-4 rounded-full">
                                        <Upload className="h-8 w-8 text-blue-600" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="font-semibold text-slate-900">Upload Business Plan</h3>
                                        <p className="text-sm text-slate-500">Drag and drop your PDF or text file here, or click to browse.</p>
                                    </div>
                                    <Input
                                        type="file"
                                        accept=".pdf,.txt,.md"
                                        className="max-w-xs cursor-pointer"
                                        onChange={handleFileUpload}
                                    />
                                    <p className="text-xs text-slate-400">Supported formats: PDF, TXT, MD</p>
                                </div>
                            )}

                            {analyzing && (
                                <div className="flex flex-col items-center justify-center p-12 space-y-4">
                                    <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                                    <div className="text-center">
                                        <h3 className="font-medium text-slate-900">Analyzing Strategy...</h3>
                                        <p className="text-sm text-slate-500">Extracting objectives and actionable tasks from your plan.</p>
                                    </div>
                                </div>
                            )}

                            {analyzedObjectives.length > 0 && selectedObjectiveIndex !== null && (
                                <div className="space-y-4 pb-0 pt-2">
                                    {analyzedObjectives.length > 1 && (
                                        <div className="mb-4">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Detailed Objectives Found</h4>
                                            <div className="grid grid-cols-1 gap-2">
                                                {analyzedObjectives.map((obj, idx) => (
                                                    <div
                                                        key={idx}
                                                        onClick={() => {
                                                            setSelectedObjectiveIndex(idx)
                                                            const allTaskIndices = new Set(obj.tasks.map((_, i) => i))
                                                            setAiTasksSelected(allTaskIndices)
                                                        }}
                                                        className={`p-3 rounded-md border text-sm cursor-pointer transition-colors ${selectedObjectiveIndex === idx ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:bg-slate-50'}`}
                                                    >
                                                        <div className="font-medium text-slate-900">{obj.title}</div>
                                                        <div className="text-slate-500 line-clamp-1 text-xs">{obj.description}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-slate-50 p-4 rounded-md border border-slate-200 mb-4">
                                        <h3 className="text-sm font-semibold text-slate-900 mb-1">Selected Objective Details</h3>
                                        <div className="grid gap-2">
                                            <Label>Title</Label>
                                            <Input
                                                name="title_ai"
                                                defaultValue={analyzedObjectives[selectedObjectiveIndex].title}
                                                className="bg-white border-slate-300 font-medium"
                                            />
                                        </div>
                                        <div className="grid gap-2 mt-2">
                                            <Label>Description</Label>
                                            <Textarea
                                                name="description_ai"
                                                defaultValue={analyzedObjectives[selectedObjectiveIndex].description}
                                                className="bg-white border-slate-300 text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-slate-800">Suggested Tasks</h4>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-500">{aiTasksSelected.size} selected</span>
                                                <Button size="sm" variant="ghost" className="h-auto p-0 text-xs text-blue-600" onClick={(e) => {
                                                    e.preventDefault()
                                                    const currentObj = analyzedObjectives[selectedObjectiveIndex]
                                                    if (currentObj) setAiTasksSelected(new Set(currentObj.tasks.map((_, i) => i)))
                                                }}>Select All</Button>
                                            </div>
                                        </div>

                                        <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
                                            {analyzedObjectives[selectedObjectiveIndex].tasks.map((task, idx) => (
                                                <div key={idx} className="flex items-start p-3 hover:bg-slate-50 transition-colors">
                                                    <Checkbox
                                                        id={`ai-task-${idx}`}
                                                        checked={aiTasksSelected.has(idx)}
                                                        onCheckedChange={() => toggleAiTask(idx)}
                                                        className="mt-1"
                                                    />
                                                    {aiTasksSelected.has(idx) && (
                                                        <input type="hidden" name="aiTasks" value={JSON.stringify(task)} />
                                                    )}
                                                    <div className="ml-3 grid gap-1">
                                                        <label
                                                            htmlFor={`ai-task-${idx}`}
                                                            className="text-sm font-medium leading-none cursor-pointer text-slate-900"
                                                        >
                                                            {task.title}
                                                        </label>
                                                        <p className="text-xs text-slate-500">
                                                            <span className="inline-block bg-blue-100 text-blue-700 font-medium px-1.5 py-0.5 rounded text-[10px] mr-1.5">{task.role}</span>
                                                            {task.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <DialogFooter>
                                        <Button type="button" variant="outline" onClick={() => {
                                            setAnalyzedObjectives([])
                                            setAnalyzing(false)
                                        }}>
                                            Cancel
                                        </Button>
                                        <Button type="submit" disabled={loading} className="bg-slate-900 text-white">
                                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                            Create Objective
                                        </Button>
                                    </DialogFooter>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </form>
            </DialogContent>
        </Dialog>
    )
}
