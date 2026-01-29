"use client"

import { useState, useCallback, useTransition } from "react"
import { OrderSummary, OrderStatus, OrderRole } from "@/types/orders"
import { getMyOrders, searchOrders } from "@/actions/orders"
import { OrderCard, OrderCardSkeleton } from "@/components/orders"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Filter,
  RefreshCw,
  Package,
  ShoppingBag,
  Store,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

interface OrdersViewProps {
  initialOrders: OrderSummary[]
  initialCount: number
  error: string | null
}

const statusOptions: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "disputed", label: "Disputed" },
  { value: "cancelled", label: "Cancelled" },
]

const ITEMS_PER_PAGE = 12

export function OrdersView({
  initialOrders,
  initialCount,
  error: initialError,
}: OrdersViewProps) {
  const [orders, setOrders] = useState<OrderSummary[]>(initialOrders)
  const [totalCount, setTotalCount] = useState(initialCount)
  const [role, setRole] = useState<OrderRole | "all">("all")
  const [status, setStatus] = useState<OrderStatus | "all">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(initialError)
  const [isPending, startTransition] = useTransition()

  const fetchOrders = useCallback(async () => {
    startTransition(async () => {
      try {
        let result

        if (searchQuery.trim()) {
          result = await searchOrders(
            searchQuery,
            role === "all" ? undefined : role,
            ITEMS_PER_PAGE
          )
        } else {
          result = await getMyOrders(
            role === "all" ? undefined : role,
            status === "all" ? undefined : status,
            ITEMS_PER_PAGE,
            page * ITEMS_PER_PAGE
          )
        }

        setOrders(result.data)
        setTotalCount(result.count)
        setError(result.error)
      } catch {
        setError("Failed to fetch orders")
      }
    })
  }, [role, status, searchQuery, page])

  const handleRoleChange = (newRole: OrderRole | "all") => {
    setRole(newRole)
    setPage(0)
    startTransition(async () => {
      const result = await getMyOrders(
        newRole === "all" ? undefined : newRole,
        status === "all" ? undefined : status,
        ITEMS_PER_PAGE,
        0
      )
      setOrders(result.data)
      setTotalCount(result.count)
      setError(result.error)
    })
  }

  const handleStatusChange = (newStatus: OrderStatus | "all") => {
    setStatus(newStatus)
    setPage(0)
    startTransition(async () => {
      const result = await getMyOrders(
        role === "all" ? undefined : role,
        newStatus === "all" ? undefined : newStatus,
        ITEMS_PER_PAGE,
        0
      )
      setOrders(result.data)
      setTotalCount(result.count)
      setError(result.error)
    })
  }

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    setPage(0)

    if (!query.trim()) {
      // Reset to regular listing
      startTransition(async () => {
        const result = await getMyOrders(
          role === "all" ? undefined : role,
          status === "all" ? undefined : status,
          ITEMS_PER_PAGE,
          0
        )
        setOrders(result.data)
        setTotalCount(result.count)
        setError(result.error)
      })
      return
    }

    startTransition(async () => {
      const result = await searchOrders(
        query,
        role === "all" ? undefined : role,
        ITEMS_PER_PAGE
      )
      setOrders(result.data)
      setTotalCount(result.count)
      setError(result.error)
    })
  }, [role, status])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    startTransition(async () => {
      const result = await getMyOrders(
        role === "all" ? undefined : role,
        status === "all" ? undefined : status,
        ITEMS_PER_PAGE,
        newPage * ITEMS_PER_PAGE
      )
      setOrders(result.data)
      setTotalCount(result.count)
      setError(result.error)
    })
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  // Determine user role for each order
  // Since we're fetching user's orders, we need to determine their role per order
  // For simplicity, we'll use "buyer" as default but ideally the API would return this
  const getUserRoleForOrder = (): OrderRole => {
    // This is a simplified version - in production, the API should return the user's role
    // For now, we'll infer based on filter or default to buyer
    if (role === "buyer" || role === "seller") return role
    return "buyer" // Default
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Orders</h1>
          </div>
          <p className="text-slate-500 mt-1 text-sm font-medium pl-4">
            Manage your marketplace orders
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchOrders}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Role Tabs */}
        <Tabs
          value={role}
          onValueChange={(v) => handleRoleChange(v as OrderRole | "all")}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid grid-cols-3 w-full sm:w-auto">
            <TabsTrigger value="all" className="gap-1.5">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">All</span>
            </TabsTrigger>
            <TabsTrigger value="buyer" className="gap-1.5">
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">Buying</span>
            </TabsTrigger>
            <TabsTrigger value="seller" className="gap-1.5">
              <Store className="h-4 w-4" />
              <span className="hidden sm:inline">Selling</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Status Filter */}
        <Select
          value={status}
          onValueChange={(v) => handleStatusChange(v as OrderStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by order number..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalCount === 0
            ? "No orders found"
            : `Showing ${page * ITEMS_PER_PAGE + 1}-${Math.min(
                (page + 1) * ITEMS_PER_PAGE,
                totalCount
              )} of ${totalCount} orders`}
        </p>
        {searchQuery && (
          <Badge variant="secondary" className="gap-1">
            Search: {searchQuery}
            <button
              onClick={() => handleSearch("")}
              className="ml-1 hover:text-foreground"
            >
              ×
            </button>
          </Badge>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchOrders}
            className="mt-2"
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Orders Grid */}
      {isPending ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState role={role} searchQuery={searchQuery} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              userRole={getUserRoleForOrder()}
              onActionComplete={fetchOrders}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 0 || isPending}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
              const pageNum =
                totalPages <= 5
                  ? i
                  : page < 3
                  ? i
                  : page > totalPages - 3
                  ? totalPages - 5 + i
                  : page - 2 + i

              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "secondary"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                  disabled={isPending}
                  className="w-8"
                >
                  {pageNum + 1}
                </Button>
              )
            })}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages - 1 || isPending}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  role,
  searchQuery,
}: {
  role: OrderRole | "all"
  searchQuery: string
}) {
  if (searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Search className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No orders found</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          No orders match your search &quot;{searchQuery}&quot;. Try a different order
          number.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Package className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold">No orders yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1">
        {role === "buyer"
          ? "You haven't placed any orders yet. Browse the marketplace to find services."
          : role === "seller"
          ? "You haven't received any orders yet. Make sure your profile is complete."
          : "You don't have any orders yet."}
      </p>
    </div>
  )
}
