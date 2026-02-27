"use client"

/**
 * @file assemble/page.tsx — The Forge: Assemble stage (Stage 4).
 *
 * @description Tracks manufacturing orders, parts receiving, assembly progress,
 * and shipping. Provides visibility into the convergence of parts from multiple
 * suppliers into a final assembled product.
 *
 * 3 tabs: Orders, Assembly, Shipping.
 *
 * Gate: redirects to Source if no manufacturing orders exist.
 */

import { useState, useCallback, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Package,
  ArrowLeft,
  Truck,
  ClipboardCheck,
  Clock,
  CheckCircle2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { useCadLab } from "../cad-lab-context"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import { getAssemblyDashboard } from "@/actions/assembly"
import type { OrderLineSummary } from "@/actions/assembly"

// ─── Status helpers ──────────────────────────────────────────────────

const ORDER_STATUS_CONFIG: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "destructive" | "info" }> = {
  draft: { label: "Draft", variant: "secondary" },
  quoting: { label: "Quoting", variant: "info" },
  confirmed: { label: "Confirmed", variant: "info" },
  in_production: { label: "In Production", variant: "warning" },
  assembling: { label: "Assembling", variant: "warning" },
  shipping: { label: "Shipping", variant: "info" },
  delivered: { label: "Delivered", variant: "success" },
}

function OrderStatusBadge({ status }: { status: string }) {
  const config = ORDER_STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

// ─── Page Component ──────────────────────────────────────────────────

export default function AssemblePage(): React.ReactNode {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    subject,
    activeProjectId,
  } = useCadLab()

  // ── Assembly dashboard data ──
  const [orderLines, setOrderLines] = useState<OrderLineSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!activeProjectId) return
    setIsLoading(true)
    getAssemblyDashboard(activeProjectId)
      .then((result) => {
        if ("orderLines" in result) {
          setOrderLines(result.orderLines)
        }
      })
      .finally(() => setIsLoading(false))
  }, [activeProjectId])

  const hasOrders = orderLines.length > 0

  // ── Tab navigation ──
  const TABS = useMemo(
    () => [
      { id: "orders", label: "Orders" },
      { id: "assembly", label: "Assembly" },
      { id: "shipping", label: "Shipping" },
    ],
    [],
  )

  const [activeTab, setActiveTab] = useState(() => {
    const param = searchParams.get("tab")
    if (param && TABS.some((t) => t.id === param)) return param
    return "orders"
  })

  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId)
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", tabId)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // ── Screen context ──
  useRegisterScreenContext(
    useMemo(() => ({
      pageTitle: `The Forge — Assemble: ${subject}`,
      summary: `${orderLines.length} manufacturing orders. Tracking assembly progress.`,
    }), [subject, orderLines.length]),
  )

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-international-orange" />
            Assemble
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track orders, receive parts, and manage assembly.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabSource)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Source
        </Button>
      </div>

      {/* ── Tab navigation ── */}
      <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border overflow-x-auto">
        <div className="flex items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "bg-international-orange text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        {/* ═══ Orders tab ═══ */}
        {activeTab === "orders" && (
          <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
            {isLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 animate-pulse" />
                    Loading orders...
                  </div>
                </CardContent>
              </Card>
            ) : !hasOrders ? (
              <Card>
                <CardContent className="pt-6">
                  <EmptyState
                    icon={<Package className="h-8 w-8" />}
                    title="No manufacturing orders yet"
                    description="Award a supplier in the Source stage to create your first manufacturing order."
                    action={
                      <Button variant="secondary" onClick={() => router.push(FORGE_ROUTES.cadLabSource)}>
                        Go to Source
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              orderLines.map((line) => (
                <Card key={line.orderId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{line.orderNumber}</span>
                        {line.orderTitle ?? "Manufacturing Order"}
                      </CardTitle>
                      <OrderStatusBadge status={line.orderStatus} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {line.totalCostGbp && (
                      <p className="text-xs text-muted-foreground">
                        Estimated cost: <span className="font-mono text-foreground">£{line.totalCostGbp.toLocaleString()}</span>
                      </p>
                    )}
                    {line.requiredBy && (
                      <p className="text-xs text-muted-foreground">
                        Required by: <span className="text-foreground">{new Date(line.requiredBy).toLocaleDateString()}</span>
                      </p>
                    )}
                    {line.assemblyJobs.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assembly Jobs</p>
                        {line.assemblyJobs.map((job) => (
                          <div key={job.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/50">
                            <span className="text-foreground">{job.id.slice(0, 8)}...</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{job.status}</Badge>
                              <Badge variant={job.qcStatus === "passed" ? "success" : job.qcStatus === "failed" ? "destructive" : "secondary"}>
                                QC: {job.qcStatus}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </motion.div>
        )}

        {/* ═══ Assembly tab ═══ */}
        {activeTab === "assembly" && (
          <motion.div key="assembly" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
            {!hasOrders ? (
              <Card>
                <CardContent className="pt-6">
                  <EmptyState
                    icon={<ClipboardCheck className="h-8 w-8" />}
                    title="No assembly jobs"
                    description="Assembly jobs will appear here once manufacturing orders are created and parts start arriving."
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Assembly convergence overview */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Parts Convergence</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Total Orders", value: orderLines.length, icon: Package },
                        { label: "Assembly Jobs", value: orderLines.reduce((sum, l) => sum + l.assemblyJobs.length, 0), icon: ClipboardCheck },
                        { label: "In Progress", value: orderLines.filter((l) => l.orderStatus === "in_production" || l.orderStatus === "assembling").length, icon: Clock },
                        { label: "Delivered", value: orderLines.filter((l) => l.orderStatus === "delivered").length, icon: CheckCircle2 },
                      ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="text-center p-3 rounded-lg bg-muted/50">
                          <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                          <p className="text-lg font-semibold text-foreground">{value}</p>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Per-order assembly jobs */}
                {orderLines
                  .filter((l) => l.assemblyJobs.length > 0)
                  .map((line) => (
                    <Card key={line.orderId}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">
                          {line.orderTitle ?? line.orderNumber} — Assembly
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {line.assemblyJobs.map((job) => (
                          <div key={job.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium text-foreground">
                                Job {job.id.slice(0, 8)}
                              </p>
                              {job.notes && (
                                <p className="text-xs text-muted-foreground">{job.notes}</p>
                              )}
                              {job.startedAt && (
                                <p className="text-xs text-muted-foreground">
                                  Started: {new Date(job.startedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={
                                job.status === "completed" ? "success" :
                                job.status === "in_progress" ? "warning" :
                                "secondary"
                              }>
                                {job.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
              </>
            )}
          </motion.div>
        )}

        {/* ═══ Shipping tab ═══ */}
        {activeTab === "shipping" && (
          <motion.div key="shipping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
            {!hasOrders ? (
              <Card>
                <CardContent className="pt-6">
                  <EmptyState
                    icon={<Truck className="h-8 w-8" />}
                    title="No shipments"
                    description="Shipping information will appear here once parts and assemblies are dispatched."
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Shipment timeline */}
                {orderLines
                  .filter((l) => l.assemblyJobs.some((j) => j.shippedAt || j.trackingReference))
                  .map((line) => (
                    <Card key={line.orderId}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          {line.orderTitle ?? line.orderNumber}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {line.assemblyJobs
                          .filter((j) => j.shippedAt || j.trackingReference)
                          .map((job) => (
                            <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                              <div>
                                {job.trackingReference && (
                                  <p className="text-sm font-mono text-foreground">{job.trackingReference}</p>
                                )}
                                {job.shippedAt && (
                                  <p className="text-xs text-muted-foreground">
                                    Shipped: {new Date(job.shippedAt).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                              <Badge variant={job.completedAt ? "success" : "info"}>
                                {job.completedAt ? "Delivered" : "In Transit"}
                              </Badge>
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                  ))}

                {/* Orders awaiting shipment */}
                {orderLines.filter((l) => !l.assemblyJobs.some((j) => j.shippedAt)).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-muted-foreground">Awaiting Shipment</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        {orderLines
                          .filter((l) => !l.assemblyJobs.some((j) => j.shippedAt))
                          .map((line) => (
                            <div key={line.orderId} className="flex items-center justify-between text-sm py-1.5">
                              <span className="text-foreground">{line.orderTitle ?? line.orderNumber}</span>
                              <OrderStatusBadge status={line.orderStatus} />
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
