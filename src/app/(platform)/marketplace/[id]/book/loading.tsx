import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function BookingLoading() {
    return (
        <div className="max-w-3xl mx-auto py-6 px-4">
            {/* Progress Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    {[1, 2, 3, 4].map((step) => (
                        <div key={step} className="flex items-center gap-2">
                            <Skeleton className="w-8 h-8 rounded-full" />
                            <Skeleton className="h-4 w-20 hidden sm:block" />
                            {step < 4 && <Skeleton className="hidden sm:block w-8 h-px" />}
                        </div>
                    ))}
                </div>
                <Skeleton className="h-2 w-full" />
            </div>

            {/* Provider Info Card */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-16 w-16 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-48" />
                            <div className="flex gap-2">
                                <Skeleton className="h-5 w-16" />
                                <Skeleton className="h-5 w-20" />
                            </div>
                        </div>
                        <div className="text-right space-y-1">
                            <Skeleton className="h-8 w-24 ml-auto" />
                            <Skeleton className="h-4 w-16 ml-auto" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Calendar Card */}
            <Card className="mb-6">
                <CardHeader>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-7 gap-2 mb-4">
                        {Array.from({ length: 7 }).map((_, i) => (
                            <Skeleton key={i} className="h-8 w-full" />
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {Array.from({ length: 35 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Price Breakdown */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                    <div className="flex justify-between">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                    <div className="border-t pt-3 flex justify-between">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-5 w-24" />
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-28" />
            </div>
        </div>
    )
}
