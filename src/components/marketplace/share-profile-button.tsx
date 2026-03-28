'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
    Share2,
    Copy,
    Linkedin,
    Twitter,
    Mail,
    Check,
    ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * ShareProfileButton - Shareable profile link with multiple sharing options.
 *
 * @description Provides a dropdown with share options: copy link, LinkedIn,
 * Twitter/X, and email. Adds UTM tracking parameters for attribution.
 * Uses the native Share API on mobile for a better experience.
 *
 * @component
 *
 * @example
 * <ShareProfileButton
 *   profileSlug="jane-smith"
 *   profileName="Jane Smith"
 *   headline="Fractional CTO"
 * />
 */

interface ShareProfileButtonProps {
    /** Profile slug for URL construction */
    profileSlug: string
    /** Expert's name for share text */
    profileName: string
    /** Expert's headline/role for share text */
    headline?: string
    /** Button variant */
    variant?: 'default' | 'outline' | 'ghost' | 'secondary'
    /** Button size */
    size?: 'default' | 'sm' | 'lg' | 'icon'
    /** Additional CSS classes */
    className?: string
}

export function ShareProfileButton({
    profileSlug,
    profileName,
    headline,
    variant = 'outline',
    size = 'sm',
    className,
}: ShareProfileButtonProps) {
    const [copied, setCopied] = useState(false)
    const [origin, setOrigin] = useState('')

    useEffect(() => {
        setOrigin(window.location.origin)
    }, [])

    const profileUrl = `${origin}/profile/${profileSlug}`
    const shareUrl = `${profileUrl}?source=share&utm_source=share&utm_medium=social&utm_campaign=profile_share`
    const shareTitle = `${profileName}${headline ? ` - ${headline}` : ''}`
    const shareText = `Check out ${profileName}'s profile on ForgeOS${headline ? ` — ${headline}` : ''}. Find experts like this at ForgeOS.`

    const handleCopyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(shareUrl)
            setCopied(true)
            toast.success('Profile link copied!')
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error('Failed to copy link')
        }
    }, [shareUrl])

    const handleNativeShare = useCallback(async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: shareTitle,
                    text: shareText,
                    url: shareUrl,
                })
            } catch (err) {
                // User cancelled - not an error
                if ((err as Error).name !== 'AbortError') {
                    console.error('[ShareProfile] Native share failed:', err)
                }
            }
        }
    }, [shareTitle, shareText, shareUrl])

    const handleLinkedInShare = useCallback(() => {
        const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
        window.open(linkedInUrl, '_blank', 'width=600,height=600')
    }, [shareUrl])

    const handleTwitterShare = useCallback(() => {
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
        window.open(twitterUrl, '_blank', 'width=600,height=400')
    }, [shareText, shareUrl])

    const handleEmailShare = useCallback(() => {
        const subject = encodeURIComponent(`Check out ${profileName} on ForgeOS`)
        const body = encodeURIComponent(`${shareText}\n\n${shareUrl}`)
        window.location.href = `mailto:?subject=${subject}&body=${body}`
    }, [profileName, shareText, shareUrl])

    // Use native share on mobile
    const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant={variant} size={size} className={className}>
                    <Share2 className="w-4 h-4 mr-2" />
                    Share Profile
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={handleCopyLink} className="gap-2 min-h-[44px]">
                    {copied ? (
                        <Check className="w-4 h-4 text-status-success" />
                    ) : (
                        <Copy className="w-4 h-4" />
                    )}
                    {copied ? 'Copied!' : 'Copy Link'}
                </DropdownMenuItem>

                {hasNativeShare && (
                    <DropdownMenuItem onClick={handleNativeShare} className="gap-2 min-h-[44px]">
                        <ExternalLink className="w-4 h-4" />
                        Share via...
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={handleLinkedInShare} className="gap-2 min-h-[44px]">
                    <Linkedin className="w-4 h-4" />
                    Share on LinkedIn
                </DropdownMenuItem>

                <DropdownMenuItem onClick={handleTwitterShare} className="gap-2 min-h-[44px]">
                    <Twitter className="w-4 h-4" />
                    Share on X
                </DropdownMenuItem>

                <DropdownMenuItem onClick={handleEmailShare} className="gap-2 min-h-[44px]">
                    <Mail className="w-4 h-4" />
                    Share via Email
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
