import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function TeamLoading() {
    return (
        <div className="space-y-8">
            {/* Header with action buttons skeleton */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-48" />
                    <Skeleton className="h-5 w-64" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-10 w-36" />
                </div>
            </div>

            {/* Teams Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-6 w-20" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <Card key={i}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <Skeleton className="h-5 w-32" />
                                    <Skeleton className="h-6 w-16" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-4 w-full mb-3" />
                                <div className="flex -space-x-2">
                                    {[1, 2, 3].map((j) => (
                                        <Skeleton key={j} className="h-8 w-8 rounded-full border-2 border-background" />
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Role Sections */}
            {["Founders", "Executives", "Apprentices", "AI Agents"].map((role, idx) => (
                <div key={role} className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-5 rounded" />
                        <Skeleton className="h-6 w-28" />
                        <Skeleton className="h-5 w-8 rounded-full" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {[1, 2, idx === 2 ? 3 : 2].slice(0, idx === 0 ? 1 : idx === 3 ? 2 : 3).map((i) => (
                            <Card key={i}>
                                <CardContent className="pt-6">
                                    <div className="flex items-center gap-4 mb-4">
                                        <Skeleton className="h-12 w-12 rounded-full" />
                                        <div className="space-y-2">
                                            <Skeleton className="h-5 w-32" />
                                            <Skeleton className="h-4 w-24" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[1, 2, 3, 4].map((j) => (
                                            <div key={j} className="text-center p-2 rounded bg-muted/50">
                                                <Skeleton className="h-6 w-8 mx-auto mb-1" />
                                                <Skeleton className="h-3 w-12 mx-auto" />
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
