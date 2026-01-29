'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
    Plus,
    MoreHorizontal,
    Pencil,
    Trash2,
    Star,
    ExternalLink,
    Calendar,
    Building2,
    Image as ImageIcon,
    GripVertical,
} from 'lucide-react'
import { format } from 'date-fns'
import { PortfolioItemDialog } from '@/components/provider/PortfolioItemDialog'
import { deletePortfolioItem, updatePortfolioItem, type PortfolioItem } from '@/actions/trust-signals'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface PortfolioManagementViewProps {
    items: PortfolioItem[]
    error: string | null
}

export function PortfolioManagementView({ items, error }: PortfolioManagementViewProps) {
    const router = useRouter()
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async () => {
        if (!deleteId) return
        
        setIsDeleting(true)
        const result = await deletePortfolioItem(deleteId)
        
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Portfolio item deleted')
            router.refresh()
        }
        
        setIsDeleting(false)
        setDeleteId(null)
    }

    const handleToggleFeatured = async (item: PortfolioItem) => {
        const result = await updatePortfolioItem(item.id, {
            is_featured: !item.is_featured,
        })
        
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success(item.is_featured ? 'Removed from featured' : 'Marked as featured')
            router.refresh()
        }
    }

    const handleSuccess = () => {
        router.refresh()
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
                    <p className="text-muted-foreground mt-1">
                        Showcase your best work to potential clients
                    </p>
                </div>
                <PortfolioItemDialog onSuccess={handleSuccess} />
            </div>

            {/* Error State */}
            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                    {error}
                </div>
            )}

            {/* Empty State */}
            {!error && items.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                        <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No portfolio items yet</h3>
                        <p className="text-muted-foreground mb-4">
                            Add your best work to showcase your skills and experience
                        </p>
                        <PortfolioItemDialog
                            trigger={
                                <Button variant="default">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Your First Item
                                </Button>
                            }
                            onSuccess={handleSuccess}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Portfolio Grid */}
            {items.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((item) => (
                        <PortfolioCard
                            key={item.id}
                            item={item}
                            onEdit={handleSuccess}
                            onDelete={() => setDeleteId(item.id)}
                            onToggleFeatured={() => handleToggleFeatured(item)}
                        />
                    ))}
                </div>
            )}

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Portfolio Item</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this portfolio item?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

interface PortfolioCardProps {
    item: PortfolioItem
    onEdit: () => void
    onDelete: () => void
    onToggleFeatured: () => void
}

function PortfolioCard({ item, onEdit, onDelete, onToggleFeatured }: PortfolioCardProps) {
    const hasImages = item.image_urls && item.image_urls.length > 0

    return (
        <Card className="group overflow-hidden">
            {/* Thumbnail */}
            <div className="relative aspect-video bg-muted">
                {hasImages ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={item.image_urls[0]}
                            alt={item.title}
                            className="w-full h-full object-cover"
                        />
                        {item.image_urls.length > 1 && (
                            <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
                                +{item.image_urls.length - 1}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                    </div>
                )}
                
                {/* Featured Badge */}
                {item.is_featured && (
                    <Badge
                        variant="secondary"
                        className="absolute top-2 left-2 bg-amber-50/90 text-amber-700 border-amber-200"
                    >
                        <Star className="w-3 h-3 mr-1 fill-amber-500" />
                        Featured
                    </Badge>
                )}

                {/* Actions Menu */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <PortfolioItemDialog
                                item={item}
                                trigger={
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                        <Pencil className="w-4 h-4 mr-2" />
                                        Edit
                                    </DropdownMenuItem>
                                }
                                onSuccess={onEdit}
                            />
                            <DropdownMenuItem onClick={onToggleFeatured}>
                                <Star className={cn(
                                    "w-4 h-4 mr-2",
                                    item.is_featured && "fill-amber-500 text-amber-500"
                                )} />
                                {item.is_featured ? 'Remove Featured' : 'Mark as Featured'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={onDelete}
                                className="text-red-600 focus:text-red-600"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <CardContent className="p-4">
                <h3 className="font-semibold text-foreground mb-1 line-clamp-1">
                    {item.title}
                </h3>
                {item.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
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
