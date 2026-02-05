import { Skeleton } from "@/components/ui/skeleton"

export default function ObjectivesLoading() {
    return (
        <div className="space-y-8">
            {/* Header Skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-8 bg-international-orange/30 rounded-full" />
                        <Skeleton className="h-8 w-56" />
                    </div>
                    <Skeleton className="h-5 w-72 ml-4" />
                </div>
                <Skeleton className="h-10 w-36 rounded-md" />
            </div>

            {/* Company Purpose Skeleton */}
            <div className="bg-muted/20 rounded-xl border border-muted p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Skeleton className="h-6 w-6 rounded" />
                    <Skeleton className="h-6 w-40" />
                </div>
                <Skeleton className="h-4 w-full max-w-2xl mb-2" />
                <Skeleton className="h-4 w-3/4" />
            </div>

            {/* Controls Skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Skeleton className="h-10 w-full sm:max-w-sm rounded-md" />
                <div className="flex gap-2">
                    <Skeleton className="h-9 w-9 rounded-md" />
                    <Skeleton className="h-9 w-24 rounded-md" />
                    <Skeleton className="h-9 w-28 rounded-md" />
                </div>
            </div>

            {/* Analytics Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-card rounded-xl border shadow-sm p-4">
                        <Skeleton className="h-4 w-20 mb-2" />
                        <Skeleton className="h-8 w-16" />
                    </div>
                ))}
            </div>

            {/* Select All Skeleton */}
            <div className="flex items-center px-4 py-3 bg-muted/30 rounded-xl border border-muted">
                <Skeleton className="h-4 w-4 rounded mr-4" />
                <Skeleton className="h-4 w-20" />
            </div>

            {/* Objectives List Skeleton */}
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-card rounded-xl border shadow-sm overflow-hidden">
                        <div className="flex items-center gap-4 p-5">
                            {/* Checkbox */}
                            <Skeleton className="h-4 w-4 rounded" />
                            {/* Expand icon */}
                            <Skeleton className="h-5 w-5" />
                            {/* Target icon box */}
                            <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
                                <Skeleton className="h-5 w-5" />
                            </div>
                            {/* Content */}
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-64" />
                                <Skeleton className="h-4 w-full max-w-md" />
                            </div>
                            {/* Stats */}
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-2 w-24 rounded-full" />
                                <Skeleton className="h-6 w-12 rounded-full" />
                                <Skeleton className="h-8 w-8 rounded" />
                                <Skeleton className="h-8 w-8 rounded" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
