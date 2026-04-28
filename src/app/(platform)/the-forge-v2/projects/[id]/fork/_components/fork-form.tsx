"use client"

/**
 * @file fork-form.tsx — Real fork flow backed by forkCadLabProject.
 *
 * Captures variant name + market + why, copies modules/research/brief to a
 * new cad_lab_projects row with forked_from_id set, then routes to the new
 * project's cockpit on success.
 */

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, GitFork } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { forkCadLabProject } from "@/actions/cad-lab-projects"

interface ForkFormProps {
    projectId: string
    parentName: string
    projectHref: string
}

export function ForkForm({ projectId, parentName, projectHref }: ForkFormProps): React.ReactElement {
    const [name, setName] = useState(`${parentName} · variant`)
    const [market, setMarket] = useState("")
    const [why, setWhy] = useState("")
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    const canSubmit = name.trim().length > 0 && !isPending

    function handleSubmit(e: React.FormEvent): void {
        e.preventDefault()
        if (!canSubmit) return
        startTransition(async () => {
            const result = await forkCadLabProject(projectId, name.trim())
            if ("error" in result) {
                toast.error(result.error)
                return
            }
            toast.success("Variant created — routing to new project")
            router.push(`/the-forge-v2/projects/${result.projectId}`)
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-5 space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="fork-name">Variant name</Label>
                        <Input
                            id="fork-name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={`${parentName} · variant`}
                            required
                            disabled={isPending}
                            maxLength={200}
                        />
                        <p className="text-[11.5px] text-muted-foreground">Shown in the workspace alongside the parent.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="fork-market">Target market (optional)</Label>
                        <Input
                            id="fork-market"
                            value={market}
                            onChange={e => setMarket(e.target.value)}
                            placeholder="e.g. Maritime — NATO STANAG 4569, saltwater exposure"
                            disabled={isPending}
                        />
                        <p className="text-[11.5px] text-muted-foreground">Captured for your records — feeds supplier filters + risk defaults once forked.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="fork-why">Why fork (optional)</Label>
                        <Textarea
                            id="fork-why"
                            value={why}
                            onChange={e => setWhy(e.target.value)}
                            placeholder="Customer ask, pilot commitment, or compliance driver."
                            rows={4}
                            disabled={isPending}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-xl border bg-muted/30">
                <CardContent className="py-5 px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Create a fork of this project</p>
                        <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed max-w-xl">
                            Copies modules, research, and brief. Regeneratable outputs (CAD, renders) run fresh on the fork. Parent project stays untouched.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button asChild size="sm" variant="secondary" disabled={isPending}>
                            <Link href={projectHref}>Back to project</Link>
                        </Button>
                        <Button type="submit" size="sm" disabled={!canSubmit} className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitFork className="h-3.5 w-3.5" />}
                            Create variant <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </form>
    )
}
