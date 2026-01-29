'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format, addMonths } from 'date-fns'
import {
    Calendar,
    CreditCard,
    CheckCircle,
    ArrowLeft,
    ArrowRight,
    Loader2,
    AlertCircle,
    User,
    FileText,
    Clock,
    Repeat,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { DateSelector } from './DateSelector'
import { PriceBreakdown } from './PriceBreakdown'
import { BookingConfirmation } from './BookingConfirmation'
import { cn } from '@/lib/utils'
import { 
    getAvailability, 
    type AvailabilitySlot 
} from '@/actions/availability'
import { 
    calculateBookingPrice, 
    createBooking, 
    confirmBookingPayment 
} from '@/actions/booking'
import type { 
    BookingWizardStep, 
    DateSelection, 
    PriceBreakdown as PriceBreakdownType,
    BookingConfirmation as BookingConfirmationType 
} from '@/types/booking'

// ==========================================
// ENGAGEMENT TYPES
// ==========================================

type EngagementType = 'one_time' | 'retainer'

// ==========================================
// EXTENDED WIZARD STEPS
// ==========================================

type ExtendedBookingWizardStep = 'engagement_type' | BookingWizardStep

// ==========================================
// WIZARD STEP CONFIGURATION
// ==========================================

const ONE_TIME_STEPS: { id: ExtendedBookingWizardStep; label: string; icon: typeof Calendar }[] = [
    { id: 'engagement_type', label: 'Type', icon: Clock },
    { id: 'dates', label: 'Select Dates', icon: Calendar },
    { id: 'review', label: 'Review', icon: FileText },
    { id: 'payment', label: 'Payment', icon: CreditCard },
    { id: 'confirmation', label: 'Confirmation', icon: CheckCircle }
]

const WIZARD_STEPS: { id: BookingWizardStep; label: string; icon: typeof Calendar }[] = [
    { id: 'dates', label: 'Select Dates', icon: Calendar },
    { id: 'review', label: 'Review', icon: FileText },
    { id: 'payment', label: 'Payment', icon: CreditCard },
    { id: 'confirmation', label: 'Confirmation', icon: CheckCircle }
]

// ==========================================
// PROPS
// ==========================================

interface BookingWizardProps {
    listing: {
        id: string
        title: string
        category: 'People' | 'Products' | 'Services' | 'AI'
        subcategory: string
        description?: string | null
    }
    provider: {
        id: string
        userId: string
        name: string
        avatarUrl?: string
        dayRate?: number
        currency: string
        minimumDays?: number
    }
    onCancel?: () => void
}

// ==========================================
// WIZARD COMPONENT
// ==========================================

export function BookingWizard({ listing, provider, onCancel }: BookingWizardProps) {
    const router = useRouter()
    
    // Engagement type state
    const [engagementType, setEngagementType] = useState<EngagementType | null>(null)
    const [showEngagementChoice, setShowEngagementChoice] = useState(listing.category === 'People')

    // State
    const [currentStep, setCurrentStep] = useState<ExtendedBookingWizardStep>(
        listing.category === 'People' ? 'engagement_type' : 'dates'
    )
    const [selectedDates, setSelectedDates] = useState<DateSelection>({
        startDate: null,
        endDate: null,
        selectedDates: [],
        numberOfDays: 0,
        isValid: false
    })
    const [message, setMessage] = useState('')
    const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([])
    const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdownType | null>(null)
    const [confirmation, setConfirmation] = useState<BookingConfirmationType | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(true)
    const [isLoadingPrice, setIsLoadingPrice] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    // Payment state (simplified for now - would integrate with Stripe Elements)
    const [paymentIntentSecret, setPaymentIntentSecret] = useState<string | null>(null)
    const [orderId, setOrderId] = useState<string | null>(null)
    const [orderNumber, setOrderNumber] = useState<string | null>(null)
    const [isProcessingPayment, setIsProcessingPayment] = useState(false)

    // Get step index for progress - account for engagement type step
    const activeSteps = showEngagementChoice ? ONE_TIME_STEPS : WIZARD_STEPS
    const currentStepIndex = activeSteps.findIndex(s => s.id === currentStep)
    const progressPercent = ((currentStepIndex + 1) / activeSteps.length) * 100

    // Load availability on mount
    useEffect(() => {
        async function loadAvailability() {
            setIsLoadingAvailability(true)
            try {
                const startDate = format(new Date(), 'yyyy-MM-dd')
                const endDate = format(addMonths(new Date(), 3), 'yyyy-MM-dd')
                
                const { data, error } = await getAvailability(provider.id, startDate, endDate)
                
                if (error) {
                    console.error('Failed to load availability:', error)
                }
                
                setAvailabilitySlots(data)
            } catch (err) {
                console.error('Error loading availability:', err)
            } finally {
                setIsLoadingAvailability(false)
            }
        }
        
        loadAvailability()
    }, [provider.id])

    // Calculate price when dates change
    useEffect(() => {
        async function calculatePrice() {
            if (!selectedDates.isValid || selectedDates.selectedDates.length === 0) {
                setPriceBreakdown(null)
                return
            }

            setIsLoadingPrice(true)
            try {
                const dateStrings = selectedDates.selectedDates.map(d => format(d, 'yyyy-MM-dd'))
                const { data, error } = await calculateBookingPrice(
                    provider.id,
                    dateStrings,
                    provider.currency
                )

                if (error) {
                    setError(error)
                } else {
                    setPriceBreakdown(data)
                    setError(null)
                }
            } catch (err) {
                console.error('Error calculating price:', err)
                setError('Failed to calculate price')
            } finally {
                setIsLoadingPrice(false)
            }
        }

        calculatePrice()
    }, [selectedDates, provider.id, provider.currency])

    // Handle dates change
    const handleDatesChange = useCallback((dates: DateSelection) => {
        setSelectedDates(dates)
    }, [])

    // Navigation
    const canGoNext = (): boolean => {
        switch (currentStep) {
            case 'engagement_type':
                return engagementType !== null
            case 'dates':
                return selectedDates.isValid && priceBreakdown !== null
            case 'review':
                return true
            case 'payment':
                return false // Payment step handles its own navigation
            default:
                return false
        }
    }

    const goNext = async () => {
        setError(null)
        
        switch (currentStep) {
            case 'engagement_type':
                if (engagementType === 'retainer') {
                    // Navigate to retainer setup page
                    router.push(`/retainers/new?providerId=${provider.id}&listingId=${listing.id}`)
                    return
                }
                setCurrentStep('dates')
                break
            case 'dates':
                setCurrentStep('review')
                break
            case 'review':
                // Create booking and get payment intent
                setIsLoading(true)
                try {
                    if (!selectedDates.startDate || !selectedDates.endDate) {
                        throw new Error('Please select dates')
                    }

                    const { data, error } = await createBooking({
                        listingId: listing.id,
                        providerId: provider.id,
                        bookingType: 'people_booking',
                        startDate: format(selectedDates.startDate, 'yyyy-MM-dd'),
                        endDate: format(selectedDates.endDate, 'yyyy-MM-dd'),
                        currency: provider.currency,
                        message: message || undefined
                    })

                    if (error || !data) {
                        throw new Error(error || 'Failed to create booking')
                    }

                    setOrderId(data.orderId)
                    setOrderNumber(data.orderNumber)
                    setPaymentIntentSecret(data.paymentIntentClientSecret)
                    setCurrentStep('payment')
                } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to create booking')
                } finally {
                    setIsLoading(false)
                }
                break
            default:
                break
        }
    }

    const goBack = () => {
        switch (currentStep) {
            case 'dates':
                if (showEngagementChoice) {
                    setCurrentStep('engagement_type')
                }
                break
            case 'review':
                setCurrentStep('dates')
                break
            case 'payment':
                setCurrentStep('review')
                break
            default:
                break
        }
    }

    // Handle payment completion (simplified - would use Stripe)
    const handlePaymentComplete = async () => {
        if (!orderId || !paymentIntentSecret) return

        setIsProcessingPayment(true)
        setError(null)

        try {
            // In a real implementation, this would be called after Stripe confirms payment
            // For now, we'll simulate the payment intent ID
            const paymentIntentId = paymentIntentSecret.split('_secret_')[0]
            
            const { data, error } = await confirmBookingPayment(orderId, paymentIntentId)

            if (error || !data) {
                throw new Error(error || 'Failed to confirm payment')
            }

            setConfirmation(data)
            setCurrentStep('confirmation')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Payment failed')
        } finally {
            setIsProcessingPayment(false)
        }
    }

    // ==========================================
    // RENDER STEPS
    // ==========================================

    const renderStepContent = () => {
        switch (currentStep) {
            case 'engagement_type':
                return (
                    <div className="space-y-6">
                        {/* Provider Info */}
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-16 w-16">
                                        <AvatarImage src={provider.avatarUrl} alt={provider.name} />
                                        <AvatarFallback>
                                            <User className="h-8 w-8" />
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold">{provider.name}</h3>
                                        <p className="text-muted-foreground">{listing.title}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="secondary">{listing.category}</Badge>
                                            <Badge variant="outline">{listing.subcategory}</Badge>
                                        </div>
                                    </div>
                                    {provider.dayRate && (
                                        <div className="text-right">
                                            <div className="text-2xl font-bold">
                                                {provider.currency} {provider.dayRate.toLocaleString()}
                                            </div>
                                            <p className="text-sm text-muted-foreground">per day</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Engagement Type Selection */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Clock className="h-5 w-5" />
                                    Choose Engagement Type
                                </CardTitle>
                                <CardDescription>
                                    Select how you&apos;d like to work with {provider.name}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <RadioGroup
                                    value={engagementType || ''}
                                    onValueChange={(v) => setEngagementType(v as EngagementType)}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                                >
                                    {/* One-Time Booking */}
                                    <Label
                                        className={cn(
                                            'flex flex-col p-6 rounded-lg border-2 cursor-pointer transition-all',
                                            engagementType === 'one_time'
                                                ? 'border-primary bg-primary/5'
                                                : 'border-muted hover:border-primary/50'
                                        )}
                                    >
                                        <RadioGroupItem value="one_time" className="sr-only" />
                                        <div className="flex items-center gap-3 mb-3">
                                            <Calendar className="h-6 w-6 text-primary" />
                                            <span className="font-semibold">One-Time Booking</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Book specific dates for a project or task. Pay upfront for the entire engagement.
                                        </p>
                                        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                                Flexible date selection
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                                Escrow payment protection
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                                Clear deliverable scope
                                            </li>
                                        </ul>
                                    </Label>

                                    {/* Retainer Agreement */}
                                    <Label
                                        className={cn(
                                            'flex flex-col p-6 rounded-lg border-2 cursor-pointer transition-all',
                                            engagementType === 'retainer'
                                                ? 'border-primary bg-primary/5'
                                                : 'border-muted hover:border-primary/50'
                                        )}
                                    >
                                        <RadioGroupItem value="retainer" className="sr-only" />
                                        <div className="flex items-center gap-3 mb-3">
                                            <Repeat className="h-6 w-6 text-primary" />
                                            <span className="font-semibold">Retainer Agreement</span>
                                            <Badge variant="secondary" className="ml-auto">Save up to 10%</Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Ongoing weekly hours commitment with discounted rates. Pay weekly based on hours worked.
                                        </p>
                                        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                                10, 20, or 40 hrs/week options
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                                Weekly billing in arrears
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                                Flexible pause/cancel
                                            </li>
                                        </ul>
                                    </Label>
                                </RadioGroup>
                            </CardContent>
                        </Card>

                        {/* Info Alert */}
                        {engagementType === 'retainer' && (
                            <Alert>
                                <Repeat className="h-4 w-4" />
                                <AlertTitle>Retainer Benefits</AlertTitle>
                                <AlertDescription>
                                    Retainers offer discounted rates (up to 10% for 40 hrs/week), 
                                    priority access to the provider, and flexible weekly billing.
                                    You can pause or cancel with 2 weeks notice.
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                )

            case 'dates':
                return (
                    <div className="space-y-6">
                        {/* Provider Info */}
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-16 w-16">
                                        <AvatarImage src={provider.avatarUrl} alt={provider.name} />
                                        <AvatarFallback>
                                            <User className="h-8 w-8" />
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold">{provider.name}</h3>
                                        <p className="text-muted-foreground">{listing.title}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="secondary">{listing.category}</Badge>
                                            <Badge variant="outline">{listing.subcategory}</Badge>
                                        </div>
                                    </div>
                                    {provider.dayRate && (
                                        <div className="text-right">
                                            <div className="text-2xl font-bold">
                                                {provider.currency} {provider.dayRate.toLocaleString()}
                                            </div>
                                            <p className="text-sm text-muted-foreground">per day</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Date Selector */}
                        {isLoadingAvailability ? (
                            <Card>
                                <CardContent className="py-12">
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                        <span className="text-muted-foreground">Loading availability...</span>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <DateSelector
                                providerId={provider.id}
                                availabilitySlots={availabilitySlots}
                                minimumDays={provider.minimumDays || 1}
                                dayRate={provider.dayRate}
                                currency={provider.currency}
                                selectedDates={selectedDates}
                                onDatesChange={handleDatesChange}
                            />
                        )}

                        {/* Price Preview */}
                        <PriceBreakdown
                            breakdown={priceBreakdown}
                            isLoading={isLoadingPrice}
                            showEscrowInfo={true}
                        />
                    </div>
                )

            case 'review':
                return (
                    <div className="space-y-6">
                        {/* Booking Summary */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Booking Summary</CardTitle>
                                <CardDescription>
                                    Review your booking details before proceeding to payment
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Provider */}
                                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={provider.avatarUrl} alt={provider.name} />
                                        <AvatarFallback>
                                            <User className="h-6 w-6" />
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <h4 className="font-semibold">{provider.name}</h4>
                                        <p className="text-sm text-muted-foreground">{listing.title}</p>
                                    </div>
                                </div>

                                {/* Dates */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Start Date</p>
                                        <p className="font-medium">
                                            {selectedDates.startDate 
                                                ? format(selectedDates.startDate, 'dd MMMM yyyy')
                                                : '-'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">End Date</p>
                                        <p className="font-medium">
                                            {selectedDates.endDate 
                                                ? format(selectedDates.endDate, 'dd MMMM yyyy')
                                                : '-'}
                                        </p>
                                    </div>
                                </div>

                                {/* Duration */}
                                <div>
                                    <p className="text-sm text-muted-foreground">Duration</p>
                                    <p className="font-medium">
                                        {selectedDates.numberOfDays} day{selectedDates.numberOfDays !== 1 ? 's' : ''}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Optional Message */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Message to Provider (Optional)</CardTitle>
                                <CardDescription>
                                    Add any notes or requirements for the provider
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Textarea
                                    placeholder="Describe your project, requirements, or any questions you have..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    rows={4}
                                />
                            </CardContent>
                        </Card>

                        {/* Price Breakdown */}
                        <PriceBreakdown
                            breakdown={priceBreakdown}
                            showEscrowInfo={true}
                        />

                        {/* Terms */}
                        <Card className="border-amber-200 bg-amber-50">
                            <CardContent className="pt-6">
                                <div className="flex gap-3">
                                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-amber-800">
                                        <p className="font-medium">Important</p>
                                        <p className="mt-1">
                                            By proceeding to payment, you agree to our terms of service. 
                                            Your payment will be held in escrow until the work is completed 
                                            and approved.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )

            case 'payment':
                return (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CreditCard className="h-5 w-5" />
                                    Payment
                                </CardTitle>
                                <CardDescription>
                                    Complete your booking by entering your payment details
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Order Summary */}
                                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Order Number</span>
                                        <span className="font-mono">{orderNumber}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Total Amount</span>
                                        <span className="font-semibold text-lg">
                                            {priceBreakdown?.currency} {priceBreakdown?.total.toLocaleString('en-GB', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2
                                            })}
                                        </span>
                                    </div>
                                </div>

                                {/* Stripe Elements would go here */}
                                <div className="border border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                                    <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                                    <p className="text-muted-foreground">
                                        Stripe payment form would be rendered here
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        For demo purposes, click &quot;Complete Payment&quot; to simulate payment
                                    </p>
                                </div>

                                {/* Complete Payment Button */}
                                <Button
                                    className="w-full"
                                    size="lg"
                                    onClick={handlePaymentComplete}
                                    disabled={isProcessingPayment}
                                >
                                    {isProcessingPayment ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            Complete Payment
                                            <ArrowRight className="h-4 w-4 ml-2" />
                                        </>
                                    )}
                                </Button>

                                {/* Security Note */}
                                <p className="text-xs text-center text-muted-foreground">
                                    Your payment is secured by Stripe. We never store your card details.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )

            case 'confirmation':
                return confirmation ? (
                    <BookingConfirmation
                        confirmation={confirmation}
                        onViewOrder={() => router.push(`/my-orders`)}
                        onMessageProvider={() => {
                            if (confirmation.conversationId) {
                                router.push(`/messages/${confirmation.conversationId}`)
                            }
                        }}
                        onBackToMarketplace={() => router.push('/marketplace')}
                    />
                ) : null

            default:
                return null
        }
    }

    // ==========================================
    // MAIN RENDER
    // ==========================================

    return (
        <div className="max-w-3xl mx-auto py-6 px-4">
            {/* Progress Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    {activeSteps.map((step, index) => {
                        const StepIcon = step.icon
                        const isActive = currentStep === step.id
                        const isCompleted = index < currentStepIndex
                        const isClickable = isCompleted && currentStep !== 'confirmation'

                        return (
                            <div
                                key={step.id}
                                className={cn(
                                    "flex items-center gap-2",
                                    isClickable && "cursor-pointer"
                                )}
                                onClick={() => isClickable && setCurrentStep(step.id as ExtendedBookingWizardStep)}
                                role={isClickable ? "button" : undefined}
                                tabIndex={isClickable ? 0 : undefined}
                                onKeyDown={(e) => {
                                    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                                        e.preventDefault()
                                        setCurrentStep(step.id as ExtendedBookingWizardStep)
                                    }
                                }}
                                aria-label={isClickable ? `Go back to ${step.label}` : undefined}
                            >
                                <div
                                    className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                                        isActive && "bg-primary text-primary-foreground",
                                        isCompleted && "bg-emerald-500 text-white",
                                        !isActive && !isCompleted && "bg-muted text-muted-foreground"
                                    )}
                                    aria-hidden="true"
                                >
                                    {isCompleted ? (
                                        <CheckCircle className="h-4 w-4" />
                                    ) : (
                                        <StepIcon className="h-4 w-4" />
                                    )}
                                </div>
                                <span
                                    className={cn(
                                        "text-sm font-medium hidden sm:inline",
                                        isActive && "text-foreground",
                                        !isActive && "text-muted-foreground"
                                    )}
                                >
                                    {step.label}
                                </span>
                                {index < activeSteps.length - 1 && (
                                    <div className="hidden sm:block w-8 h-px bg-border mx-2" />
                                )}
                            </div>
                        )
                    })}
                </div>
                <Progress value={progressPercent} className="h-2" aria-label={`Step ${currentStepIndex + 1} of ${activeSteps.length}`} />
                {/* Mobile: Show current step label */}
                <div className="sm:hidden mt-3 text-center">
                    <span className="text-sm font-medium text-foreground">
                        Step {currentStepIndex + 1}: {activeSteps[currentStepIndex]?.label}
                    </span>
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Step Content */}
            {renderStepContent()}

            {/* Navigation */}
            {currentStep !== 'confirmation' && currentStep !== 'payment' && (
                <div className="flex items-center justify-between mt-8 pt-6 border-t">
                    <Button
                        variant="outline"
                        onClick={(currentStep === 'dates' && !showEngagementChoice) || currentStep === 'engagement_type' ? onCancel : goBack}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        {(currentStep === 'dates' && !showEngagementChoice) || currentStep === 'engagement_type' ? 'Cancel' : 'Back'}
                    </Button>
                    <Button
                        onClick={goNext}
                        disabled={!canGoNext() || isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Processing...
                            </>
                        ) : engagementType === 'retainer' && currentStep === 'engagement_type' ? (
                            <>
                                Set Up Retainer
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </>
                        ) : (
                            <>
                                {currentStep === 'review' ? 'Proceed to Payment' : 'Continue'}
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            )}
        </div>
    )
}

export default BookingWizard
