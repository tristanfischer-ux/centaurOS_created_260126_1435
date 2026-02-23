import { Skeleton } from "@/components/ui/skeleton"

export default function CampaignDetailLoading() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-4 w-24" />
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <div className="flex gap-3">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-4 w-20 self-center" />
                    <Skeleton className="h-4 w-20 self-center" />
                </div>
            </div>
            <Skeleton className="h-12 w-72" />
            <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
            </div>
        </div>
    )
}
