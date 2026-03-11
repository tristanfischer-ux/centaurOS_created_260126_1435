/**
 * @file CategoryFilter.tsx
 *
 * @description Category filter pills for the price index page.
 * Preserves other search params (view, etc.) when changing category.
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { cn } from '@/lib/utils'

const CATEGORIES = ['All', 'Herb', 'Microgreen', 'Edible Flower', 'Salad Leaf', 'Sprout'] as const

export function CategoryFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = searchParams.get('category') ?? 'All'

  const handleSelect = useCallback(
    (category: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (category === 'All') {
        params.delete('category')
      } else {
        params.set('category', category)
      }
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => handleSelect(cat)}
          className={cn(
            'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200',
            active === cat
              ? 'bg-international-orange/10 text-international-orange'
              : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80',
          )}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
