import { Suspense } from 'react'
import { Metadata } from 'next'
import Link from 'next/link'
import {
  Briefcase,
  Clock,
  Plus,
  Filter,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RetainerCard } from '@/components/retainers'
import { getMyRetainers, getRetainerStatistics } from '@/actions/retainers'
import { RetainerStatus } from '@/types/retainers'

export const metadata: Metadata = {
  title: 'Retainers | CentaurOS',
  description: 'Manage your retainer agreements',
}

// ==========================================
// LOADING SKELETON
// ==========================================

function RetainersSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ==========================================
// RETAINER LIST COMPONENT
// ==========================================

interface RetainersListProps {
  role: 'buyer' | 'seller'
  status?: RetainerStatus | RetainerStatus[]
}

async function RetainersList({ role, status }: RetainersListProps) {
  const { data: retainers, error } = await getMyRetainers(role, status)

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (retainers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No retainers found</p>
            <p className="text-sm mt-1">
              {role === 'buyer'
                ? "You haven't set up any retainer agreements yet"
                : "You don't have any retainer clients yet"}
            </p>
            {role === 'buyer' && (
              <Button className="mt-4" asChild>
                <Link href="/marketplace?category=People">
                  <Plus className="h-4 w-4 mr-2" />
                  Browse People
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Fetch stats for each retainer (in parallel)
  const retainersWithStats = await Promise.all(
    retainers.map(async (retainer) => {
      const { data: stats } = await getRetainerStatistics(retainer.id)
      return { retainer, stats }
    })
  )

  return (
    <div className="space-y-4">
      {retainersWithStats.map(({ retainer, stats }) => (
        <RetainerCard
          key={retainer.id}
          retainer={retainer}
          stats={stats}
          role={role}
        />
      ))}
    </div>
  )
}

// ==========================================
// PAGE COMPONENT
// ==========================================

export default async function RetainersPage() {
  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Retainers</h1>
          <p className="text-muted-foreground mt-1">
            Manage your ongoing retainer agreements
          </p>
        </div>
        <Button asChild>
          <Link href="/marketplace?category=People">
            <Plus className="h-4 w-4 mr-2" />
            New Retainer
          </Link>
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Briefcase className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Retainers</p>
                <Suspense fallback={<Skeleton className="h-6 w-8" />}>
                  <RetainerCount status="active" />
                </Suspense>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
                <Suspense fallback={<Skeleton className="h-6 w-8" />}>
                  <RetainerCount status="pending" />
                </Suspense>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Filter className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">All Retainers</p>
                <Suspense fallback={<Skeleton className="h-6 w-8" />}>
                  <RetainerCount />
                </Suspense>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Buying/Selling */}
      <Tabs defaultValue="buying" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="buying">As Buyer</TabsTrigger>
          <TabsTrigger value="selling">As Provider</TabsTrigger>
        </TabsList>

        <TabsContent value="buying">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Retainers I&apos;m Buying</CardTitle>
              <CardDescription>
                Providers you have ongoing retainer agreements with
              </CardDescription>
            </CardHeader>
          </Card>
          <Suspense fallback={<RetainersSkeleton />}>
            <RetainersList role="buyer" />
          </Suspense>
        </TabsContent>

        <TabsContent value="selling">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Retainers I&apos;m Providing</CardTitle>
              <CardDescription>
                Clients you have ongoing retainer agreements with
              </CardDescription>
            </CardHeader>
          </Card>
          <Suspense fallback={<RetainersSkeleton />}>
            <RetainersList role="seller" />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ==========================================
// HELPER COMPONENTS
// ==========================================

async function RetainerCount({ status }: { status?: RetainerStatus }) {
  const { count } = await getMyRetainers(undefined, status)
  return <p className="text-2xl font-bold">{count}</p>
}
