'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { CalendarIcon, Loader2, Plus, X, Upload, Image as ImageIcon } from 'lucide-react'
import { addPortfolioItem, updatePortfolioItem, type PortfolioItem } from '@/actions/trust-signals'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface PortfolioFormProps {
    item?: PortfolioItem
    providerId?: string
    onSuccess?: (item: PortfolioItem) => void
    onCancel?: () => void
    className?: string
}

export function PortfolioForm({ 
    item, 
    providerId,
    onSuccess, 
    onCancel,
    className,
}: PortfolioFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    
    // Form state
    const [title, setTitle] = useState(item?.title || '')
    const [description, setDescription] = useState(item?.description || '')
    const [projectUrl, setProjectUrl] = useState(item?.project_url || '')
    const [clientName, setClientName] = useState(item?.client_name || '')
    const [completionDate, setCompletionDate] = useState<Date | undefined>(
        item?.completion_date ? new Date(item.completion_date) : undefined
    )
    const [isFeatured, setIsFeatured] = useState(item?.is_featured || false)
    const [imageUrls, setImageUrls] = useState<string[]>(item?.image_urls || [])
    const [newImageUrl, setNewImageUrl] = useState('')

    const isEditing = !!item

    const handleAddImageUrl = useCallback(() => {
        if (newImageUrl.trim() && !imageUrls.includes(newImageUrl.trim())) {
            try {
                new URL(newImageUrl.trim())
                setImageUrls([...imageUrls, newImageUrl.trim()])
                setNewImageUrl('')
            } catch {
                toast.error('Please enter a valid URL')
            }
        }
    }, [newImageUrl, imageUrls])

    const handleRemoveImageUrl = useCallback((url: string) => {
        setImageUrls(imageUrls.filter(u => u !== url))
    }, [imageUrls])

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        setIsUploading(true)
        const supabase = createClient()

        for (const file of Array.from(files)) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                toast.error(`${file.name} is not an image`)
                continue
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                toast.error(`${file.name} is too large (max 5MB)`)
                continue
            }

            try {
                const fileExt = file.name.split('.').pop()
                const fileName = `portfolio/${providerId || 'temp'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

                const { error: uploadError } = await supabase.storage
                    .from('provider-assets')
                    .upload(fileName, file)

                if (uploadError) {
                    console.error('Upload error:', uploadError)
                    toast.error(`Failed to upload ${file.name}`)
                    continue
                }

                const { data: urlData } = supabase.storage
                    .from('provider-assets')
                    .getPublicUrl(fileName)

                if (urlData?.publicUrl) {
                    setImageUrls(prev => [...prev, urlData.publicUrl])
                }
            } catch (uploadErr) {
                console.error('Upload error:', uploadErr)
                toast.error(`Failed to upload ${file.name}`)
            }
        }

        setIsUploading(false)
        e.target.value = '' // Reset input
    }, [providerId])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!title.trim()) {
            toast.error('Title is required')
            return
        }

        setIsLoading(true)

        try {
            const data = {
                title: title.trim(),
                description: description.trim() || undefined,
                image_urls: imageUrls,
                project_url: projectUrl.trim() || undefined,
                client_name: clientName.trim() || undefined,
                completion_date: completionDate?.toISOString().split('T')[0],
                is_featured: isFeatured,
            }

            const result = isEditing
                ? await updatePortfolioItem(item.id, data)
                : await addPortfolioItem(data)

            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(isEditing ? 'Portfolio item updated' : 'Portfolio item added')
                if (result.data) {
                    onSuccess?.(result.data)
                }
            }
        } catch {
            toast.error('An unexpected error occurred')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className={cn('space-y-4', className)}>
            {/* Title */}
            <div className="grid gap-2">
                <Label htmlFor="title">
                    Title <span className="text-red-500">*</span>
                </Label>
                <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Brand Identity for TechStartup"
                    required
                />
            </div>

            {/* Description */}
            <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the project, your role, and the outcomes..."
                    className="h-24"
                />
            </div>

            {/* Image Upload & URLs */}
            <div className="grid gap-2">
                <Label>Images</Label>
                
                {/* File Upload */}
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label 
                            htmlFor="image-upload"
                            className={cn(
                                'flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
                                'hover:border-primary hover:bg-primary/5',
                                isUploading && 'opacity-50 cursor-wait'
                            )}
                        >
                            {isUploading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Upload className="w-4 h-4" />
                            )}
                            <span className="text-sm">
                                {isUploading ? 'Uploading...' : 'Upload Images'}
                            </span>
                        </label>
                        <input
                            id="image-upload"
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handleFileUpload}
                            disabled={isUploading}
                        />
                    </div>
                </div>

                {/* URL Input */}
                <div className="flex gap-2">
                    <Input
                        value={newImageUrl}
                        onChange={(e) => setNewImageUrl(e.target.value)}
                        placeholder="Or paste image URL..."
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                handleAddImageUrl()
                            }
                        }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleAddImageUrl}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>

                {/* Image Preview Grid */}
                {imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {imageUrls.map((url, index) => (
                            <div key={index} className="relative group">
                                <div className="w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={url}
                                        alt={`Portfolio image ${index + 1}`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement
                                            target.style.display = 'none'
                                            target.nextElementSibling?.classList.remove('hidden')
                                        }}
                                    />
                                    <div className="hidden w-full h-full flex items-center justify-center">
                                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveImageUrl(url)}
                                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Project URL */}
            <div className="grid gap-2">
                <Label htmlFor="projectUrl">Project URL (optional)</Label>
                <Input
                    id="projectUrl"
                    type="url"
                    value={projectUrl}
                    onChange={(e) => setProjectUrl(e.target.value)}
                    placeholder="https://..."
                />
            </div>

            {/* Client Name */}
            <div className="grid gap-2">
                <Label htmlFor="clientName">Client Name (optional)</Label>
                <Input
                    id="clientName"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g., Acme Corp"
                />
                <p className="text-xs text-muted-foreground">
                    Only include if you have permission to share
                </p>
            </div>

            {/* Completion Date */}
            <div className="grid gap-2">
                <Label>Completion Date</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                'w-full justify-start text-left font-normal',
                                !completionDate && 'text-muted-foreground'
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {completionDate ? (
                                format(completionDate, 'PPP')
                            ) : (
                                <span>Pick a date</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={completionDate}
                            onSelect={setCompletionDate}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Featured Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                    <Label htmlFor="featured">Mark as Featured</Label>
                    <p className="text-sm text-muted-foreground">
                        Featured items appear first in your portfolio
                    </p>
                </div>
                <Switch
                    id="featured"
                    checked={isFeatured}
                    onCheckedChange={setIsFeatured}
                />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
                {onCancel && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                )}
                <Button type="submit" variant="primary" disabled={isLoading || isUploading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEditing ? 'Save Changes' : 'Add Item'}
                </Button>
            </div>
        </form>
    )
}
