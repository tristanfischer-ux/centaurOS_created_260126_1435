"use client"

/**
 * @file promote-to-product-button.tsx — Promote a CAD Lab project to a Product
 *
 * @description Small client component button that calls promoteFromCadLab
 * and navigates to the new product page. Rendered on project cards in the
 * recent projects grid when the project is eligible for promotion.
 *
 * @related
 * - src/actions/products.ts (promoteFromCadLab)
 * - src/app/(platform)/the-forge/components/recent-projects-grid.tsx
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Package, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { promoteFromCadLab } from "@/actions/products"

interface PromoteToProductButtonProps {
  projectId: string
}

export function PromoteToProductButton({ projectId }: PromoteToProductButtonProps) {
  const router = useRouter()
  const [isPromoting, setIsPromoting] = useState(false)

  const handlePromote = async (e: React.MouseEvent) => {
    // INTENT: Prevent the parent Link from navigating to the CAD Lab project
    e.preventDefault()
    e.stopPropagation()

    setIsPromoting(true)
    try {
      const result = await promoteFromCadLab(projectId)
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        toast.success(`Created product: ${result.data.name}`)
        router.push(`/products/${result.data.id}`)
      }
    } catch {
      toast.error('Failed to promote to product')
    } finally {
      setIsPromoting(false)
    }
  }

  return (
    <button
      onClick={handlePromote}
      disabled={isPromoting}
      className="inline-flex items-center gap-1 text-xs font-medium text-international-orange hover:text-international-orange/80 transition-colors disabled:opacity-50"
      title="Create a product from this project"
    >
      {isPromoting ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Package className="h-3 w-3" />
      )}
      {isPromoting ? 'Promoting...' : 'Promote to Product'}
    </button>
  )
}
