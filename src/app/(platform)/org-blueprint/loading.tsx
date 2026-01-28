import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function OrgBlueprintLoading() {
    return (
        <div className="space-y-6">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-56" />
                    <Skeleton className="h-5 w-80" />
                </div>
                <Skeleton className="h-10 w-40" />
            </div>

            {/* Summary & Radar Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Status Summary Cards */}
                <div className="space-y-4">
                    <Skeleton className="h-4 w-32" />
                    <div className="grid grid-cols-2 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="p-4 rounded-lg bg-muted/50">
                                <Skeleton className="h-5 w-5 mb-2" />
                                <Skeleton className="h-8 w-12 mb-1" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Radar Chart Skeleton */}
                <div className="lg:col-span-2 flex items-center justify-center p-8 bg-muted/30 rounded-lg">
                    <div className="relative">
                        <Skeleton className="h-[280px] w-[280px] rounded-full" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                                <Skeleton className="h-8 w-16 mx-auto mb-1" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Bar Skeleton */}
            <div className="flex gap-3">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-10 w-36" />
            </div>

            {/* Function Cards Grid */}
            <div className="space-y-8">
                {[1, 2].map((group) => (
                    <div key={group} className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-3 w-3 rounded-full" />
                            <Skeleton className="h-6 w-32" />
                            <Skeleton className="h-5 w-20" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map((card) => (
                                <Card key={card}>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-2 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <Skeleton className="h-2 w-2 rounded-full" />
                                                    <Skeleton className="h-3 w-20" />
                                                </div>
                                                <Skeleton className="h-5 w-40" />
                                            </div>
                                            <Skeleton className="h-6 w-16" />
                                        </div>
                                        <Skeleton className="h-4 w-full mt-2" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex gap-2">
                                            <Skeleton className="h-8 w-28" />
                                            <Skeleton className="h-8 w-16" />
                                            <Skeleton className="h-8 w-24" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
