/**
 * @file linked-work-card.tsx — Reverse link from product to its objectives + tasks.
 *
 * @description Renders a compact card on the Product Overview tab listing the
 * objectives and tasks tagged to this product. Counts + top-5 quick links. If
 * nothing is linked yet, shows an inviting empty state — a founder coming to a
 * product page for the first time should see where to start hooking work up.
 *
 * @related
 * - src/actions/products.ts getLinkedItemsForProduct
 * - Migration: 20260418020000_objectives_tasks_product_link.sql
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { typography } from "@/lib/design-system"
import { Target, CheckSquare, ArrowUpRight } from "lucide-react"
import { getLinkedItemsForProduct } from "@/actions/products"

interface LinkedItem {
  id: string
  title: string
  status: string | null
  due_date?: string | null
}

interface LinkedData {
  objectives: LinkedItem[]
  tasks: LinkedItem[]
  objectiveCount: number
  taskCount: number
}

export function LinkedWorkCard({ productId }: { productId: string }) {
  const [data, setData] = React.useState<LinkedData | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    getLinkedItemsForProduct(productId)
      .then((res) => {
        if (cancelled) return
        if ("data" in res && res.data) setData(res.data)
      })
      .catch(() => { /* best-effort — card falls back to empty */ })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [productId])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <h3 className={typography.h3}>Linked work</h3>
        </CardHeader>
        <CardContent>
          <div className="h-12 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    )
  }

  const hasAny = (data?.objectiveCount ?? 0) > 0 || (data?.taskCount ?? 0) > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h3 className={typography.h3}>Linked work</h3>
          {hasAny && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {data?.objectiveCount ?? 0} objective{data?.objectiveCount === 1 ? "" : "s"}
              {" · "}
              {data?.taskCount ?? 0} task{data?.taskCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <p className="text-sm text-muted-foreground">
            No objectives or tasks tagged to this product yet. Add a product to an objective or task and it will show up here — a quick way to answer &quot;what&apos;s blocking this product?&quot; at a glance.
          </p>
        ) : (
          <div className="space-y-4">
            {data && data.objectives.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Target className="h-3 w-3" aria-hidden="true" />
                  Objectives
                </p>
                <ul className="space-y-1.5">
                  {data.objectives.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/objectives/${o.id}`}
                        className="group flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 hover:border-international-orange/40 transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground truncate">{o.title}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {o.status && (
                            <Badge variant="secondary" size="sm" className="capitalize">
                              {o.status}
                            </Badge>
                          )}
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange transition-colors" aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data && data.tasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CheckSquare className="h-3 w-3" aria-hidden="true" />
                  Tasks
                </p>
                <ul className="space-y-1.5">
                  {data.tasks.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/tasks?selected=${t.id}`}
                        className="group flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 hover:border-international-orange/40 transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground truncate">{t.title}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {t.status && (
                            <Badge variant="secondary" size="sm" className="capitalize">
                              {t.status}
                            </Badge>
                          )}
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange transition-colors" aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
