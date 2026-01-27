"use client"

import { useState } from "react"
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
import { Loader2, ChevronDown, ChevronUp } from "lucide-react"
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
                <Button size="sm" variant="primary">Create RFQ</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-white text-slate-900 border-slate-200">
                <DialogHeader>
                    <DialogTitle>Create Manufacturing RFQ</DialogTitle>
                    <DialogDescription>
                        Submit your specifications to our network of vetted manufacturers.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    {/* Always visible - Required */}
                    <div className="grid gap-2">
                        <Label htmlFor="title">Project Title</Label>
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
                            className={titleError ? 'border-red-500' : ''}
                            aria-describedby={titleError ? "title-error" : undefined}
                            aria-invalid={!!titleError}
                        />
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
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="primary" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit RFQ
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
