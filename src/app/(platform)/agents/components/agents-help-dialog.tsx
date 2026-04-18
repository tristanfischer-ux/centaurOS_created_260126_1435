"use client"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Keyboard,
    GripVertical,
    Link2,
    Play,
    CheckCircle2,
    FileText,
    AlignVerticalSpaceAround,
    Trash2,
    MousePointerSquareDashed,
    UserCheck,
    Sparkles,
} from "lucide-react"

interface AgentsHelpDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * Help dialog for the Agents workflow builder.
 *
 * @description Shows keyboard shortcuts, workflow building steps,
 * execution state explanations, and tips for power users.
 */
export function AgentsHelpDialog({ open, onOpenChange }: AgentsHelpDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md" className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>How to use the Project Builder</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 pt-2">
                    {/* Getting started */}
                    <section>
                        <h3 className="text-sm font-semibold text-foreground mb-3">
                            Getting Started
                        </h3>
                        <div className="grid gap-3">
                            <Step
                                number={1}
                                icon={<GripVertical className="w-4 h-4" />}
                                title="Drag templates onto the canvas"
                                description="Browse the Template Library on the left. Drag any template onto the canvas to add it to your project. You can also drop files directly."
                            />
                            <Step
                                number={2}
                                icon={<Link2 className="w-4 h-4" />}
                                title="Connect them into a chain"
                                description="Drag from the bottom circle of one node to the top circle of another. The output of the first step feeds into the next."
                            />
                            <Step
                                number={3}
                                icon={<FileText className="w-4 h-4" />}
                                title="Add your data"
                                description="Click any node to open its inspector. Paste your data (company info, metrics, documents) into the Input Data field."
                            />
                            <Step
                                number={4}
                                icon={<Play className="w-4 h-4" />}
                                title="Run and review"
                                description="Hit Run Chain to execute. Each step generates output for you to review and approve before it continues to the next."
                            />
                        </div>
                    </section>

                    {/* Node types */}
                    <section>
                        <h3 className="text-sm font-semibold text-foreground mb-3">
                            Step Types
                        </h3>
                        <div className="grid gap-2.5">
                            <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted border border-border">
                                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-orange-50 mt-0.5">
                                    <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-foreground">Automated steps</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                        Generate content, analysis, and drafts. You review and approve each output before it moves on.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-blue-100 mt-0.5">
                                    <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-foreground">People steps</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                        Tasks for you and your team — gathering context, reviewing with stakeholders, making decisions. Complete the checklist and mark done to continue.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Keyboard shortcuts */}
                    <section>
                        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                            <Keyboard className="w-4 h-4 text-muted-foreground" />
                            Keyboard Shortcuts
                        </h3>
                        <div className="rounded-lg border bg-muted/30 divide-y">
                            <Shortcut keys={["Delete", "Backspace"]} label="Delete selected node(s)" />
                            <Shortcut keys={["Cmd", "Enter"]} label="Run selected node" />
                            <Shortcut keys={["Cmd", "Shift", "Enter"]} label="Run entire chain" />
                            <Shortcut keys={["Cmd", "S"]} label="Save project" />
                        </div>
                    </section>

                    {/* Execution states */}
                    <section>
                        <h3 className="text-sm font-semibold text-foreground mb-3">
                            Execution States
                        </h3>
                        <div className="space-y-2">
                            <StateRow color="bg-slate-300" label="Idle" description="Not yet run" />
                            <StateRow color="bg-blue-500" label="Running" description="Generating output" />
                            <StateRow color="bg-amber-500" label="Review" description="Output ready for your approval" />
                            <StateRow color="bg-emerald-500" label="Approved" description="You approved this step" />
                            <StateRow color="bg-red-500" label="Error" description="Something went wrong" />
                        </div>
                    </section>

                    {/* Tips */}
                    <section>
                        <h3 className="text-sm font-semibold text-foreground mb-3">
                            Tips
                        </h3>
                        <div className="space-y-2 text-xs text-muted-foreground">
                            <Tip
                                icon={<MousePointerSquareDashed className="w-3.5 h-3.5" />}
                                text="Drag on the canvas background to select multiple nodes at once"
                            />
                            <Tip
                                icon={<AlignVerticalSpaceAround className="w-3.5 h-3.5" />}
                                text='Click "Tidy Up" in the toolbar to auto-arrange nodes into a clean layout'
                            />
                            <Tip
                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                text='Use "Clear" in the toolbar to remove all nodes and start fresh'
                            />
                            <Tip
                                icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                text="You can edit the output before approving. Your changes flow to the next step."
                            />
                        </div>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ─── Sub-components ──────────────────────────────────────────────────

function Step({
    number,
    icon,
    title,
    description,
}: {
    number: number
    icon: React.ReactNode
    title: string
    description: string
}) {
    return (
        <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-international-orange text-white flex items-center justify-center text-xs font-semibold">
                {number}
            </div>
            <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    {icon} {title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {description}
                </p>
            </div>
        </div>
    )
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
    return (
        <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="flex items-center gap-1">
                {keys.map((key) => (
                    <kbd
                        key={key}
                        className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono text-foreground"
                    >
                        {key === "Cmd" ? "\u2318" : key}
                    </kbd>
                ))}
            </div>
        </div>
    )
}

function StateRow({ color, label, description }: { color: string; label: string; description: string }) {
    return (
        <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
            <span className="text-xs font-medium text-foreground w-20">{label}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
        </div>
    )
}

function Tip({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0">{icon}</span>
            <span>{text}</span>
        </div>
    )
}
