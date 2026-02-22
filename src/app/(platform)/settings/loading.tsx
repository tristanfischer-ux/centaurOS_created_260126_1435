import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
    return (
        <div className="space-y-6">
            {/* Intro line */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-8 w-24" />
            </div>

            {/* Quick action cards */}
            <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                    <Card key={i}>
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-9 w-9 rounded-lg" />
                                <Skeleton className="h-5 w-36" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-4 w-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Data overview card */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-64 mt-2" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-10 w-40" />
                    <Skeleton className="h-px w-full" />
                    <Skeleton className="h-10 w-48" />
                </CardContent>
            </Card>

            {/* Privacy rights card */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-36" />
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-16 w-full rounded-lg" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
