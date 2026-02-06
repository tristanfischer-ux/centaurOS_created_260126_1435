import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function NewTeamLoading() {
    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Back link */}
            <Skeleton className="h-4 w-28" />

            {/* Header */}
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-international-orange/30 rounded-full" />
                    <Skeleton className="h-8 w-36" />
                </div>
                <Skeleton className="h-4 w-72 ml-4" />
            </div>

            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Team Name Card */}
                    <Card className="border shadow-sm overflow-hidden">
                        <div className="h-1 bg-international-orange/20" />
                        <CardContent className="p-5 space-y-3">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-11 w-full rounded-md" />
                        </CardContent>
                    </Card>

                    {/* Member Selection Card */}
                    <Card className="border shadow-sm">
                        <CardContent className="p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <Skeleton className="h-5 w-32" />
                                    <Skeleton className="h-3 w-48" />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Skeleton className="h-9 flex-1 rounded-md" />
                                <Skeleton className="h-8 w-16 rounded-lg" />
                                <Skeleton className="h-8 w-24 rounded-lg" />
                                <Skeleton className="h-8 w-24 rounded-lg" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {Array.from({ length: 6 }, (_, i) => (
                                    <Skeleton key={i} className="h-16 rounded-xl" />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right - Preview */}
                <div className="lg:col-span-1">
                    <Card className="border shadow-sm overflow-hidden">
                        <div className="h-1 bg-electric-blue/20" />
                        <CardContent className="p-5 space-y-4">
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-16 w-full rounded-xl" />
                            <div className="py-6 flex flex-col items-center gap-2">
                                <Skeleton className="h-12 w-12 rounded-full" />
                                <Skeleton className="h-4 w-36" />
                                <Skeleton className="h-3 w-44" />
                            </div>
                            <div className="flex gap-3">
                                <Skeleton className="h-10 flex-1 rounded-md" />
                                <Skeleton className="h-10 flex-1 rounded-md" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
