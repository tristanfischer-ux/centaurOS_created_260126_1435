import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function GuildLoading() {
    return (
        <div className="space-y-6">
            {/* Header Skeleton */}
            <div className="flex justify-between items-end">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-32" />
                    <Skeleton className="h-5 w-64" />
                </div>
                <Skeleton className="h-7 w-44 rounded-full" />
            </div>

            {/* Events List Skeleton */}
            <div className="grid gap-6">
                {[1, 2, 3].map((i) => (
                    <Card key={i} className="flex flex-col md:flex-row overflow-hidden">
                        {/* Date Section */}
                        <div className="bg-slate-50 p-6 flex flex-col items-center justify-center min-w-[150px] border-r border-slate-200">
                            <Skeleton className="h-8 w-8 mb-1" />
                            <Skeleton className="h-4 w-10" />
                        </div>
                        
                        {/* Content Section */}
                        <div className="flex-1 p-6">
                            <div className="flex justify-between items-start mb-2">
                                <Skeleton className="h-6 w-32 rounded" />
                                {i === 1 && <Skeleton className="h-6 w-28 rounded ml-2" />}
                            </div>
                            <Skeleton className="h-6 w-64 mb-2" />
                            <Skeleton className="h-4 w-full mb-1" />
                            <Skeleton className="h-4 w-3/4 mb-4" />
                            <Skeleton className="h-9 w-20" />
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    )
}
