"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, ArrowRight, CreditCard, AlertCircle } from "lucide-react"
import { completeMigrationSignup } from "@/actions/migration"
import { createProviderFromSignup, initiateStripeOnboarding } from "@/actions/provider"

interface ProviderSignupFormProps {
    listingId?: string
    listing?: {
        id: string
        title: string
        category: string
        subcategory: string
        description: string | null
        attributes: Record<string, unknown> | null
    } | null
    migrationRecord?: {
        id: string
        status: string
    } | null
}

type FormStep = 'profile' | 'stripe' | 'complete'

export function ProviderSignupForm({ listingId, listing, migrationRecord }: ProviderSignupFormProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [step, setStep] = useState<FormStep>('profile')
    const [error, setError] = useState<string | null>(null)
    
    // Form state
    const [formData, setFormData] = useState({
        displayName: listing?.title || '',
        businessType: 'individual' as 'individual' | 'company',
        headline: '',
        bio: listing?.description || '',
        dayRate: '',
        currency: 'GBP'
    })
    
    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        
        startTransition(async () => {
            try {
                // Create the provider profile
                const result = await createProviderFromSignup({
                    displayName: formData.displayName,
                    businessType: formData.businessType,
                    headline: formData.headline,
                    bio: formData.bio,
                    dayRate: formData.dayRate ? parseFloat(formData.dayRate) : undefined,
                    currency: formData.currency,
                    listingId: listingId
                })
                
                if (!result.success) {
                    setError(result.error || 'Failed to create provider profile')
                    return
                }
                
                // If this is a migration, update the migration record
                if (listingId && migrationRecord) {
                    await completeMigrationSignup(listingId)
                }
                
                // Move to Stripe step
                setStep('stripe')
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred')
            }
        })
    }
    
    const handleStripeConnect = async () => {
        setError(null)
        
        startTransition(async () => {
            try {
                const result = await initiateStripeOnboarding()
                
                if (!result.success || !result.onboardingUrl) {
                    setError(result.error || 'Failed to initiate Stripe onboarding')
                    return
                }
                
                // Redirect to Stripe
                window.location.href = result.onboardingUrl
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred')
            }
        })
    }
    
    const handleSkipStripe = () => {
        // Allow skipping Stripe for now, they can set it up later
        router.push('/provider-portal')
    }
    
    if (step === 'stripe') {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-100">
                            <CreditCard className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                            <CardTitle>Connect Payment Account</CardTitle>
                            <CardDescription>
                                Set up Stripe to receive payments for your services
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    
                    <div className="bg-muted rounded-lg p-4 space-y-3">
                        <h4 className="font-medium">Why connect Stripe?</h4>
                        <ul className="text-sm text-muted-foreground space-y-2">
                            <li className="flex items-start gap-2">
                                <span className="text-green-600">✓</span>
                                Receive secure payments directly to your bank account
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-600">✓</span>
                                Automatic invoicing and tax documentation
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-600">✓</span>
                                Fast payouts (typically 2-7 business days)
                            </li>
                        </ul>
                    </div>
                    
                    <div className="flex gap-3">
                        <Button 
                            onClick={handleStripeConnect}
                            disabled={isPending}
                            className="flex-1"
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Setting up...
                                </>
                            ) : (
                                <>
                                    Connect Stripe
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                        <Button 
                            variant="secondary" 
                            onClick={handleSkipStripe}
                            disabled={isPending}
                        >
                            Skip for now
                        </Button>
                    </div>
                    
                    <p className="text-xs text-muted-foreground text-center">
                        You can connect Stripe later from your provider dashboard.
                        Without Stripe, you won&apos;t be able to accept paid bookings.
                    </p>
                </CardContent>
            </Card>
        )
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Provider Information</CardTitle>
                <CardDescription>
                    Tell us about your business
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleProfileSubmit} className="space-y-6">
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="displayName">Business / Display Name *</Label>
                            <Input
                                id="displayName"
                                value={formData.displayName}
                                onChange={(e) => setFormData(prev => ({ 
                                    ...prev, 
                                    displayName: e.target.value 
                                }))}
                                placeholder="Your business name"
                                required
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="businessType">Business Type *</Label>
                            <Select
                                value={formData.businessType}
                                onValueChange={(value: 'individual' | 'company') => 
                                    setFormData(prev => ({ ...prev, businessType: value }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="individual">Individual / Freelancer</SelectItem>
                                    <SelectItem value="company">Company / Business</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="headline">Headline</Label>
                        <Input
                            id="headline"
                            value={formData.headline}
                            onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                headline: e.target.value 
                            }))}
                            placeholder="e.g., Expert Patent Attorney with 15 Years Experience"
                            maxLength={120}
                        />
                        <p className="text-xs text-muted-foreground">
                            A short tagline that appears in search results
                        </p>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="bio">Bio / Description</Label>
                        <Textarea
                            id="bio"
                            value={formData.bio}
                            onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                bio: e.target.value 
                            }))}
                            placeholder="Tell potential clients about your services, experience, and expertise..."
                            rows={4}
                        />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="dayRate">Day Rate (Optional)</Label>
                            <Input
                                id="dayRate"
                                type="number"
                                value={formData.dayRate}
                                onChange={(e) => setFormData(prev => ({ 
                                    ...prev, 
                                    dayRate: e.target.value 
                                }))}
                                placeholder="e.g., 500"
                                min="0"
                                step="1"
                            />
                            <p className="text-xs text-muted-foreground">
                                Your standard day rate for reference
                            </p>
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="currency">Currency</Label>
                            <Select
                                value={formData.currency}
                                onValueChange={(value) => 
                                    setFormData(prev => ({ ...prev, currency: value }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="GBP">GBP (£)</SelectItem>
                                    <SelectItem value="USD">USD ($)</SelectItem>
                                    <SelectItem value="EUR">EUR (€)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    
                    <div className="pt-4">
                        <Button 
                            type="submit" 
                            className="w-full"
                            disabled={isPending || !formData.displayName}
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating Profile...
                                </>
                            ) : (
                                <>
                                    Continue to Payment Setup
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
