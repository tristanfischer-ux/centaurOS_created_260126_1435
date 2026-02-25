'use client'

/**
 * @file listing-editor.tsx — Client component for editing a claimed listing.
 *
 * @description Provides a form for claimed listing owners to update their
 * company description, contact info, and structured attributes (capabilities,
 * certifications, industries, location, employees, established year).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Building,
    Save,
    Loader2,
    CheckCircle2,
    AlertCircle,
    User,
    Mail,
    Phone,
    Briefcase,
    Linkedin,
    MapPin,
    Users,
    Calendar,
    ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { updateClaimedListing } from '@/actions/listing-claims'
import type { ClaimedListing, ListingUpdateData } from '@/actions/listing-claims'
import { toast } from 'sonner'

interface ListingEditorProps {
    listing: ClaimedListing | null
    error: string | null
}

export function ListingEditor({ listing, error }: ListingEditorProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [saved, setSaved] = useState(false)

    // INTENT: Parse initial values from listing, including structured attrs
    const attrs = (listing?.attributes ?? {}) as Record<string, unknown>

    const [description, setDescription] = useState(listing?.description ?? '')
    const [contactName, setContactName] = useState(listing?.contact_name ?? '')
    const [contactEmail, setContactEmail] = useState(listing?.contact_email ?? '')
    const [contactTitle, setContactTitle] = useState(listing?.contact_title ?? '')
    const [contactLinkedin, setContactLinkedin] = useState(listing?.contact_linkedin ?? '')
    const [contactPhone, setContactPhone] = useState(listing?.contact_phone ?? '')
    const [location, setLocation] = useState((attrs.location as string) ?? '')
    const [employees, setEmployees] = useState((attrs.employees as string) ?? '')
    const [established, setEstablished] = useState(
        attrs.established ? String(attrs.established) : ''
    )
    const [capabilities, setCapabilities] = useState(
        Array.isArray(attrs.capabilities) ? (attrs.capabilities as string[]).join(', ') : ''
    )
    const [certifications, setCertifications] = useState(
        Array.isArray(attrs.certifications) ? (attrs.certifications as string[]).join(', ') : ''
    )
    const [industries, setIndustries] = useState(
        Array.isArray(attrs.industries) ? (attrs.industries as string[]).join(', ') : ''
    )

    const handleSave = () => {
        if (!listing) return

        startTransition(async () => {
            const updates: ListingUpdateData = {
                description: description || undefined,
                contact_name: contactName || undefined,
                contact_email: contactEmail || undefined,
                contact_title: contactTitle || undefined,
                contact_linkedin: contactLinkedin || undefined,
                contact_phone: contactPhone || undefined,
                location: location || undefined,
                employees: employees || undefined,
                established: established ? parseInt(established, 10) : undefined,
                capabilities: capabilities
                    ? capabilities.split(',').map((s) => s.trim()).filter(Boolean)
                    : undefined,
                certifications: certifications
                    ? certifications.split(',').map((s) => s.trim()).filter(Boolean)
                    : undefined,
                industries: industries
                    ? industries.split(',').map((s) => s.trim()).filter(Boolean)
                    : undefined,
            }

            const result = await updateClaimedListing(listing.listing_id, updates)

            if (result.error) {
                toast.error(result.error)
            } else {
                setSaved(true)
                toast.success('Listing updated successfully!')
                router.refresh()
                setTimeout(() => setSaved(false), 3000)
            }
        })
    }

    // ── No listing found ──────────────────────────────────────────────────────
    if (error || !listing) {
        return (
            <div className="max-w-3xl mx-auto space-y-6">
                <Card>
                    <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                        <AlertCircle className="h-12 w-12 text-muted-foreground" />
                        <h2 className="text-xl font-semibold text-foreground">
                            No Claimed Listing
                        </h2>
                        <p className="text-sm text-muted-foreground max-w-md">
                            {error ??
                                "You haven't claimed a listing yet. Check your email for a claim link from Fractional Forge."}
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // ── Editor ────────────────────────────────────────────────────────────────
    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-international-orange/10">
                            <Building className="h-5 w-5 text-international-orange" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">
                                {listing.title}
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm text-muted-foreground">
                                    {listing.category} &middot; {listing.subcategory}
                                </span>
                                {listing.verification_tier === 'claimed' && (
                                    <Badge variant="success" className="text-xs">
                                        <ShieldCheck className="h-3 w-3 mr-1" />
                                        Claimed
                                    </Badge>
                                )}
                                {listing.verification_tier === 'self_verified' && (
                                    <Badge variant="success" className="text-xs">
                                        <ShieldCheck className="h-3 w-3 mr-1" />
                                        Self-Verified
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <Button onClick={handleSave} disabled={isPending}>
                    {isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : saved ? (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    {isPending ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
                </Button>
            </div>

            {/* Company Description */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Company Description</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="description">
                            Tell potential clients about your company
                        </Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe your company, services, and what makes you stand out..."
                            className="min-h-[120px]"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="contact_name">
                                <User className="h-3.5 w-3.5 inline mr-1.5" />
                                Contact Name
                            </Label>
                            <Input
                                id="contact_name"
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                                placeholder="Jane Smith"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contact_title">
                                <Briefcase className="h-3.5 w-3.5 inline mr-1.5" />
                                Job Title
                            </Label>
                            <Input
                                id="contact_title"
                                value={contactTitle}
                                onChange={(e) => setContactTitle(e.target.value)}
                                placeholder="Head of Operations"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contact_email">
                                <Mail className="h-3.5 w-3.5 inline mr-1.5" />
                                Email
                            </Label>
                            <Input
                                id="contact_email"
                                type="email"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                placeholder="jane@company.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contact_phone">
                                <Phone className="h-3.5 w-3.5 inline mr-1.5" />
                                Phone
                            </Label>
                            <Input
                                id="contact_phone"
                                type="tel"
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                                placeholder="+44 20 1234 5678"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact_linkedin">
                            <Linkedin className="h-3.5 w-3.5 inline mr-1.5" />
                            LinkedIn Profile
                        </Label>
                        <Input
                            id="contact_linkedin"
                            value={contactLinkedin}
                            onChange={(e) => setContactLinkedin(e.target.value)}
                            placeholder="https://linkedin.com/in/janesmith"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Company Details */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Company Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="location">
                                <MapPin className="h-3.5 w-3.5 inline mr-1.5" />
                                Location
                            </Label>
                            <Input
                                id="location"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="London, UK"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="employees">
                                <Users className="h-3.5 w-3.5 inline mr-1.5" />
                                Employees
                            </Label>
                            <Input
                                id="employees"
                                value={employees}
                                onChange={(e) => setEmployees(e.target.value)}
                                placeholder="50-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="established">
                                <Calendar className="h-3.5 w-3.5 inline mr-1.5" />
                                Established
                            </Label>
                            <Input
                                id="established"
                                type="number"
                                value={established}
                                onChange={(e) => setEstablished(e.target.value)}
                                placeholder="2015"
                                min={1800}
                                max={new Date().getFullYear()}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="capabilities">Capabilities</Label>
                        <Input
                            id="capabilities"
                            value={capabilities}
                            onChange={(e) => setCapabilities(e.target.value)}
                            placeholder="CNC Machining, Injection Moulding, Sheet Metal"
                        />
                        <p className="text-xs text-muted-foreground">
                            Separate with commas
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="certifications">Certifications</Label>
                        <Input
                            id="certifications"
                            value={certifications}
                            onChange={(e) => setCertifications(e.target.value)}
                            placeholder="ISO 9001, AS9100, IATF 16949"
                        />
                        <p className="text-xs text-muted-foreground">
                            Separate with commas
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="industries">Industries Served</Label>
                        <Input
                            id="industries"
                            value={industries}
                            onChange={(e) => setIndustries(e.target.value)}
                            placeholder="Aerospace, Automotive, Medical Devices"
                        />
                        <p className="text-xs text-muted-foreground">
                            Separate with commas
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Bottom save button */}
            <div className="flex justify-end pb-8">
                <Button onClick={handleSave} disabled={isPending} size="lg">
                    {isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : saved ? (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    {isPending ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
                </Button>
            </div>
        </div>
    )
}
