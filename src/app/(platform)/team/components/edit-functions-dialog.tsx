'use client'

/**
 * EditFunctionsDialog - Dialog to customize business function names and display order
 * 
 * @description Allows foundries to rename the 7 core business functions
 * and reorder them in the Company Orbit view. Uses drag-and-drop for reordering.
 * 
 * @component
 * 
 * @example
 * <EditFunctionsDialog
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   currentFunctions={orbitFunctions}
 *   foundryId={foundryId}
 * />
 */

import { useState, useTransition } from 'react'
import { GripVertical, RotateCcw, Save, AlertCircle } from 'lucide-react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { updateFoundryFunctions } from '@/actions/team'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { BusinessFunction } from '../types'

interface FunctionConfig {
    function_id: string
    label: string
    short: string
    display_order: number
}

interface EditFunctionsDialogProps {
    isOpen: boolean
    onClose: () => void
    currentFunctions: BusinessFunction[]
    foundryId: string
}

const DEFAULT_FUNCTIONS: FunctionConfig[] = [
    { function_id: 'sales', label: 'Sales', short: 'SALES', display_order: 0 },
    { function_id: 'marketing', label: 'Marketing', short: 'MKTG', display_order: 1 },
    { function_id: 'finance', label: 'Finance', short: 'FIN', display_order: 2 },
    { function_id: 'hr', label: 'People & HR', short: 'HR', display_order: 3 },
    { function_id: 'legal', label: 'Legal & Admin', short: 'LEGAL', display_order: 4 },
    { function_id: 'operations', label: 'Operations', short: 'OPS', display_order: 5 },
    { function_id: 'product', label: 'Product', short: 'PROD', display_order: 6 },
]

// ─── Sortable Function Row ───────────────────────────────────────────────────

interface SortableFunctionRowProps {
    config: FunctionConfig
    index: number
    onChange: (index: number, field: 'label' | 'short', value: string) => void
    error?: string
}

function SortableFunctionRow({ config, index, onChange, error }: SortableFunctionRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: config.function_id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'flex items-center gap-3 p-4 rounded-xl border bg-background',
                isDragging ? 'opacity-50 shadow-lg z-50' : '',
                error ? 'border-destructive' : 'border-border'
            )}
        >
            {/* Drag Handle */}
            <button
                type="button"
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
                {...attributes}
                {...listeners}
                aria-label="Drag to reorder"
            >
                <GripVertical className="h-5 w-5" />
            </button>

            {/* Function ID (read-only) */}
            <div className="w-20 shrink-0">
                <span className="text-xs font-mono text-muted-foreground uppercase">
                    {config.function_id}
                </span>
            </div>

            {/* Label Input */}
            <div className="flex-1 space-y-1">
                <Label htmlFor={`label-${config.function_id}`} className="text-xs">
                    Display Name
                </Label>
                <Input
                    id={`label-${config.function_id}`}
                    value={config.label}
                    onChange={(e) => onChange(index, 'label', e.target.value)}
                    placeholder="e.g., Sales"
                    maxLength={50}
                    className={cn(error && 'border-destructive')}
                />
            </div>

            {/* Short Abbreviation Input */}
            <div className="w-28 shrink-0 space-y-1">
                <Label htmlFor={`short-${config.function_id}`} className="text-xs">
                    Abbr
                </Label>
                <Input
                    id={`short-${config.function_id}`}
                    value={config.short}
                    onChange={(e) => onChange(index, 'short', e.target.value.toUpperCase())}
                    placeholder="SALES"
                    maxLength={6}
                    className={cn('font-mono text-center', error && 'border-destructive')}
                />
            </div>
        </div>
    )
}

// ─── Main Dialog Component ───────────────────────────────────────────────────

export function EditFunctionsDialog({
    isOpen,
    onClose,
    currentFunctions,
    foundryId,
}: EditFunctionsDialogProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // Convert current functions to FunctionConfig format with display_order
    const initialConfigs: FunctionConfig[] = currentFunctions.map((fn, idx) => ({
        function_id: fn.id,
        label: fn.label,
        short: fn.short,
        display_order: idx,
    }))

    const [configs, setConfigs] = useState<FunctionConfig[]>(initialConfigs)
    const [error, setError] = useState<string | null>(null)
    const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({})

    // Reset to current functions when dialog opens
    const handleOpenChange = (open: boolean) => {
        if (!open) {
            onClose()
        } else {
            setConfigs(initialConfigs)
            setError(null)
            setFieldErrors({})
        }
    }

    // ── Drag and Drop ─────────────────────────────────────────
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            setConfigs((items) => {
                const oldIndex = items.findIndex((item) => item.function_id === active.id)
                const newIndex = items.findIndex((item) => item.function_id === over.id)

                const reordered = arrayMove(items, oldIndex, newIndex)
                // Update display_order based on new positions
                return reordered.map((item: FunctionConfig, idx: number) => ({
                    ...item,
                    display_order: idx,
                }))
            })
        }
    }

    // ── Field Changes ─────────────────────────────────────────
    const handleChange = (index: number, field: 'label' | 'short', value: string) => {
        setConfigs((prev) =>
            prev.map((item, idx) =>
                idx === index ? { ...item, [field]: value } : item
            )
        )
        // Clear errors when user types
        setError(null)
        setFieldErrors((prev) => {
            const updated = { ...prev }
            delete updated[index]
            return updated
        })
    }

    // ── Validation ────────────────────────────────────────────
    const validate = (): boolean => {
        const newFieldErrors: Record<number, string> = {}
        let hasError = false

        configs.forEach((config, idx) => {
            // Check label
            if (!config.label.trim()) {
                newFieldErrors[idx] = 'Label is required'
                hasError = true
            } else if (config.label.length > 50) {
                newFieldErrors[idx] = 'Label must be 50 characters or less'
                hasError = true
            }

            // Check short
            if (!config.short.trim()) {
                newFieldErrors[idx] = 'Abbreviation is required'
                hasError = true
            } else if (config.short.length < 2 || config.short.length > 6) {
                newFieldErrors[idx] = 'Abbreviation must be 2-6 characters'
                hasError = true
            } else if (config.short !== config.short.toUpperCase()) {
                newFieldErrors[idx] = 'Abbreviation must be uppercase'
                hasError = true
            }
        })

        // Check for duplicate abbreviations
        const shorts = configs.map((c) => c.short)
        const duplicates = shorts.filter((item, index) => shorts.indexOf(item) !== index)
        if (duplicates.length > 0) {
            setError(`Duplicate abbreviations: ${[...new Set(duplicates)].join(', ')}`)
            hasError = true
        }

        setFieldErrors(newFieldErrors)
        return !hasError
    }

    // ── Save ──────────────────────────────────────────────────
    const handleSave = () => {
        if (!validate()) return

        startTransition(async () => {
            const result = await updateFoundryFunctions(foundryId, configs)

            if (result.success) {
                toast.success('Functions updated successfully')
                router.refresh()
                onClose()
            } else {
                setError(result.error || 'Failed to update functions')
                toast.error(result.error || 'Failed to update functions')
            }
        })
    }

    // ── Reset to Defaults ─────────────────────────────────────
    const handleReset = () => {
        setConfigs(DEFAULT_FUNCTIONS)
        setError(null)
        setFieldErrors({})
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent size="lg" className="max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>Customize Business Functions</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Instructions */}
                    <p className="text-sm text-muted-foreground">
                        Rename functions and drag to reorder them clockwise in the orbit view 
                        (starting from top-right). Abbreviations appear in the orbit diagram.
                    </p>

                    {/* Error Alert */}
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Sortable Function List */}
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={configs.map((c) => c.function_id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {configs.map((config, index) => (
                                    <SortableFunctionRow
                                        key={config.function_id}
                                        config={config}
                                        index={index}
                                        onChange={handleChange}
                                        error={fieldErrors[index]}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>

                    {/* Helper Text */}
                    <p className="text-xs text-muted-foreground">
                        The first function appears at the top-right of the orbit, 
                        continuing clockwise. Drag rows to change the order.
                    </p>
                </div>

                <DialogFooter>
                    <div className="flex w-full items-center justify-between">
                        <Button
                            variant="secondary"
                            onClick={handleReset}
                            disabled={isPending}
                        >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reset to Defaults
                        </Button>

                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                onClick={onClose}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={isPending}
                            >
                                {isPending ? (
                                    <>
                                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
