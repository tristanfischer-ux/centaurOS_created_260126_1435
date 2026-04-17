/**
 * @file linked-product-chip.tsx — Reverse-link chip shown in the CAD Lab UI
 *
 * @description If the active CAD Lab project has been promoted to a product,
 * this chip appears next to the project name and jumps to that product page.
 * Returns null when no product is linked (or when the project id is absent),
 * so callers don't need to conditionally render.
 *
 * @related
 * - Server action: src/actions/products.ts (getProductByCadLabProjectId)
 * - Used in: /the-forge/cad-lab/page.tsx, /the-forge/cad-lab/build/page.tsx
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { Package } from "lucide-react"
import { getProductByCadLabProjectId } from "@/actions/products"

interface LinkedProductChipProps {
  cadLabProjectId: string | null
  /** Additional class overrides — default chip is orange brand pill. */
  className?: string
}

export function LinkedProductChip({ cadLabProjectId, className }: LinkedProductChipProps) {
  const [product, setProduct] = React.useState<{ id: string; name: string } | null>(null)

  React.useEffect(() => {
    if (!cadLabProjectId) {
      setProduct(null)
      return
    }
    let cancelled = false
    getProductByCadLabProjectId(cadLabProjectId)
      .then((res) => {
        if (cancelled) return
        if ("data" in res && res.data) setProduct({ id: res.data.id, name: res.data.name })
        else setProduct(null)
      })
      .catch(() => { /* best-effort — chip simply won't render */ })
    return () => { cancelled = true }
  }, [cadLabProjectId])

  if (!product) return null

  return (
    <Link
      href={`/products/${product.id}`}
      className={
        "inline-flex items-center gap-1.5 rounded-full bg-international-orange/10 px-2.5 py-1 text-xs font-medium text-international-orange hover:bg-international-orange/15 transition-colors " +
        (className ?? "")
      }
      title={`Open product: ${product.name}`}
      aria-label={`Open linked product: ${product.name}`}
    >
      <Package className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="max-w-[200px] truncate">Product: {product.name}</span>
    </Link>
  )
}
