'use client'

import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function PreviewCardSkeleton() {
    return (
        <Card className="relative flex flex-col shadow-sm overflow-hidden border-slate-200">
            {/* Image skeleton */}
            <Skeleton className="w-full aspect-[4/3]" />

            <CardContent className="p-4 flex-1">
                {/* Category badge skeleton */}
                <Skeleton className="h-5 w-20 mb-2" />

                {/* Title skeleton */}
                <Skeleton className="h-5 w-full mb-1" />

                {/* Role/subtitle skeleton */}
                <Skeleton className="h-4 w-3/4 mb-2" />

                {/* Description skeleton */}
                <div className="space-y-2 mb-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                </div>

                {/* Metrics skeleton */}
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                    </div>

                    {/* Tags skeleton */}
                    <div className="flex gap-1">
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                </div>
            </CardContent>

            <CardFooter className="p-4 pt-0 border-t border-slate-100">
                <div className="flex items-center justify-between w-full">
                    {/* Price skeleton */}
                    <div className="space-y-1">
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-6 w-20" />
                    </div>

                    {/* Button skeleton */}
                    <Skeleton className="h-9 w-28 rounded-md" />
                </div>
            </CardFooter>
        </Card>
    )
}

export function PreviewSectionSkeleton() {
    return (
        <section className="w-full py-16 md:py-24 bg-gradient-to-b from-slate-50 to-white">
            <div className="container mx-auto px-4 md:px-6 max-w-7xl">
                {/* Header skeleton */}
                <div className="text-center mb-12 space-y-4">
                    <div className="inline-flex items-center justify-center">
                        <Skeleton className="h-8 w-48 rounded-full mb-4" />
                    </div>
                    
                    <Skeleton className="h-12 w-96 mx-auto mb-4" />
                    <Skeleton className="h-6 w-full max-w-2xl mx-auto" />
                </div>

                {/* Cards grid skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
                    {[...Array(4)].map((_, i) => (
                        <PreviewCardSkeleton key={i} />
                    ))}
                </div>

                {/* Bottom CTA skeleton */}
                <div className="text-center">
                    <div className="inline-flex flex-col items-center gap-4 p-8 rounded-2xl bg-gradient-to-br from-slate-50 via-violet-50/30 to-blue-50/30 border border-slate-200">
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-96 mx-auto" />
                            <Skeleton className="h-5 w-80 mx-auto" />
                        </div>
                        
                        <Skeleton className="h-12 w-72 rounded-md" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                </div>
            </div>
        </section>
    )
}
