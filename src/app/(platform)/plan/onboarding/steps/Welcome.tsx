/**
 * @file Welcome.tsx — Step 1 of Plan onboarding.
 *
 * @description One-line greeting + bulleted preview of the next four steps.
 * No form state; just a continuation button rendered by the parent flow.
 */

"use client"

import { Compass, FlagTriangleRight, UsersRound, LayoutGrid } from "lucide-react"

interface WelcomeStepProps {
    firstName?: string
}

const PREVIEW: ReadonlyArray<{
    icon: React.ComponentType<{ className?: string }>
    title: string
    body: string
}> = [
    {
        icon: Compass,
        title: "Define your foundry's purpose",
        body: "One sentence — why this organisation exists. You can skip and come back.",
    },
    {
        icon: FlagTriangleRight,
        title: "Set your first Strategic Goal",
        body: "What you're trying to prove this quarter, and the assumptions it rests on.",
    },
    {
        icon: UsersRound,
        title: "Invite a fractional (optional)",
        body: "Bring a part-time operator onto a goal. Skip this if it's day one.",
    },
    {
        icon: LayoutGrid,
        title: "See your workspace",
        body: "A quick tour of where your goals, weekly tasks and signals live.",
    },
]

export function WelcomeStep({ firstName }: WelcomeStepProps): React.ReactElement {
    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                    {firstName ? `Welcome, ${firstName}` : "Welcome"}
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Let's set up your Plan.
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                    Four short steps. Skip any that aren't ready yet — you can
                    fill them in from the workspace later.
                </p>
            </div>

            <ul className="space-y-4">
                {PREVIEW.map(({ icon: Icon, title, body }) => (
                    <li
                        key={title}
                        className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
                    >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent-foreground">
                            <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}
