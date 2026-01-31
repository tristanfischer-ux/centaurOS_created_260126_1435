'use client'

import { useState, memo } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    ExternalLink,
    Calendar,
    Building2,
    Star,
    ChevronLeft,
    ChevronRight,
    X,
    Image as ImageIcon,
} from 'lucide-react'
import { format } from 'date-fns'
import type { PortfolioItem } from '@/actions/trust-signals'
import { sanitizeHref, sanitizeImageSrc } from '@/lib/security/url-validation'

interface PortfolioGalleryProps {
    items: PortfolioItem[]
    maxDisplay?: number
    className?: string
}

export const PortfolioGallery = memo(function PortfolioGallery({
    items,
    maxDisplay,
    className,
}: PortfolioGalleryProps) {
    const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null)
    const [lightboxImageIndex, setLightboxImageIndex] = useState<number | null>(null)

    const displayItems = maxDisplay ? items.slice(0, maxDisplay) : items
    const hasMore = maxDisplay && items.length > maxDisplay

    if (items.length === 0) {
        return (
            <div className={cn('text-center py-8 text-muted-foreground', className)}>
                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No portfolio items yet</p>
            </div>
        )
    }

    const handleOpenLightbox = (itemIndex: number, imageIndex: number) => {
        const item = displayItems[itemIndex]
        if (item.image_urls && item.image_urls.length > 0) {
            setSelectedItem(item)
            setLightboxImageIndex(imageIndex)
        }
    }

    const handleCloseLightbox = () => {
        setLightboxImageIndex(null)
    }

    const handlePrevImage = () => {
        if (selectedItem && lightboxImageIndex !== null && lightboxImageIndex > 0) {
            setLightboxImageIndex(lightboxImageIndex - 1)
        }
    }

    const handleNextImage = () => {
        if (selectedItem && lightboxImageIndex !== null && lightboxImageIndex < selectedItem.image_urls.length - 1) {
            setLightboxImageIndex(lightboxImageIndex + 1)
        }
    }

    return (
        <>
            <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
                {displayItems.map((item, itemIndex) => (
                    <PortfolioCard
                        key={item.id}
                        item={item}
                        onClick={() => setSelectedItem(item)}
                        onImageClick={(imageIndex) => handleOpenLightbox(itemIndex, imageIndex)}
                    />
                ))}
                {hasMore && (
                    <Card className="flex items-center justify-center min-h-[200px] border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
                        <CardContent className="text-center py-4">
                            <p className="text-muted-foreground">
                                +{items.length - (maxDisplay || 0)} more
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Detail Dialog */}
            <Dialog open={!!selectedItem && lightboxImageIndex === null} onOpenChange={(open) => !open && setSelectedItem(null)}>
                <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
                    {selectedItem && (
                        <>
                            <DialogHeader>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <DialogTitle className="text-xl">
                                            {selectedItem.title}
                                        </DialogTitle>
                                        {selectedItem.is_featured && (
                                            <Badge variant="secondary" className="mt-2 bg-amber-50 text-amber-700 border-amber-200">
                                                <Star className="w-3 h-3 mr-1 fill-amber-500" />
                                                Featured
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="space-y-4">
                                {/* Images Grid */}
                                {/* SECURITY: Sanitize user-provided image URLs */}
                                {selectedItem.image_urls && selectedItem.image_urls.length > 0 && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {selectedItem.image_urls.map((url, index) => {
                                            const sanitizedUrl = sanitizeImageSrc(url)
                                            if (!sanitizedUrl) return null
                                            return (
                                                <button
                                                    key={index}
                                                    type="button"
                                                    onClick={() => setLightboxImageIndex(index)}
                                                    className="relative aspect-video rounded-lg overflow-hidden bg-muted border border-border hover:ring-2 hover:ring-ring transition-all cursor-zoom-in"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={sanitizedUrl}
                                                        alt={`${selectedItem.title} - Image ${index + 1}`}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Description */}
                                {selectedItem.description && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-muted-foreground mb-1">
                                            Description
                                        </h4>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">
                                            {selectedItem.description}
                                        </p>
                                    </div>
                                )}

                                {/* Metadata */}
                                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                    {selectedItem.client_name && (
                                        <div className="flex items-center gap-1.5">
                                            <Building2 className="w-4 h-4" />
                                            <span>{selectedItem.client_name}</span>
                                        </div>
                                    )}
                                    {selectedItem.completion_date && (
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="w-4 h-4" />
                                            <span>
                                                {format(new Date(selectedItem.completion_date), 'MMMM yyyy')}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Project URL */}
                                {/* SECURITY: Sanitize user-provided project URL */}
                                {selectedItem.project_url && sanitizeHref(selectedItem.project_url) !== '#' && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        asChild
                                    >
                                        <a
                                            href={sanitizeHref(selectedItem.project_url)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <ExternalLink className="w-4 h-4 mr-1" />
                                            View Project
                                        </a>
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Lightbox */}
            {selectedItem && lightboxImageIndex !== null && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                    onClick={handleCloseLightbox}
                >
                    <button
                        type="button"
                        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
                        onClick={handleCloseLightbox}
                    >
                        <X className="w-6 h-6" />
                    </button>

                    {/* Navigation */}
                    {lightboxImageIndex > 0 && (
                        <button
                            type="button"
                            className="absolute left-4 p-2 text-white/70 hover:text-white transition-colors"
                            onClick={(e) => {
                                e.stopPropagation()
                                handlePrevImage()
                            }}
                        >
                            <ChevronLeft className="w-8 h-8" />
                        </button>
                    )}

                    {lightboxImageIndex < selectedItem.image_urls.length - 1 && (
                        <button
                            type="button"
                            className="absolute right-4 p-2 text-white/70 hover:text-white transition-colors"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleNextImage()
                            }}
                        >
                            <ChevronRight className="w-8 h-8" />
                        </button>
                    )}

                    {/* Image */}
                    {/* SECURITY: Sanitize user-provided image URLs */}
                    <div
                        className="max-w-[90vw] max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {sanitizeImageSrc(selectedItem.image_urls[lightboxImageIndex]) && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={sanitizeImageSrc(selectedItem.image_urls[lightboxImageIndex])!}
                                alt={`${selectedItem.title} - Image ${lightboxImageIndex + 1}`}
                                className="max-w-full max-h-[90vh] object-contain"
                            />
                        )}
                    </div>

                    {/* Counter */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                        {lightboxImageIndex + 1} / {selectedItem.image_urls.length}
                    </div>
                </div>
            )}
        </>
    )
})

// Individual portfolio card
interface PortfolioCardProps {
    item: PortfolioItem
    onClick: () => void
    onImageClick: (imageIndex: number) => void
}

function PortfolioCard({ item, onClick, onImageClick }: PortfolioCardProps) {
    const hasImages = item.image_urls && item.image_urls.length > 0

    return (
        <Card
            className="group cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
            onClick={onClick}
        >
            {/* Thumbnail */}
            {/* SECURITY: Sanitize user-provided image URLs */}
            {hasImages && sanitizeImageSrc(item.image_urls[0]) ? (
                <div
                    className="relative aspect-video bg-muted"
                    onClick={(e) => {
                        e.stopPropagation()
                        onImageClick(0)
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={sanitizeImageSrc(item.image_urls[0])!}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {item.is_featured && (
                        <Badge
                            variant="secondary"
                            className="absolute top-2 left-2 bg-amber-50/90 text-amber-700 border-amber-200"
                        >
                            <Star className="w-3 h-3 mr-1 fill-amber-500" />
                            Featured
                        </Badge>
                    )}
                    {item.image_urls.length > 1 && (
                        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
                            +{item.image_urls.length - 1}
                        </div>
                    )}
                </div>
            ) : (
                <div className="aspect-video bg-muted flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                    {item.is_featured && (
                        <Badge
                            variant="secondary"
                            className="absolute top-2 left-2 bg-amber-50/90 text-amber-700 border-amber-200"
                        >
                            <Star className="w-3 h-3 mr-1 fill-amber-500" />
                            Featured
                        </Badge>
                    )}
                </div>
            )}

            <CardContent className="p-4">
                <h3 className="font-semibold text-foreground mb-1 line-clamp-1">
                    {item.title}
                </h3>
                {item.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {item.description}
                    </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
                </div>
            </CardContent>
        </Card>
    )
}
