'use client'

/**
 * @file executives-section.tsx — Manage fractional executives on a claimed listing.
 *
 * @description Allows listing owners to add, edit, and remove fractional
 * executives displayed on their marketplace listing.
 */

import { useState, useTransition, useEffect } from 'react'
import {
    UserPlus,
    Loader2,
    Trash2,
    Pencil,
    Linkedin,
    Briefcase,
    PoundSterling,
    X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    getMyListingExecutives,
    addExecutiveToListing,
    updateExecutive,
    removeExecutive,
} from '@/actions/listing-executives'
import type {
    ListingExecutive,
    AddExecutiveData,
} from '@/actions/listing-executives'
import { toast } from 'sonner'

const AVAILABILITY_LABELS: Record<string, string> = {
    full_time: 'Full-Time',
    part_time: 'Part-Time',
    advisory: 'Advisory',
    project_based: 'Project-Based',
}

const CURRENCY_SYMBOLS: Record<string, string> = {
    GBP: '\u00a3',
    USD: '$',
    EUR: '\u20ac',
}

function formatDayRate(rate: number, currency: string | null): string {
    const symbol = CURRENCY_SYMBOLS[currency ?? 'GBP'] ?? currency ?? '\u00a3'
    return `${symbol}${rate.toLocaleString()}/day`
}

interface ExecutivesSectionProps {
    listingId: string
}

export function ExecutivesSection({ listingId }: ExecutivesSectionProps) {
    const [executives, setExecutives] = useState<ListingExecutive[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showDialog, setShowDialog] = useState(false)
    const [editingExec, setEditingExec] = useState<ListingExecutive | null>(null)
    const [isPending, startTransition] = useTransition()

    // Form state
    const [fullName, setFullName] = useState('')
    const [title, setTitle] = useState('')
    const [email, setEmail] = useState('')
    const [linkedinUrl, setLinkedinUrl] = useState('')
    const [bio, setBio] = useState('')
    const [specializations, setSpecializations] = useState('')
    const [availability, setAvailability] = useState('part_time')
    const [dayRate, setDayRate] = useState('')
    const [currency, setCurrency] = useState('GBP')

    useEffect(() => {
        loadExecutives()
    }, [])

    async function loadExecutives() {
        const result = await getMyListingExecutives()
        if (result.data) {
            setExecutives(result.data.filter((e) => e.status !== 'removed'))
        } else if (result.error) {
            toast.error(result.error)
        }
        setIsLoading(false)
    }

    function resetForm() {
        setFullName('')
        setTitle('')
        setEmail('')
        setLinkedinUrl('')
        setBio('')
        setSpecializations('')
        setAvailability('part_time')
        setDayRate('')
        setCurrency('GBP')
        setEditingExec(null)
    }

    function openAdd() {
        resetForm()
        setShowDialog(true)
    }

    function openEdit(exec: ListingExecutive) {
        setEditingExec(exec)
        setFullName(exec.full_name)
        setTitle(exec.title ?? '')
        setEmail(exec.email ?? '')
        setLinkedinUrl(exec.linkedin_url ?? '')
        setBio(exec.bio ?? '')
        setSpecializations(
            Array.isArray(exec.specializations)
                ? exec.specializations.join(', ')
                : ''
        )
        setAvailability(exec.availability || 'part_time')
        setDayRate(exec.day_rate != null ? String(exec.day_rate) : '')
        setCurrency(exec.currency ?? 'GBP')
        setShowDialog(true)
    }

    function handleSave() {
        if (!fullName.trim()) {
            toast.error('Name is required')
            return
        }

        startTransition(async () => {
            const specs = specializations
                ? specializations.split(',').map((s) => s.trim()).filter(Boolean)
                : []

            if (editingExec) {
                const result = await updateExecutive(editingExec.id, {
                    full_name: fullName,
                    title: title || undefined,
                    email: email || undefined,
                    linkedin_url: linkedinUrl || undefined,
                    bio: bio || undefined,
                    specializations: specs,
                    availability,
                    day_rate: dayRate ? Number(dayRate) : undefined,
                    currency: currency || undefined,
                })
                if (result.error) {
                    toast.error(result.error)
                } else {
                    toast.success('Executive updated')
                    setShowDialog(false)
                    loadExecutives()
                }
            } else {
                const data: AddExecutiveData = {
                    full_name: fullName,
                    title: title || undefined,
                    email: email || undefined,
                    linkedin_url: linkedinUrl || undefined,
                    bio: bio || undefined,
                    specializations: specs,
                    availability: availability as AddExecutiveData['availability'],
                    day_rate: dayRate ? Number(dayRate) : undefined,
                    currency: currency || undefined,
                }
                const result = await addExecutiveToListing(listingId, data)
                if (result.error) {
                    toast.error(result.error)
                } else {
                    toast.success('Executive added')
                    setShowDialog(false)
                    loadExecutives()
                }
            }
        })
    }

    function handleRemove(exec: ListingExecutive) {
        if (!window.confirm(`Remove ${exec.full_name}? This action cannot be undone.`)) return
        startTransition(async () => {
            const result = await removeExecutive(exec.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Executive removed')
                loadExecutives()
            }
        })
    }

    if (isLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center p-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">
                        Fractional Executives
                        <HelpTooltip content="Team members who offer their specialist expertise to startups on a part-time or project basis." />
                    </CardTitle>
                    <Button size="sm" onClick={openAdd}>
                        <UserPlus className="h-4 w-4 mr-1.5" />
                        Add Executive
                    </Button>
                </CardHeader>
                <CardContent>
                    {executives.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center space-y-2">
                            <p className="text-sm font-medium text-foreground">
                                Earn extra income from your team&rsquo;s expertise
                            </p>
                            <p className="text-sm text-muted-foreground max-w-md mx-auto">
                                A fractional executive is someone from your company who can offer their
                                specialist knowledge to startups on a part-time or project basis &mdash;
                                even just a few hours a month. Add anyone from your team whose experience
                                could help others, and set a day rate.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {executives.map((exec) => (
                                <div
                                    key={exec.id}
                                    className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-foreground">
                                                {exec.full_name}
                                            </span>
                                            {exec.title && (
                                                <span className="text-sm text-muted-foreground">
                                                    &middot; {exec.title}
                                                </span>
                                            )}
                                            <Badge variant="secondary" className="text-xs">
                                                {AVAILABILITY_LABELS[exec.availability] ??
                                                    exec.availability}
                                            </Badge>
                                            {exec.day_rate != null && (
                                                <span className="text-sm font-medium text-international-orange">
                                                    {formatDayRate(exec.day_rate, exec.currency)}
                                                </span>
                                            )}
                                        </div>
                                        {exec.bio && (
                                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                                {exec.bio}
                                            </p>
                                        )}
                                        {exec.specializations &&
                                            exec.specializations.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {exec.specializations.map((s) => (
                                                        <Badge
                                                            key={s}
                                                            variant="outline"
                                                            className="text-xs"
                                                        >
                                                            {s}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        <div className="flex items-center gap-3 mt-2">
                                            {exec.email && (
                                                <span className="text-xs text-muted-foreground">
                                                    {exec.email}
                                                </span>
                                            )}
                                            {exec.linkedin_url && (
                                                <a
                                                    href={exec.linkedin_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-international-orange hover:underline inline-flex items-center gap-1"
                                                >
                                                    <Linkedin className="h-3 w-3" />
                                                    LinkedIn
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEdit(exec)}
                                            aria-label={`Edit ${exec.full_name}`}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemove(exec)}
                                            disabled={isPending}
                                            aria-label={`Remove ${exec.full_name}`}
                                        >
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add/Edit Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingExec ? 'Edit Fractional Executive' : 'Add a Fractional Executive'}
                        </DialogTitle>
                        {!editingExec && (
                            <p className="text-sm text-muted-foreground mt-1">
                                Add someone from your team who can offer their specialist knowledge
                                to startups on a flexible basis. They&rsquo;ll appear on your listing
                                so potential clients can see who&rsquo;s available and what they cost.
                            </p>
                        )}
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="exec_name">
                                    Full Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="exec_name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="John Smith"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="exec_title">
                                    <Briefcase className="h-3.5 w-3.5 inline mr-1" />
                                    Title
                                </Label>
                                <Input
                                    id="exec_title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Fractional CFO"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="exec_email">Email</Label>
                                <Input
                                    id="exec_email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="john@company.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="exec_availability">Availability</Label>
                                <Select
                                    value={availability}
                                    onValueChange={setAvailability}
                                >
                                    <SelectTrigger id="exec_availability">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="full_time">Full-Time</SelectItem>
                                        <SelectItem value="part_time">Part-Time</SelectItem>
                                        <SelectItem value="advisory">Advisory</SelectItem>
                                        <SelectItem value="project_based">
                                            Project-Based
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="exec_day_rate">
                                    <PoundSterling className="h-3.5 w-3.5 inline mr-1" />
                                    Day Rate
                                </Label>
                                <Input
                                    id="exec_day_rate"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={dayRate}
                                    onChange={(e) => setDayRate(e.target.value)}
                                    placeholder="500"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="exec_currency">Currency</Label>
                                <Select
                                    value={currency}
                                    onValueChange={setCurrency}
                                >
                                    <SelectTrigger id="exec_currency">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="GBP">GBP</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                        <SelectItem value="EUR">EUR</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="exec_linkedin">
                                <Linkedin className="h-3.5 w-3.5 inline mr-1" />
                                LinkedIn
                            </Label>
                            <Input
                                id="exec_linkedin"
                                value={linkedinUrl}
                                onChange={(e) => setLinkedinUrl(e.target.value)}
                                placeholder="https://linkedin.com/in/johnsmith"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="exec_bio">Bio</Label>
                            <Textarea
                                id="exec_bio"
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Brief background and expertise..."
                                className="min-h-[80px]"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="exec_specializations">
                                Specializations
                            </Label>
                            <Input
                                id="exec_specializations"
                                value={specializations}
                                onChange={(e) => setSpecializations(e.target.value)}
                                placeholder="Finance, Strategy, Operations"
                            />
                            <p className="text-xs text-muted-foreground">
                                Separate with commas
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isPending}>
                            {isPending && (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            {editingExec ? 'Update' : 'Add Executive'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
