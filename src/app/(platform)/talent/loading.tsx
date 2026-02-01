import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function TalentLoading() {
    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="pb-6 border-b border-slate-100">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-8 w-1 bg-orange-600 rounded-full" />
                    <Skeleton className="h-9 w-64" />
                </div>
                <Skeleton className="h-5 w-96 ml-4" />
            </div>

            {/* Why Section */}
            <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <div className="grid gap-4 md:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i}>
                            <CardContent className="pt-6">
                                <div className="flex items-start gap-3">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <div className="space-y-2 flex-1">
                                        <Skeleton className="h-5 w-32" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-3/4" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Main Cards */}
            <div className="grid gap-6 md:grid-cols-2">
                {[1, 2].map((i) => (
                    <Card key={i}>
                        <CardHeader>
                            <Skeleton className="h-12 w-12 rounded-xl" />
                            <Skeleton className="h-6 w-40 mt-4" />
                            <Skeleton className="h-4 w-64" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                {[1, 2, 3, 4].map((j) => (
                                    <Skeleton key={j} className="h-4 w-full" />
                                ))}
                            </div>
                            <Skeleton className="h-10 w-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
