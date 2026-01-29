'use client'

import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Star,
    ChevronLeft,
    ChevronRight,
    Calendar,
    Building2,
    Image as ImageIcon,
    ExternalLink,
} from 'lucide-react'
import { format } from 'date-fns'
import type { PortfolioItem } from '@/actions/trust-signals'

interface PortfolioGridProps {
    items: PortfolioItem[]
    columns?: 2 | 3 | 4
    showFeaturedHighlight?: boolean
    onItemClick?: (item: PortfolioItem) => void
    className?: string
}

export const PortfolioGrid = memo(function PortfolioGrid({
    items,
    columns = 3,
    showFeaturedHighlight = true,
    onItemClick,
    className,
}: PortfolioGridProps) {
    if (items.length === 0) {
        return (
            <div className={cn('text-center py-8 text-muted-foreground', className)}>
                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No portfolio items</p>
            </div>
        )
    }

    const gridCols = {
        2: 'grid-cols-1 sm:grid-cols-2',
        3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    }

    return (
        <div className={cn('grid gap-4', gridCols[columns], className)}>
            {items.map((item) => (
                <PortfolioGridCard
                    key={item.id}
                    item={item}
                    showFeaturedHighlight={showFeaturedHighlight}
                    onClick={() => onItemClick?.(item)}
                />
            ))}
        </div>
    )
})

interface PortfolioGridCardProps {
    item: PortfolioItem
    showFeaturedHighlight?: boolean
    onClick?: () => void
}

function PortfolioGridCard({ item, showFeaturedHighlight, onClick }: PortfolioGridCardProps) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0)
    const hasImages = item.image_urls && item.image_urls.length > 0
    const hasMultipleImages = item.image_urls && item.image_urls.length > 1

    const handlePrevImage = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (currentImageIndex > 0) {
            setCurrentImageIndex(currentImageIndex - 1)
        }
    }

    const handleNextImage = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (item.image_urls && currentImageIndex < item.image_urls.length - 1) {
            setCurrentImageIndex(currentImageIndex + 1)
        }
    }

    return (
        <Card
            className={cn(
                'group overflow-hidden transition-shadow',
                onClick && 'cursor-pointer hover:shadow-md',
                showFeaturedHighlight && item.is_featured && 'ring-2 ring-amber-400'
            )}
            onClick={onClick}
        >
            {/* Image Carousel */}
            <div className="relative aspect-video bg-muted">
                {hasImages ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={item.image_urls[currentImageIndex]}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        
                        {/* Carousel Navigation */}
                        {hasMultipleImages && (
                            <>
                                {currentImageIndex > 0 && (
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={handlePrevImage}
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                )}
                                {currentImageIndex < item.image_urls.length - 1 && (
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={handleNextImage}
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                )}
                                
                                {/* Image Dots */}
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                                    {item.image_urls.map((_, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setCurrentImageIndex(index)
                                            }}
                                            className={cn(
                                                'w-1.5 h-1.5 rounded-full transition-colors',
                                                index === currentImageIndex
                                                    ? 'bg-white'
                                                    : 'bg-white/50 hover:bg-white/75'
                                            )}
                                        />
                                    ))}
                                </div>

                                {/* Image Count */}
                                <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                                    {currentImageIndex + 1} / {item.image_urls.length}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                    </div>
                )}

                {/* Featured Badge */}
                {showFeaturedHighlight && item.is_featured && (
                    <Badge
                        variant="secondary"
                        className="absolute top-2 left-2 bg-amber-50/90 text-amber-700 border-amber-200"
                    >
                        <Star className="w-3 h-3 mr-1 fill-amber-500" />
                        Featured
                    </Badge>
                )}
            </div>

            <CardContent className="p-4">
                <h3 className="font-semibold text-foreground mb-1 line-clamp-1">
                    {item.title}
                </h3>
                {item.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {item.description}
                    </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {item.client_name && (
                        <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {item.client_name}
                        </span>
                    )}
                    {item.completion_date && (
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(item.completion_date), 'MMM yyyy')}
                        </span>
                    )}
                    {item.project_url && (
                        <a
                            href={item.project_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink className="w-3 h-3" />
                            View
                        </a>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

export default PortfolioGrid
