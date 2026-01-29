'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    CoverageStatus,
    AssessmentAnswer,
    FunctionCategory,
    ALL_CATEGORIES,
    CATEGORY_COLORS,
    STATUS_COLORS,
} from '@/types/org-blueprint'
import { saveAssessment, BusinessFunctionWithCoverage } from '@/actions/org-blueprint'
import { toast } from 'sonner'
import {
    CheckCircle2,
    AlertCircle,
    XCircle,
    MinusCircle,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Sparkles,
    User,
    Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AssessmentModalProps {
    functions: BusinessFunctionWithCoverage[]
    onComplete?: () => void
    children: React.ReactNode
}

interface CategoryAnswers {
    [functionId: string]: {
        status: CoverageStatus
        coveredBy?: string
        coveredByType?: 'internal' | 'external'
    }
}

const statusOptions: { status: CoverageStatus; label: string; description: string; icon: React.ReactNode }[] = [
    {
        status: 'covered',
        label: 'Covered Internally',
        description: 'We have this fully covered by our team',
        icon: <User className="h-5 w-5 text-green-600" />,
    },
    {
        status: 'partial',
        label: 'External Provider',
        description: 'We use an external provider/contractor',
        icon: <Building2 className="h-5 w-5 text-blue-600" />,
    },
    {
        status: 'gap',
        label: 'Gap to Fill',
        description: 'This is a gap we need to address',
        icon: <XCircle className="h-5 w-5 text-red-600" />,
    },
    {
        status: 'not_needed',
        label: 'Not Applicable',
        description: "Doesn't apply to our business",
        icon: <MinusCircle className="h-5 w-5 text-gray-400" />,
    },
]

export function AssessmentModal({ functions, onComplete, children }: AssessmentModalProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0)
    const [answers, setAnswers] = useState<CategoryAnswers>({})
    const [isSaving, setIsSaving] = useState(false)

    // Group functions by category (handle both lowercase and capitalized categories)
    const functionsByCategory = useMemo(() => {
        const grouped: Record<string, BusinessFunctionWithCoverage[]> = {}
        functions.forEach(fn => {
            const cat = fn.category
            if (!grouped[cat]) {
                grouped[cat] = []
            }
            grouped[cat].push(fn)
        })
        return grouped
    }, [functions])

    // Get categories that have functions (from actual data)
    const categoriesWithFunctions = useMemo(() => 
        Object.keys(functionsByCategory).filter(cat => functionsByCategory[cat].length > 0).sort(),
        [functionsByCategory]
    )

    const currentCategory = categoriesWithFunctions[currentCategoryIndex]
    const currentFunctions = functionsByCategory[currentCategory] || []
    const totalCategories = categoriesWithFunctions.length
    const progress = ((currentCategoryIndex + 1) / totalCategories) * 100

    // Count answered functions for current category
    const answeredInCurrentCategory = currentFunctions.filter(f => answers[f.id]).length
    const allCurrentAnswered = answeredInCurrentCategory === currentFunctions.length

    const handleStatusSelect = (functionId: string, status: CoverageStatus) => {
        setAnswers(prev => ({
            ...prev,
            [functionId]: {
                ...prev[functionId],
                status,
                coveredByType: status === 'covered' ? 'internal' : status === 'partial' ? 'external' : undefined,
            },
        }))
    }

    const handleCoveredByChange = (functionId: string, coveredBy: string) => {
        setAnswers(prev => ({
            ...prev,
            [functionId]: {
                ...prev[functionId],
                coveredBy,
            },
        }))
    }

    const handleNext = () => {
        if (currentCategoryIndex < totalCategories - 1) {
            setCurrentCategoryIndex(prev => prev + 1)
        }
    }

    const handlePrevious = () => {
        if (currentCategoryIndex > 0) {
            setCurrentCategoryIndex(prev => prev - 1)
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            // Convert answers to AssessmentAnswer array
            const assessmentAnswers: AssessmentAnswer[] = Object.entries(answers).map(
                ([functionId, answer]) => ({
                    functionId,
                    status: answer.status,
                    coveredBy: answer.coveredBy,
                    coveredByType: answer.coveredByType,
                })
            )

            const { error } = await saveAssessment(assessmentAnswers)
            if (error) {
                toast.error('Failed to save assessment')
            } else {
                toast.success('Assessment saved successfully!')
                setIsOpen(false)
                onComplete?.()
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open)
        if (open) {
            // Reset state when opening
            setCurrentCategoryIndex(0)
            // Pre-populate with existing answers
            const existingAnswers: CategoryAnswers = {}
            functions.forEach(fn => {
                if (fn.coverage_status !== 'gap') {
                    existingAnswers[fn.id] = {
                        status: fn.coverage_status,
                        coveredBy: fn.covered_by || undefined,
                    }
                }
            })
            setAnswers(existingAnswers)
        }
    }

    const isLastCategory = currentCategoryIndex === totalCategories - 1
    const totalAnswered = Object.keys(answers).length
    const totalFunctions = functions.length

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent size="lg" className="max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-primary" />
                                Quick Assessment
                            </DialogTitle>
                            <DialogDescription>
                                Step {currentCategoryIndex + 1} of {totalCategories}: {currentCategory}
                            </DialogDescription>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                            {totalAnswered}/{totalFunctions} answered
                        </Badge>
                    </div>
                </DialogHeader>

                {/* Progress bar */}
                <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between">
                        {categoriesWithFunctions.map((cat, index) => (
                            <button
                                key={cat}
                                onClick={() => setCurrentCategoryIndex(index)}
                                className={cn(
                                    "w-3 h-3 rounded-full transition-all",
                                    index === currentCategoryIndex
                                        ? "ring-2 ring-primary ring-offset-2"
                                        : "",
                                    index <= currentCategoryIndex
                                        ? "bg-primary"
                                        : "bg-muted"
                                )}
                                title={cat}
                            />
                        ))}
                    </div>
                </div>

                {/* Category Header */}
                <div className="flex items-center gap-3 py-3 border-b">
                    <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[currentCategory] }}
                    />
                    <h3 className="text-lg font-semibold">{currentCategory}</h3>
                    <Badge variant="secondary" className="ml-auto">
                        {answeredInCurrentCategory}/{currentFunctions.length} answered
                    </Badge>
                </div>

                {/* Function List */}
                <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentCategory}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            {currentFunctions.map((fn, index) => {
                                const answer = answers[fn.id]
                                const showCoveredBy = answer?.status === 'covered' || answer?.status === 'partial'

                                return (
                                    <motion.div
                                        key={fn.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className="border rounded-lg p-4 space-y-3"
                                    >
                                        <div>
                                            <h4 className="font-medium">{fn.name}</h4>
                                            {fn.description && (
                                                <p className="text-sm text-muted-foreground">
                                                    {fn.description}
                                                </p>
                                            )}
                                        </div>

                                        <div className="text-sm font-medium text-muted-foreground">
                                            How do you handle {fn.name.toLowerCase()}?
                                        </div>

                                        {/* Status Options */}
                                        <div className="grid grid-cols-2 gap-2">
                                            {statusOptions.map(option => {
                                                const isSelected = answer?.status === option.status
                                                return (
                                                    <button
                                                        key={option.status}
                                                        onClick={() => handleStatusSelect(fn.id, option.status)}
                                                        className={cn(
                                                            "p-3 rounded-lg border-2 text-left transition-all",
                                                            isSelected
                                                                ? "border-primary bg-primary/5"
                                                                : "border-muted hover:border-muted-foreground/30"
                                                        )}
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            {option.icon}
                                                            <div>
                                                                <p className="font-medium text-sm">{option.label}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {option.description}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>

                                        {/* Covered By Input */}
                                        {showCoveredBy && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="space-y-2"
                                            >
                                                <Label className="text-sm">
                                                    {answer?.status === 'covered'
                                                        ? 'Who on your team handles this?'
                                                        : 'Which provider do you use?'}
                                                </Label>
                                                <Input
                                                    placeholder={
                                                        answer?.status === 'covered'
                                                            ? 'e.g., John Smith, Finance Team'
                                                            : 'e.g., Acme Corp, Freelancer name'
                                                    }
                                                    value={answer?.coveredBy || ''}
                                                    onChange={(e) => handleCoveredByChange(fn.id, e.target.value)}
                                                />
                                            </motion.div>
                                        )}
                                    </motion.div>
                                )
                            })}
                        </motion.div>
                    </AnimatePresence>
                </div>

                <DialogFooter className="border-t pt-4">
                    <div className="flex items-center justify-between w-full">
                        <Button
                            variant="secondary"
                            onClick={handlePrevious}
                            disabled={currentCategoryIndex === 0}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                        </Button>

                        <div className="flex items-center gap-2">
                            {!isLastCategory ? (
                                <Button onClick={handleNext}>
                                    Next
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            ) : (
                                <Button onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            Complete Assessment
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
