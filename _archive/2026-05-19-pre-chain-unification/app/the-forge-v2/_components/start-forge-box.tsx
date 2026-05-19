/**
 * @file start-forge-box.tsx — Big textarea + "Start the Forge" button.
 *
 * @description The simplified landing-page input. User types what they want
 * to build, clicks the button, the client action creates a project and kicks
 * off autopilot, then redirects to /the-forge-v2/projects/:id where they see
 * the running state.
 *
 * @related
 * - Action (create): createCadLabProject in @/actions/cad-lab-projects
 * - Action (start):  startAutopilot in @/actions/forge-v2-autopilot
 * - Running state:   ../projects/[id]/page.tsx
 */

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Sparkles, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createCadLabProject } from "@/actions/cad-lab-projects"
import { startAutopilot } from "@/actions/forge-v2-autopilot"

const MIN_CHARS = 30
const MAX_CHARS = 4000

export function StartForgeBox(): React.ReactElement {
    const router = useRouter()
    const [subject, setSubject] = useState("")
    const [isPending, startTransition] = useTransition()

    const trimmed = subject.trim()
    const valid = trimmed.length >= MIN_CHARS && trimmed.length <= MAX_CHARS

    function handleSubmit(): void {
        if (!valid) {
            toast.error(
                trimmed.length < MIN_CHARS
                    ? `Add at least ${MIN_CHARS - trimmed.length} more characters so the Forge has something to work with.`
                    : "Trim your brief to 4,000 characters or fewer.",
            )
            return
        }

        startTransition(async () => {
            const created = await createCadLabProject(trimmed)
            if ("error" in created) {
                toast.error(created.error)
                return
            }

            const started = await startAutopilot(created.projectId)
            if (!started.ok) {
                // Project exists — push them to the workspace anyway so they
                // can retry from the running-state page's Start button.
                toast.error(started.error || "Couldn't start the Forge automatically — open the project and hit Start.")
                router.push(`/the-forge-v2/projects/${created.projectId}`)
                return
            }

            toast.success("The Forge is building your plan — twenty minutes for the first pass, hours of detail after.")
            router.push(`/the-forge-v2/projects/${created.projectId}`)
        })
    }

    return (
        <div className="space-y-4">
            <div className="relative">
                <Textarea
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={"Tell the Forge what you want to build.\n\nExample: A 20-foot shipping-container vertical farm that grows leafy greens year-round in the United Kingdom. Target capital cost under £150k, runs on UK grid power, needs to ship complete on a flatbed lorry."}
                    disabled={isPending}
                    rows={10}
                    maxLength={MAX_CHARS}
                    className="resize-none text-base leading-relaxed min-h-[240px] focus-visible:ring-international-orange"
                    aria-label="Describe what you want to build"
                />
                <div className="absolute bottom-3 right-3 text-[11px] font-mono text-muted-foreground pointer-events-none">
                    {trimmed.length}/{MAX_CHARS}
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    The Forge drafts a full plan — brief, modules, bill of materials, cost, risks, suppliers. Twenty minutes for the first pass, hours of detail after. You review everything before anything locks.
                </p>
                <Button
                    onClick={handleSubmit}
                    disabled={!valid || isPending}
                    size="lg"
                    className="gap-2 bg-international-orange hover:bg-international-orange/90 text-white min-w-[180px]"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Starting…
                        </>
                    ) : (
                        <>
                            <Sparkles className="h-4 w-4" />
                            Start the Forge
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}
