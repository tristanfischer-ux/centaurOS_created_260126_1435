"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { updateObjective } from "@/actions/objectives"

interface Objective {
    id: string
    title: string
    description: string | null
    extended_description: string | null
}

interface EditObjectiveDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Callback when dialog open state changes */
    onOpenChange: (open: boolean) => void
    /** The objective to edit */
    objective: Objective
}

/**
 * EditObjectiveDialog - Inline editing dialog for objective details.
 * 
 * @description Allows users to edit an objective's title, description,
 * and extended description without navigating to a new page.
 * 
 * @component
 * 
 * @example
 * <EditObjectiveDialog
 *   open={isEditOpen}
 *   onOpenChange={setIsEditOpen}
 *   objective={selectedObjective}
 * />
 */
export function EditObjectiveDialog({ open, onOpenChange, objective }: EditObjectiveDialogProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [title, setTitle] = useState(objective.title)
    const [description, setDescription] = useState(objective.description || "")
    const [extendedDescription, setExtendedDescription] = useState(objective.extended_description || "")

    // Reset form when dialog opens or objective changes
    useEffect(() => {
        if (open) {
            setTitle(objective.title)
            setDescription(objective.description || "")
            setExtendedDescription(objective.extended_description || "")
        }
    }, [open, objective])

    const handleSave = async () => {
        // VALIDATION: Title is required
        if (!title.trim()) {
            toast.error("Title is required")
            return
        }

        setIsLoading(true)

        try {
            const result = await updateObjective(objective.id, {
                title: title.trim(),
                description: description.trim() || null,
                extendedDescription: extendedDescription.trim() || null
            })

            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Objective updated")
                onOpenChange(false)
            }
        } catch (error) {
            console.error('[EditObjectiveDialog] Failed to update objective:', {
                objectiveId: objective.id,
                error: error instanceof Error ? error.message : 'Unknown error'
            })
            toast.error("Failed to update objective")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md" className="max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle>Edit Objective</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-2 flex-1 overflow-y-auto">
                    {/* Title */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-objective-title">
                            Title <span className="text-destructive" aria-label="required">*</span>
                        </Label>
                        <Input
                            id="edit-objective-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter objective title"
                            maxLength={200}
                            autoFocus
                            aria-required="true"
                            aria-invalid={!title.trim()}
                        />
                        <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-objective-description">
                            Description <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <Textarea
                            id="edit-objective-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of the objective"
                            className="min-h-[80px]"
                            maxLength={10000}
                        />
                        <p className="text-xs text-muted-foreground text-right">{description.length}/10,000</p>
                    </div>

                    {/* Extended Description */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-objective-extended">
                            Extended Context <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <Textarea
                            id="edit-objective-extended"
                            value={extendedDescription}
                            onChange={(e) => setExtendedDescription(e.target.value)}
                            placeholder="Additional context, background information, or detailed requirements"
                            className="min-h-[150px]"
                            maxLength={50000}
                        />
                        <p className="text-xs text-muted-foreground">
                            Use this for detailed context that helps team members understand the full scope.
                        </p>
                    </div>
                </div>

                <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t">
                    <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} variant="default" disabled={isLoading || !title.trim()}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
