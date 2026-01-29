import { Skeleton } from '@/components/ui/skeleton'

export default function MyOrdersLoading() {
    return (
        <div className="container max-w-5xl mx-auto py-8 px-4">
            <div className="mb-8">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-5 w-64 mt-2" />
            </div>

            {/* Search and Filters */}
            <div className="flex gap-4 mb-6">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-[180px]" />
            </div>

            {/* Tabs */}
            <Skeleton className="h-10 w-full mb-6" />

            {/* Order Cards */}
            <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="border rounded-lg p-6">
                        <div className="flex gap-4">
                            <Skeleton className="h-14 w-14 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-48" />
                                <Skeleton className="h-4 w-32" />
                                <div className="flex gap-4 mt-2">
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-4 w-28" />
                                </div>
                            </div>
                            <Skeleton className="h-6 w-24" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
