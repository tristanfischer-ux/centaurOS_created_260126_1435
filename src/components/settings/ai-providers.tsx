'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sparkles, Brain, Globe, Image, Mic, Cpu, Zap, Flame, HardDrive, Eye, EyeOff, Trash2, Check, Loader2, ExternalLink, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PROVIDER_REGISTRY, type AIProviderId } from '@/lib/ai-providers/types'
import { saveProviderKey, deleteProviderKey, getProviderKeys } from '@/actions/ai-providers'
import { toast } from 'sonner'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    Sparkles, Brain, Globe, Image, Mic, Cpu, Zap, Flame, HardDrive,
}

interface StoredKey {
    provider_id: string
    key_hint: string
    updated_at: string
}

export function AIProviders() {
    const [storedKeys, setStoredKeys] = useState<StoredKey[]>([])
    const [editingProvider, setEditingProvider] = useState<AIProviderId | null>(null)
    const [keyInput, setKeyInput] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const loadKeys = useCallback(async () => {
        const result = await getProviderKeys()
        if (result.error) {
            toast.error(result.error)
        } else {
            setStoredKeys(result.keys)
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        loadKeys()
    }, [loadKeys])

    const handleSaveKey = async (providerId: AIProviderId) => {
        if (!keyInput.trim()) return
        setSaving(true)
        const result = await saveProviderKey(providerId, keyInput)
        setSaving(false)

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success(`${PROVIDER_REGISTRY[providerId].name} API key saved`)
            setEditingProvider(null)
            setKeyInput('')
            setShowKey(false)
            loadKeys()
        }
    }

    const handleDeleteKey = async (providerId: AIProviderId) => {
        setDeleting(providerId)
        const result = await deleteProviderKey(providerId)
        setDeleting(null)

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success(`${PROVIDER_REGISTRY[providerId].name} API key removed`)
            loadKeys()
        }
    }

    const providers = Object.values(PROVIDER_REGISTRY)

    return (
        <Card className="bg-background border-muted shadow-[0_2px_15px_rgba(0,0,0,0.03)] overflow-hidden">
            <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-international-orange-light rounded-lg">
                        <KeyRound className="h-5 w-5 text-international-orange" />
                    </div>
                    <div>
                        <CardTitle>AI Providers</CardTitle>
                        <CardDescription>
                            Connect your own AI provider API keys. Keys are encrypted with AES-256-GCM.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        {providers.map((provider) => {
                            const IconComponent = ICON_MAP[provider.icon] || Sparkles
                            const storedKey = storedKeys.find(k => k.provider_id === provider.id)
                            const isEditing = editingProvider === provider.id
                            const isDeleting = deleting === provider.id

                            return (
                                <div
                                    key={provider.id}
                                    className={cn(
                                        "p-4 rounded-lg border transition-all duration-200",
                                        storedKey ? "border-status-success/30 bg-status-success-light/30" : "border-muted hover:border-muted-foreground/20 hover:shadow-sm",
                                        isEditing && "ring-2 ring-international-orange/30 border-international-orange/50"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="p-2 rounded-lg"
                                            style={{ backgroundColor: `${provider.color}15` }}
                                        >
                                            <IconComponent
                                                className="h-5 w-5"
                                                style={{ color: provider.color } as React.CSSProperties}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-foreground">{provider.name}</span>
                                                {storedKey && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-status-success-light text-status-success-dark">
                                                        <Check className="h-3 w-3" /> Connected
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5">{provider.description}</p>
                                            <div className="flex gap-1 mt-1">
                                                {provider.capabilities.map(cap => (
                                                    <span key={cap} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">
                                                        {cap}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {storedKey && !isEditing && (
                                                <span className="text-xs text-muted-foreground font-mono">
                                                    {storedKey.key_hint}
                                                </span>
                                            )}
                                            <a
                                                href={provider.website}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 rounded hover:bg-muted transition-colors"
                                                title="Get API key"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                            </a>
                                            {storedKey && !isEditing && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDeleteKey(provider.id)}
                                                    disabled={!!isDeleting}
                                                >
                                                    {isDeleting ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                            )}
                                            {!isEditing && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8"
                                                    onClick={() => {
                                                        setEditingProvider(provider.id)
                                                        setKeyInput('')
                                                        setShowKey(false)
                                                    }}
                                                >
                                                    {storedKey ? 'Update' : 'Add Key'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {isEditing && (
                                        <div className="mt-3 pt-3 border-t border-muted space-y-3">
                                            <div>
                                                <Label className="text-xs">API Key</Label>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="relative flex-1">
                                                        <Input
                                                            type={showKey ? 'text' : 'password'}
                                                            value={keyInput}
                                                            onChange={(e) => setKeyInput(e.target.value)}
                                                            placeholder={`Paste your ${provider.name} API key...`}
                                                            className="pr-10"
                                                            autoFocus
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowKey(!showKey)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                                                        >
                                                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setEditingProvider(null)
                                                        setKeyInput('')
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSaveKey(provider.id)}
                                                    disabled={saving || !keyInput.trim()}
                                                >
                                                    {saving ? (
                                                        <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Saving...</>
                                                    ) : (
                                                        'Save Key'
                                                    )}
                                                </Button>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                Your key is encrypted with AES-256-GCM before storage. It is never logged or exposed to the client.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
