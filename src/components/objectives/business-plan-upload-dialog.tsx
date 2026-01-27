'use client'

import { useState, useTransition } from 'react'
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
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Upload, Loader2 } from "lucide-react"
import { analyzeBusinessPlan, ExtractedObjective } from '@/app/actions/analyze-business-plan'
import { createObjectivesFromPlan } from '@/app/actions/create-from-plan'
import { toast } from "sonner"

export function BusinessPlanUploadDialog() {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<'upload' | 'review'>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [text, setText] = useState('')
    const [isAnalyzing, startAnalysis] = useTransition()
    const [isCreating, startCreation] = useTransition()

    const [extractedData, setExtractedData] = useState<ExtractedObjective[]>([])
    const [selectedObjectives, setSelectedObjectives] = useState<Set<number>>(new Set())
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set()) // Format: "objIndex-taskIndex"

    const handleAnalyze = () => {
        if (!file && !text) {
            toast.error("Please provide a file or text content")
            return
        }

        startAnalysis(async () => {
            const formData = new FormData()
            if (file) formData.append('file', file)
            formData.append('text', text)

            const result = await analyzeBusinessPlan(formData)

            if (result.success && result.data) {
                setExtractedData(result.data)
                // Select all by default
                const allObjIndices = new Set(result.data.map((_, i) => i))
                setSelectedObjectives(allObjIndices)

                const allTaskIndices = new Set<string>()
                result.data.forEach((obj, objIdx) => {
                    obj.tasks.forEach((_, taskIdx) => {
                        allTaskIndices.add(`${objIdx}-${taskIdx}`)
                    })
                })
                setSelectedTasks(allTaskIndices)

                setStep('review')
            } else {
                toast.error(result.error || "Failed to analyze")
            }
        })
    }

    const handleCreate = () => {
        startCreation(async () => {
            // Filter data based on selection
            const dataToCreate = extractedData
                .filter((_, i) => selectedObjectives.has(i))
                .map((obj, i) => ({
                    ...obj,
                    tasks: obj.tasks.filter((_, j) => selectedTasks.has(`${i}-${j}`))
                }))

            if (dataToCreate.length === 0) {
                toast.error("No items selected")
                return
            }

            const result = await createObjectivesFromPlan(dataToCreate)
            if (result.success) {
                toast.success("Objectives created successfully")
                setOpen(false)
                resetState()
            } else {
                toast.error(result.error || "Failed to create objectives")
            }
        })
    }

    const resetState = () => {
        setStep('upload')
        setFile(null)
        setText('')
        setExtractedData([])
        setSelectedObjectives(new Set())
        setSelectedTasks(new Set())
    }

    const toggleObjective = (index: number) => {
        const newselected = new Set(selectedObjectives)
        if (newselected.has(index)) {
            newselected.delete(index)
            // Deselect all tasks for this objective? Optional UX choice.
        } else {
            newselected.add(index)
        }
        setSelectedObjectives(newselected)
    }

    const toggleTask = (objIndex: number, taskIndex: number) => {
        const key = `${objIndex}-${taskIndex}`
        const newSelected = new Set(selectedTasks)
        if (newSelected.has(key)) {
            newSelected.delete(key)
        } else {
            newSelected.add(key)
        }
        setSelectedTasks(newSelected)
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            setOpen(val)
            if (!val) setTimeout(resetState, 300)
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Import Business Plan
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Import Business Plan</DialogTitle>
                    <DialogDescription>
                        {step === 'upload'
                            ? "Upload a PDF or paste text to extract objectives and tasks."
                            : "Review and select the items you want to create."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4">
                    {step === 'upload' ? (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="file-upload">Upload PDF</Label>
                                <div className="grid w-full max-w-sm items-center gap-1.5">
                                    <Input
                                        id="file-upload"
                                        type="file"
                                        accept=".pdf,.txt"
                                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                                    />
                                </div>
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">Or paste text</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="plan-text">Business Plan Text</Label>
                                <Textarea
                                    id="plan-text"
                                    placeholder="Paste your business plan content here..."
                                    className="min-h-[200px]"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                />
                            </div>
                        </div>
                    ) : (
                        <ScrollArea className="h-[500px] pr-4">
                            <div className="space-y-4">
                                {extractedData.map((obj, i) => (
                                    <Card key={i} className="border-l-4 border-l-primary">
                                        <CardHeader className="pb-2">
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedObjectives.has(i)}
                                                    onCheckedChange={() => toggleObjective(i)}
                                                    id={`obj-${i}`}
                                                    className="mt-1"
                                                />
                                                <div className="grid gap-1.5">
                                                    <Label htmlFor={`obj-${i}`} className="text-base font-semibold leading-none cursor-pointer">
                                                        {obj.title}
                                                    </Label>
                                                    <p className="text-sm text-muted-foreground">
                                                        {obj.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        {obj.tasks.length > 0 && (
                                            <CardContent>
                                                <div className="pl-8 space-y-2">
                                                    <Label className="text-xs font-medium uppercase text-muted-foreground">Suggested Tasks</Label>
                                                    {obj.tasks.map((task, j) => (
                                                        <div key={j} className="flex items-start gap-2">
                                                            <Checkbox
                                                                checked={selectedTasks.has(`${i}-${j}`)}
                                                                onCheckedChange={() => toggleTask(i, j)}
                                                                id={`task-${i}-${j}`}
                                                                disabled={!selectedObjectives.has(i)}
                                                            />
                                                            <Label
                                                                htmlFor={`task-${i}-${j}`}
                                                                className={`text-sm font-normal leading-snug cursor-pointer ${!selectedObjectives.has(i) ? 'opacity-50' : ''}`}
                                                            >
                                                                {task.title}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </div>

                <DialogFooter>
                    {step === 'upload' ? (
                        <Button onClick={handleAnalyze} disabled={(!file && !text) || isAnalyzing}>
                            {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Analyze Plan
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => setStep('upload')} disabled={isCreating}>
                                Back
                            </Button>
                            <Button onClick={handleCreate} disabled={isCreating}>
                                {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Import Selected
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
