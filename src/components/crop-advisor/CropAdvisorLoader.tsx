"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const CropAdvisorDashboard = dynamic(
  () =>
    import("@/components/crop-advisor/CropAdvisorDashboard").then((m) => ({
      default: m.CropAdvisorDashboard,
    })),
  {
    ssr: false,
    loading: () => <Skeleton className="w-full h-[600px] rounded-lg" />,
  }
)

const BuyerIntentManager = dynamic(
  () =>
    import("@/components/crop-advisor/BuyerIntentManager").then((m) => ({
      default: m.BuyerIntentManager,
    })),
  {
    ssr: false,
    loading: () => <Skeleton className="w-full h-[400px] rounded-lg" />,
  }
)

interface CropAdvisorLoaderProps {
  accountType: string | null
  initialTab?: string
}

/**
 * Loader component that renders the correct view based on account type.
 * Suppliers (growers) see the scoring dashboard + buyer signals feed.
 * Team builders (buyers) see the intent management view.
 */
export function CropAdvisorLoader({ accountType, initialTab }: CropAdvisorLoaderProps) {
  if (accountType === "team_builder") {
    return <BuyerIntentManager />
  }

  return <CropAdvisorDashboard initialTab={initialTab} />
}
