'use client'

import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MessageCircle, RefreshCw, Check, Copy, ExternalLink, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TelegramLinkProps {
    initialLink: {
        id: string
        platform_username: string | null
        verified_at: string | null
    } | null
    botUsername: string
}

export function TelegramLink({ initialLink, botUsername }: TelegramLinkProps) {
    const [link, setLink] = useState(initialLink)
    const [verificationCode, setVerificationCode] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [copied, setCopied] = useState(false)
    const [manualCode, setManualCode] = useState('')
    const [isLinking, setIsLinking] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isLinked = link?.verified_at !== null

    // Generate verification code
    const generateCode = async () => {
        setIsGenerating(true)
        setError(null)
        try {
            const response = await fetch('/api/settings/telegram/generate-code', {
                method: 'POST',
            })
            const data = await response.json()
            if (data.error) {
                setError(data.error)
            } else {
                setVerificationCode(data.code)
            }
        } catch {
            setError('Failed to generate code')
        }
        setIsGenerating(false)
    }

    // Copy code to clipboard
    const copyCode = async () => {
        if (verificationCode) {
            await navigator.clipboard.writeText(verificationCode)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    // Unlink Telegram
    const unlinkTelegram = async () => {
        try {
            const response = await fetch('/api/settings/telegram/unlink', {
                method: 'POST',
            })
            const data = await response.json()
            if (data.success) {
                setLink(null)
                setVerificationCode(null)
            } else {
                setError(data.error || 'Failed to unlink')
            }
        } catch {
            setError('Failed to unlink')
        }
    }

    // Poll for link completion
    useEffect(() => {
        if (!verificationCode || isLinked) return

        const interval = setInterval(async () => {
            try {
                const response = await fetch('/api/settings/telegram/check-link')
                const data = await response.json()
                if (data.linked) {
                    setLink(data.link)
                    setVerificationCode(null)
                }
            } catch {
                // Ignore polling errors
            }
        }, 3000) // Check every 3 seconds

        return () => clearInterval(interval)
    }, [verificationCode, isLinked])

    // Deep link URL for Telegram
    const telegramDeepLink = verificationCode
        ? `https://t.me/${botUsername}?start=${verificationCode}`
        : `https://t.me/${botUsername}`

    return (
        <Card className="bg-background border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-[#0088cc]" />
                    <CardTitle>Telegram Integration</CardTitle>
                </div>
                <CardDescription>
                    Link your Telegram to create objectives by sending text or voice messages.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {isLinked ? (
                    // Linked state
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-status-success-light rounded-lg border border-status-success/20">
                            <Check className="h-5 w-5 text-status-success" />
                            <div>
                                <p className="font-medium text-status-success-dark">Connected</p>
                                <p className="text-sm text-muted-foreground">
                                    @{link?.platform_username || 'Unknown user'}
                                </p>
                            </div>
                        </div>

                        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                            <p className="text-sm font-medium">How to use:</p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• Send a text message describing your goal</li>
                                <li>• Send a voice message with your objective</li>
                                <li>• Review and confirm the structured tasks</li>
                            </ul>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                className="flex-1"
                                onClick={() => window.open(telegramDeepLink, '_blank')}
                            >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open Telegram
                            </Button>
                            <Button
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={unlinkTelegram}
                            >
                                <Unlink className="h-4 w-4 mr-2" />
                                Unlink
                            </Button>
                        </div>
                    </div>
                ) : verificationCode ? (
                    // Verification code state
                    <div className="space-y-6">
                        <div className="flex flex-col items-center gap-4">
                            <div className="p-4 bg-white rounded-xl border shadow-sm">
                                <QRCodeSVG
                                    value={telegramDeepLink}
                                    size={180}
                                    level="M"
                                    includeMargin={false}
                                />
                            </div>
                            <p className="text-sm text-muted-foreground text-center">
                                Scan with your phone camera or Telegram
                            </p>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">
                                    Or enter code manually
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <code className="flex-1 p-3 bg-muted rounded-lg text-center text-2xl font-mono tracking-wider">
                                    {verificationCode}
                                </code>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    onClick={copyCode}
                                    className="h-12 w-12"
                                >
                                    {copied ? (
                                        <Check className="h-4 w-4 text-status-success" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                                Send <code>/link {verificationCode}</code> to @{botUsername}
                            </p>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                className="flex-1"
                                onClick={() => window.open(telegramDeepLink, '_blank')}
                            >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open Telegram
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={generateCode}
                                disabled={isGenerating}
                            >
                                <RefreshCw
                                    className={cn('h-4 w-4 mr-2', isGenerating && 'animate-spin')}
                                />
                                New Code
                            </Button>
                        </div>

                        <p className="text-xs text-muted-foreground text-center">
                            Code expires in 15 minutes
                        </p>
                    </div>
                ) : (
                    // Initial state - generate code
                    <div className="space-y-4">
                        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                            <p className="text-sm font-medium">What you can do:</p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• Send text messages to create objectives</li>
                                <li>• Send voice notes describing your goals</li>
                                <li>• Review and confirm structured tasks</li>
                                <li>• Get objectives added to CentaurOS instantly</li>
                            </ul>
                        </div>

                        {error && (
                            <div className="p-3 bg-status-error-light text-status-error-dark text-sm rounded-lg">
                                {error}
                            </div>
                        )}

                        <Button
                            className="w-full"
                            onClick={generateCode}
                            disabled={isGenerating}
                        >
                            {isGenerating ? (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <MessageCircle className="h-4 w-4 mr-2" />
                                    Link Telegram Account
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
