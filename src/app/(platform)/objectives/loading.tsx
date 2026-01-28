import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function ObjectivesLoading() {
    return (
        <div className="space-y-6">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-56" />
                    <Skeleton className="h-5 w-72" />
                </div>
                <Skeleton className="h-10 w-36" />
            </div>

            {/* Objectives List Skeleton */}
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <Card key={i} className="overflow-hidden">
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-2">
                                        <Skeleton className="h-5 w-5 rounded" />
                                        <Skeleton className="h-6 w-64" />
                                    </div>
                                    <Skeleton className="h-4 w-full max-w-md" />
                                </div>
                                <Skeleton className="h-6 w-20" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {/* Progress bar */}
                            <div className="space-y-2 mb-4">
                                <div className="flex justify-between">
                                    <Skeleton className="h-4 w-16" />
                                    <Skeleton className="h-4 w-10" />
                                </div>
                                <Skeleton className="h-2 w-full rounded-full" />
                            </div>
                            
                            {/* Tasks skeleton */}
                            <div className="space-y-2">
                                {[1, 2].map((j) => (
                                    <div key={j} className="flex items-center gap-3 p-2 rounded border">
                                        <Skeleton className="h-4 w-4 rounded" />
                                        <Skeleton className="h-4 w-48" />
                                        <Skeleton className="h-6 w-6 rounded-full ml-auto" />
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
