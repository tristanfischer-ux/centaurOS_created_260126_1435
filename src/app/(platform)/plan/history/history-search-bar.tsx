"use client"

/**
 * @file history-search-bar.tsx — Tiny client search box for /plan/history.
 *
 * @description Hero-level search input. On submit, pushes a new URL with the
 * current `q` value — the page re-renders as a server component with FTS
 * applied. Search is the primary surface here, NOT a feed. See PLAN-SCHEMA
 * §9 (FTS index is already live).
 */

import { useRouter, useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"

interface Props {
    initialQuery: string
}

export function HistorySearchBar({ initialQuery }: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [q, setQ] = useState(initialQuery)
    const [isPending, startTransition] = useTransition()

    function pushQuery(nextQ: string) {
        const params = new URLSearchParams(searchParams?.toString() ?? "")
        if (nextQ.trim()) params.set("q", nextQ.trim())
        else params.delete("q")
        params.delete("page")
        const qs = params.toString()
        startTransition(() => {
            router.push(qs ? `/plan/history?${qs}` : "/plan/history")
        })
    }

    return (
        <form
            className="relative"
            onSubmit={(e) => {
                e.preventDefault()
                pushQuery(q)
            }}
        >
            <label htmlFor="plan-history-search" className="sr-only">
                Search decision log
            </label>
            <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            />
            <input
                id="plan-history-search"
                type="search"
                placeholder="Search decisions, updates, pressure-tests, notes…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-14 w-full rounded-xl border border-border bg-card pl-12 pr-24 text-base text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/40"
                autoComplete="off"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {q.trim() ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            setQ("")
                            pushQuery("")
                        }}
                        aria-label="Clear search"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                ) : null}
                <Button type="submit" size="sm" disabled={isPending}>
                    Search
                </Button>
            </div>
        </form>
    )
}
