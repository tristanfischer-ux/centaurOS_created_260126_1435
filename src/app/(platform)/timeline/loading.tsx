import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function TimelineLoading() {
    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header Skeleton */}
            <div className="flex-none flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-52" />
                    <Skeleton className="h-5 w-72" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>

            {/* Desktop: Gantt Chart Skeleton */}
            <div className="flex-1 min-h-[500px] hidden md:block">
                <Card className="h-full">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                                <Skeleton className="h-9 w-40" />
                                <Skeleton className="h-9 w-40" />
                                <Skeleton className="h-9 w-32" />
                            </div>
                            <div className="flex gap-2">
                                <Skeleton className="h-9 w-9" />
                                <Skeleton className="h-9 w-9" />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="h-[calc(100%-80px)]">
                        {/* Timeline header */}
                        <div className="flex border-b mb-4 pb-2">
                            <Skeleton className="h-4 w-48 mr-4" />
                            <div className="flex-1 flex gap-4">
                                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                                    <Skeleton key={i} className="h-4 w-16" />
                                ))}
                            </div>
                        </div>
                        
                        {/* Gantt rows */}
                        <div className="space-y-3">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-48 flex items-center gap-2">
                                        <Skeleton className="h-6 w-6 rounded-full" />
                                        <Skeleton className="h-4 w-32" />
                                    </div>
                                    <div className="flex-1 relative h-8">
                                        <Skeleton 
                                            className="h-6 rounded absolute top-1" 
                                            style={{ 
                                                left: `${(i * 10) % 40}%`, 
                                                width: `${30 + (i * 5) % 30}%` 
                                            }} 
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Mobile: List Timeline Skeleton */}
            <div className="md:hidden space-y-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                        <CardContent className="pt-4">
                            <div className="flex items-start gap-3">
                                <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-5 w-48" />
                                    <Skeleton className="h-4 w-32" />
                                    <div className="flex gap-2 mt-2">
                                        <Skeleton className="h-6 w-20 rounded" />
                                        <Skeleton className="h-6 w-24 rounded" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
