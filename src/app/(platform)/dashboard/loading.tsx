import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
    return (
        <div className="space-y-6">
            {/* Header Skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-64" />
                    <Skeleton className="h-5 w-96" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-9 w-32" />
                    <Skeleton className="h-9 w-40" />
                </div>
            </div>

            {/* Dashboard Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* My Tasks Section */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded" />
                                <Skeleton className="h-6 w-24" />
                            </div>
                            <Skeleton className="h-8 w-20" />
                        </div>
                        <CardDescription>
                            <Skeleton className="h-4 w-48 mt-2" />
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="p-3 rounded-lg bg-slate-50">
                                    <Skeleton className="h-5 w-3/4 mb-2" />
                                    <Skeleton className="h-4 w-1/2" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-32" />
                        <CardDescription>
                            <Skeleton className="h-4 w-40 mt-2" />
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-9 w-full" />
                        ))}
                    </CardContent>
                </Card>

                {/* Upcoming Deadlines */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded" />
                                <Skeleton className="h-6 w-40" />
                            </div>
                            <Skeleton className="h-8 w-20" />
                        </div>
                        <CardDescription>
                            <Skeleton className="h-4 w-48 mt-2" />
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="p-3 rounded-lg bg-slate-50">
                                    <Skeleton className="h-5 w-2/3 mb-2" />
                                    <Skeleton className="h-4 w-1/3" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Objectives Progress */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded" />
                                <Skeleton className="h-6 w-24" />
                            </div>
                            <Skeleton className="h-8 w-20" />
                        </div>
                        <CardDescription>
                            <Skeleton className="h-4 w-40 mt-2" />
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-5 w-12" />
                                    </div>
                                    <Skeleton className="h-2 w-full rounded-full" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded" />
                                <Skeleton className="h-6 w-32" />
                            </div>
                            <Skeleton className="h-8 w-20" />
                        </div>
                        <CardDescription>
                            <Skeleton className="h-4 w-48 mt-2" />
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                                    <Skeleton className="h-8 w-8 rounded-full" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-1/3" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
