'use client'

/**
 * DirectorySearch - Search and filter bar for the expert directory.
 *
 * @description Provides keyword search and role/location filters.
 * Updates URL search params for server-side filtering and SEO.
 *
 * @component
 *
 * @example
 * <DirectorySearch />
 */

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DIRECTORY_ROLE_CATEGORIES } from '@/lib/directory/types'
import type { DirectoryRoleSlug } from '@/lib/directory/types'

interface DirectorySearchProps {
    /** Current active role filter (from URL) */
    activeRole?: string
    /** Current active location filter (from URL) */
    activeLocation?: string
    /** Total number of results for current filters */
    totalResults?: number
}

export function DirectorySearch({
    activeRole,
    activeLocation,
    totalResults,
}: DirectorySearchProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [query, setQuery] = useState(searchParams.get('q') || '')

    const handleSearch = useCallback(() => {
        const params = new URLSearchParams()
        if (query.trim()) params.set('q', query.trim())
        const paramString = params.toString()
        router.push(`/experts${paramString ? `?${paramString}` : ''}`)
    }, [query, router])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') handleSearch()
        },
        [handleSearch]
    )

    const handleClearSearch = useCallback(() => {
        setQuery('')
        router.push('/experts')
    }, [router])

    const roleEntries = Object.entries(DIRECTORY_ROLE_CATEGORIES) as [
        DirectoryRoleSlug,
        (typeof DIRECTORY_ROLE_CATEGORIES)[DirectoryRoleSlug],
    ][]

    return (
        <div className="space-y-4">
            {/* Search bar */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search by name, skill, or industry..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="pl-10"
                        aria-label="Search experts"
                    />
                    {query && (
                        <button
                            onClick={handleClearSearch}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <Button onClick={handleSearch} className="gap-1.5">
                    <Search className="h-4 w-4" />
                    Search
                </Button>
            </div>

            {/* Role filter chips */}
            <div className="flex flex-wrap gap-2">
                <Badge
                    variant={!activeRole ? 'default' : 'secondary'}
                    className="cursor-pointer transition-colors hover:bg-accent/80"
                    onClick={() => router.push('/experts')}
                >
                    All Experts
                </Badge>
                {roleEntries.map(([slug, category]) => (
                    <Badge
                        key={slug}
                        variant={activeRole === slug ? 'default' : 'secondary'}
                        className="cursor-pointer transition-colors hover:bg-accent/80"
                        onClick={() => router.push(`/experts/${slug}`)}
                    >
                        {category.label}
                    </Badge>
                ))}
            </div>

            {/* Active filters & count */}
            {(activeRole || activeLocation || totalResults !== undefined) && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {totalResults !== undefined && (
                        <span>
                            <span className="font-semibold text-foreground">
                                {totalResults}
                            </span>{' '}
                            {totalResults === 1 ? 'expert' : 'experts'} found
                        </span>
                    )}
                    {(activeRole || activeLocation) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push('/experts')}
                            className="h-7 gap-1 text-xs"
                        >
                            <X className="h-3 w-3" />
                            Clear filters
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
