import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function TeamLoading() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-8 bg-international-orange/30 rounded-full" />
                        <Skeleton className="h-8 w-32" />
                    </div>
                    <Skeleton className="h-4 w-64 ml-4" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-9 rounded-md" />
                    <Skeleton className="h-9 w-32 rounded-md" />
                    <Skeleton className="h-9 w-28 rounded-md" />
                    <Skeleton className="h-9 w-28 rounded-md" />
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="border shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-xl" />
                            <div className="space-y-2">
                                <Skeleton className="h-7 w-10" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Insights Bar */}
            <div className="flex gap-3 overflow-hidden">
                {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-48 rounded-xl shrink-0" />
                ))}
            </div>

            {/* Tab Bar */}
            <div className="flex items-center justify-between border-b border-muted pb-3">
                <div className="flex gap-1 bg-muted/50 p-1 rounded-xl">
                    <Skeleton className="h-8 w-24 rounded-lg" />
                    <Skeleton className="h-8 w-24 rounded-lg" />
                    <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-48 rounded-md" />
                    <div className="flex gap-0.5 bg-muted/50 p-1 rounded-xl">
                        <Skeleton className="h-7 w-7 rounded-md" />
                        <Skeleton className="h-7 w-7 rounded-md" />
                    </div>
                </div>
            </div>

            {/* Analytics Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="border shadow-sm">
                        <CardHeader className="p-3 pb-1">
                            <Skeleton className="h-4 w-24" />
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                            <Skeleton className="h-[100px] w-full rounded" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Member Sections */}
            {[
                { role: "Founders", color: "bg-international-orange/30", count: 1 },
                { role: "Executives", color: "bg-orange-400/30", count: 3 },
                { role: "Apprentices", color: "bg-slate-400/30", count: 4 }
            ].map(({ role, color, count }) => (
                <div key={role} className="space-y-4">
                    <div className="flex items-center gap-3 border-b border-muted pb-3">
                        <div className={`w-1 h-6 ${color} rounded-full`} />
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-5 w-8 rounded-full" />
                        <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {Array.from({ length: count }, (_, i) => i + 1).map((i) => (
                            <Card key={i} className="border shadow-sm">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="h-10 w-10 rounded-full" />
                                        <div className="space-y-2 flex-1">
                                            <Skeleton className="h-4 w-28" />
                                            <Skeleton className="h-3 w-16" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <Skeleton className="h-5 w-14 rounded-full" />
                                        <Skeleton className="h-5 w-14 rounded-full" />
                                        <Skeleton className="h-5 w-12 rounded-full" />
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
