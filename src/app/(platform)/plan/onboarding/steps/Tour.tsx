/**
 * @file Tour.tsx — Step 5 of Plan onboarding (final).
 *
 * @description Static annotated preview of the Plan workspace. Three callouts
 * highlight where Pinned goals, This-Week tasks, and the Signal rail live.
 * The parent flow renders the "Enter Workspace" CTA that routes to /plan.
 */

"use client"

import { Pin, ListTodo, Radio } from "lucide-react"

const HIGHLIGHTS: ReadonlyArray<{
    icon: React.ComponentType<{ className?: string }>
    title: string
    body: string
    position: string
}> = [
    {
        icon: Pin,
        title: "Pinned Goals",
        body: "Your three priority goals sit at the top of the workspace. Everything else is one click away.",
        position: "col-span-2",
    },
    {
        icon: ListTodo,
        title: "This Week",
        body: "Tasks you've pinned for the week — closeable from here, no drilling.",
        position: "col-span-1",
    },
    {
        icon: Radio,
        title: "Signal rail",
        body: "Specialist flags, gutcheck nudges, and updates from fractionals. Keeps the workspace quiet by default.",
        position: "col-span-1",
    },
]

export function TourStep(): React.ReactElement {
    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Your workspace, in three parts.
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                    Plan stays quiet. You'll only hear from it when something
                    needs your attention.
                </p>
            </div>

            {/* Schematic preview */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="grid grid-cols-3 gap-4">
                    {HIGHLIGHTS.map(({ icon: Icon, title, body, position }) => (
                        <div
                            key={title}
                            className={
                                "rounded-lg border border-border bg-background p-4 " +
                                position
                            }
                        >
                            <div className="flex items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent-foreground">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground">
                                        {title}
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                        {body}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card/60 p-5">
                <p className="text-sm text-muted-foreground">
                    Tip — press{" "}
                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground">
                        g p
                    </kbd>{" "}
                    from anywhere in the programme to jump back to Plan.
                </p>
            </div>
        </div>
    )
}
