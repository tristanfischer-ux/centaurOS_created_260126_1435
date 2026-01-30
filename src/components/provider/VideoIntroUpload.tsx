'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { updatePublicProfileSettings } from '@/actions/public-profile'
import { 
    Video, 
    Upload, 
    Play, 
    Trash2, 
    Loader2,
    LinkIcon,
    AlertCircle,
    CheckCircle2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface VideoIntroUploadProps {
    currentVideoUrl: string | null
    currentThumbnailUrl: string | null
}

export function VideoIntroUpload({ currentVideoUrl, currentThumbnailUrl }: VideoIntroUploadProps) {
    const [videoUrl, setVideoUrl] = useState(currentVideoUrl || '')
    const [isLoading, setIsLoading] = useState(false)
    const [showPreview, setShowPreview] = useState(false)
    
    // Validate video URL (YouTube, Vimeo, Loom supported)
    const isValidVideoUrl = (url: string) => {
        if (!url) return false
        const patterns = [
            /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
            /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
            /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
            /^https?:\/\/(www\.)?vimeo\.com\/\d+/,
            /^https?:\/\/player\.vimeo\.com\/video\/\d+/,
            /^https?:\/\/(www\.)?loom\.com\/share\/[\w-]+/,
            /^https?:\/\/(www\.)?loom\.com\/embed\/[\w-]+/,
        ]
        return patterns.some(pattern => pattern.test(url))
    }
    
    // Convert URL to embed format
    const getEmbedUrl = (url: string) => {
        // YouTube
        const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/)
        if (youtubeMatch) {
            return `https://www.youtube.com/embed/${youtubeMatch[1]}`
        }
        
        // Vimeo
        const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/)
        if (vimeoMatch) {
            return `https://player.vimeo.com/video/${vimeoMatch[1]}`
        }
        
        // Loom
        const loomMatch = url.match(/(?:loom\.com\/share\/|loom\.com\/embed\/)([\w-]+)/)
        if (loomMatch) {
            return `https://www.loom.com/embed/${loomMatch[1]}`
        }
        
        return url
    }
    
    async function handleSave() {
        if (!videoUrl) {
            // Clear video
            setIsLoading(true)
            const result = await updatePublicProfileSettings({ video_url: '' })
            setIsLoading(false)
            
            if (result.success) {
                toast.success('Video removed')
            } else {
                toast.error(result.error || 'Failed to remove video')
            }
            return
        }
        
        if (!isValidVideoUrl(videoUrl)) {
            toast.error('Please enter a valid YouTube, Vimeo, or Loom URL')
            return
        }
        
        setIsLoading(true)
        const embedUrl = getEmbedUrl(videoUrl)
        const result = await updatePublicProfileSettings({ video_url: embedUrl })
        setIsLoading(false)
        
        if (result.success) {
            toast.success('Video saved!')
        } else {
            toast.error(result.error || 'Failed to save video')
        }
    }
    
    const isValid = !videoUrl || isValidVideoUrl(videoUrl)
    const hasVideo = !!videoUrl && isValid
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5" />
                    Video Introduction
                </CardTitle>
                <CardDescription>
                    Add a 60-90 second video intro to increase engagement by 2-3x
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Current Video Preview */}
                {hasVideo && showPreview && (
                    <div className="aspect-video rounded-lg overflow-hidden bg-black">
                        <iframe
                            src={getEmbedUrl(videoUrl)}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                )}
                
                {hasVideo && !showPreview && (
                    <button
                        onClick={() => setShowPreview(true)}
                        className="relative w-full aspect-video rounded-lg overflow-hidden bg-background group"
                    >
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Play className="w-8 h-8 text-foreground ml-1" />
                            </div>
                        </div>
                        <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded">
                            Click to preview
                        </div>
                    </button>
                )}
                
                {/* URL Input */}
                <div className="space-y-2">
                    <Label htmlFor="videoUrl">Video URL</Label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="videoUrl"
                                value={videoUrl}
                                onChange={(e) => {
                                    setVideoUrl(e.target.value)
                                    setShowPreview(false)
                                }}
                                placeholder="https://youtube.com/watch?v=... or https://loom.com/share/..."
                                className={cn(
                                    "pl-10",
                                    videoUrl && !isValid && "border-red-500"
                                )}
                            />
                        </div>
                        {videoUrl && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                    setVideoUrl('')
                                    setShowPreview(false)
                                }}
                            >
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        )}
                    </div>
                    {videoUrl && !isValid && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Please enter a valid YouTube, Vimeo, or Loom URL
                        </p>
                    )}
                </div>
                
                {/* Supported Platforms */}
                <Alert>
                    <AlertDescription>
                        <p className="text-sm font-medium mb-2">Supported platforms:</p>
                        <div className="flex flex-wrap gap-2">
                            <span className="text-xs bg-muted px-2 py-1 rounded">YouTube</span>
                            <span className="text-xs bg-muted px-2 py-1 rounded">Vimeo</span>
                            <span className="text-xs bg-muted px-2 py-1 rounded">Loom</span>
                        </div>
                    </AlertDescription>
                </Alert>
                
                {/* Tips */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                    <h4 className="font-medium text-blue-900 text-sm mb-2">Tips for a great intro video</h4>
                    <ul className="text-xs text-blue-800 space-y-1">
                        <li>• Keep it 60-90 seconds - attention spans are short!</li>
                        <li>• Introduce yourself and your expertise</li>
                        <li>• Share what types of clients you work best with</li>
                        <li>• End with a call-to-action (book a call)</li>
                        <li>• Good lighting and audio matter more than fancy editing</li>
                    </ul>
                </div>
                
                {/* Save Button */}
                <Button 
                    onClick={handleSave} 
                    disabled={isLoading || (videoUrl && !isValid)}
                    className="w-full"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : videoUrl ? (
                        <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Save Video
                        </>
                    ) : currentVideoUrl ? (
                        <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Video
                        </>
                    ) : (
                        <>
                            <Upload className="h-4 w-4 mr-2" />
                            Add Video
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    )
}
