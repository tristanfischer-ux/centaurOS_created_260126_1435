/**
 * @file ViewToggle.tsx
 *
 * @description Switches between "By Category" and "By Product" views on the
 * price index page. URL-driven via searchParams.
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Layers, Package } from 'lucide-react'
import { ViewToggle as ViewToggleBase } from '@/components/ui/view-toggle'

const VIEW_OPTIONS = [
  { value: 'category', label: 'By Category', icon: Layers, ariaLabel: 'View by category' },
  { value: 'product', label: 'By Product', icon: Package, ariaLabel: 'View by product' },
] as const

export function PriceViewToggle() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'category'

  const handleChange = useCallback(
    (newView: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('view', newView)
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  return (
    <ViewToggleBase
      options={[...VIEW_OPTIONS]}
      value={view}
      onValueChange={handleChange}
    />
  )
}
