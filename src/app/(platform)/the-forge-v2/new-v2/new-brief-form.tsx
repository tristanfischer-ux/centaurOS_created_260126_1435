"use client"

/**
 * @file new-v2/new-brief-form.tsx — client form for the A1-minimal entry point.
 *
 * Single textarea + optional project name + Go button.
 * On submit:
 *   POST /api/pdf-engine-v2/submit { brief_text, project_name? }
 *   → router.push("/the-forge-v2/runs/<job_id>/wait")
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

interface SubmitResponse {
    job_id?: string
    project_id?: string
    error?: string
}

const MIN_CHARS = 60

export function NewBriefForm(): React.ReactElement {
    const router = useRouter()
    const [brief, setBrief] = useState("")
    const [projectName, setProjectName] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const trimmed = brief.trim()
    const tooShort = trimmed.length < MIN_CHARS
    const disabled = isPending || tooShort

    function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
        event.preventDefault()
        setError(null)
        if (tooShort) {
            setError(
                `Add a bit more detail — at least ${MIN_CHARS} characters helps the engine ask the right questions.`,
            )
            return
        }
        startTransition(async () => {
            try {
                const res = await fetch("/api/pdf-engine-v2/submit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        brief_text: trimmed,
                        project_name: projectName.trim() || undefined,
                    }),
                })
                const data: SubmitResponse = await res.json()
                if (!res.ok || !data.job_id) {
                    setError(data.error ?? `Submission failed (HTTP ${res.status})`)
                    return
                }
                router.push(`/the-forge-v2/runs/${data.job_id}/wait`)
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Network error — try again.",
                )
            }
        })
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
            <div className="space-y-2">
                <label
                    htmlFor="project_name"
                    className="block text-sm font-medium text-slate-700"
                >
                    Project name <span className="text-slate-400">(optional)</span>
                </label>
                <input
                    id="project_name"
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Containerised battery storage system"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    disabled={isPending}
                />
            </div>

            <div className="space-y-2">
                <label
                    htmlFor="brief_text"
                    className="block text-sm font-medium text-slate-700"
                >
                    Describe the product
                </label>
                <textarea
                    id="brief_text"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    rows={12}
                    maxLength={20000}
                    placeholder={
                        "Example: We are designing a containerised 3.5 MWh battery energy storage system for UK grid services. Target market: secondary frequency response and capacity market. Cost ceiling £450,000 ex-VAT per unit. Quantity: 25 units in the first 18 months."
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 font-sans text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    disabled={isPending}
                />
                <div className="flex justify-between text-xs text-slate-500">
                    <span>{trimmed.length} characters</span>
                    {tooShort ? (
                        <span className="text-amber-700">
                            At least {MIN_CHARS} characters required
                        </span>
                    ) : null}
                </div>
            </div>

            {error ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    {error}
                </div>
            ) : null}

            <div className="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={disabled}
                    className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                    {isPending ? "Submitting…" : "Generate engineering report"}
                </button>
                <span className="text-xs text-slate-500">
                    Typically takes 40 to 60 minutes. You will be redirected to a
                    progress page.
                </span>
            </div>
        </form>
    )
}
