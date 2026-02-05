import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function TeamLoading() {
    return (
        <div className="space-y-8">
            {/* Header with action buttons skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-8 bg-international-orange/30 rounded-full" />
                        <Skeleton className="h-8 w-48" />
                    </div>
                    <Skeleton className="h-5 w-64 ml-3" />
                </div>
                <div className="flex items-center gap-3">
                    {/* View mode toggle skeleton */}
                    <div className="flex bg-muted p-1 rounded-lg">
                        <Skeleton className="h-8 w-8 rounded-md" />
                        <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                    <Skeleton className="h-10 w-32 rounded-md" />
                    <Skeleton className="h-10 w-36 rounded-md" />
                </div>
            </div>

            {/* Teams Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-muted pb-3">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-4 w-24" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="border shadow-sm">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <Skeleton className="h-5 w-32" />
                                    <Skeleton className="h-6 w-16 rounded-full" />
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

            {/* Role Sections with matching header style */}
            {[
                { role: "Founders", color: "bg-international-orange/30", count: 1 },
                { role: "Executives", color: "bg-orange-400/30", count: 3 },
                { role: "Apprentices", color: "bg-slate-400/30", count: 3 },
                { role: "AI Agents", color: "bg-violet-500/30", count: 2 }
            ].map(({ role, color, count }) => (
                <div key={role} className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-muted pb-3">
                        <div className={`w-1 h-6 ${color} rounded-full`} />
                        <Skeleton className="h-6 w-28" />
                        <Skeleton className="h-4 w-24 ml-2" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {Array.from({ length: count }, (_, i) => i + 1).map((i) => (
                            <Card key={i} className="border shadow-sm">
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-1 h-12 ${color} rounded-full`} />
                                        <Skeleton className="h-10 w-10 rounded-full" />
                                        <div className="space-y-2 flex-1">
                                            <Skeleton className="h-4 w-32" />
                                            <Skeleton className="h-3 w-20" />
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <div className="space-y-2">
                                        <Skeleton className="h-3 w-24" />
                                        <div className="flex gap-2">
                                            <Skeleton className="h-5 w-16 rounded-full" />
                                            <Skeleton className="h-5 w-12 rounded-full" />
                                        </div>
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
