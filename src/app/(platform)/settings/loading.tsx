import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
    return (
        <div className="space-y-6">
            {/* Header Skeleton */}
            <Skeleton className="h-9 w-32" />

            {/* Profile Configuration Card */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-44" />
                    <Skeleton className="h-4 w-64 mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { label: "Full Name", width: "w-48" },
                            { label: "Email", width: "w-56" },
                            { label: "Role", width: "w-24" },
                            { label: "Foundry ID", width: "w-64" },
                        ].map((field, i) => (
                            <div key={i} className="space-y-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className={`h-10 ${field.width}`} />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Sign Out Card */}
            <Card className="border-red-100 bg-red-50/50">
                <CardHeader>
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-4 w-80 mt-2" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        </div>
    )
}
