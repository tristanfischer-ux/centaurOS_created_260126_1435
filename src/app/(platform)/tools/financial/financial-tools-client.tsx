'use client'

/**
 * FinancialToolsClient -- Tabbed page combining Money Map and Cost of Delay.
 *
 * @description Provides a single Financial Tools destination with two tabs.
 * Tab selection is persisted to URL search params so direct links and
 * browser back/forward work correctly.
 *
 * @component
 */

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { Banknote, Calculator } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { typography } from '@/lib/design-system'

// Tab content components
import { CostOfDelayView } from '@/components/tools/cost-of-delay/cost-of-delay-view'
import { MoneyMapClient } from '@/app/(platform)/money-map/money-map-client'

const TABS = [
  { id: 'money-map', label: 'Money Map', icon: Banknote },
  { id: 'cost-of-delay', label: 'Cost of Delay', icon: Calculator },
] as const

type TabId = (typeof TABS)[number]['id']

const DEFAULT_TAB: TabId = 'money-map'

function TabSkeleton(): React.ReactElement {
  return (
    <div className="space-y-6 pt-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-[400px]" />
    </div>
  )
}

export function FinancialToolsClient(): React.ReactElement {
  const searchParams = useSearchParams()
  const router = useRouter()

  const currentTab = (searchParams.get('tab') as TabId) || DEFAULT_TAB

  const handleTabChange = (value: string): void => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Financial Tools</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Understand your money flows and make smarter financial decisions
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="money-map" className="mt-6">
          <Suspense fallback={<TabSkeleton />}>
            <MoneyMapClient hideHeader />
          </Suspense>
        </TabsContent>

        <TabsContent value="cost-of-delay" className="mt-6">
          <Suspense fallback={<TabSkeleton />}>
            <CostOfDelayView />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}
