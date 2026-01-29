"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createPaymentIntent } from "@/lib/stripe/escrow"
import { 
    BookingRequest, 
    PriceBreakdown, 
    BookingConfirmation,
    PriceBreakdownItem 
} from "@/types/booking"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

// ==========================================
// CONSTANTS
// ==========================================

const PLATFORM_FEE_PERCENT = 10 // 10% platform fee
const VAT_RATE = 0.20 // 20% VAT (UK standard rate)
const DEFAULT_MINIMUM_DAYS = 1

// ==========================================
// CHECK AVAILABILITY FOR BOOKING
// ==========================================

export async function checkAvailabilityForBooking(
    providerId: string,
    dates: string[] // Array of date strings (YYYY-MM-DD)
): Promise<{
    available: boolean
    unavailableDates: string[]
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get booked or blocked slots for the date range
        const { data: slots, error } = await supabase
            .from('availability_slots')
            .select('date, status')
            .eq('provider_id', providerId)
            .in('date', dates)
            .in('status', ['booked', 'blocked'])

        if (error) {
            console.error('Error checking availability:', error)
            return { available: false, unavailableDates: [], error: error.message }
        }

        const unavailableDates = slots?.map(s => s.date) || []
        
        return {
            available: unavailableDates.length === 0,
            unavailableDates,
            error: null
        }
    } catch (err) {
        console.error('Failed to check availability:', err)
        return { available: false, unavailableDates: [], error: 'Failed to check availability' }
    }
}

// ==========================================
// CALCULATE BOOKING PRICE
// ==========================================

export async function calculateBookingPrice(
    providerId: string,
    dates: string[], // Array of date strings (YYYY-MM-DD)
    currency?: string
): Promise<{
    data: PriceBreakdown | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get provider profile
        const { data: profile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('day_rate, currency')
            .eq('id', providerId)
            .single()

        if (profileError || !profile) {
            return { data: null, error: 'Provider not found' }
        }

        if (!profile.day_rate) {
            return { data: null, error: 'Provider has not set their day rate' }
        }

        const numberOfDays = dates.length
        const dayRate = profile.day_rate
        const subtotal = dayRate * numberOfDays

        // Calculate fees
        const platformFee = subtotal * (PLATFORM_FEE_PERCENT / 100)
        const subtotalWithFee = subtotal + platformFee
        const vatAmount = subtotalWithFee * VAT_RATE
        const total = subtotalWithFee + vatAmount

        // Build price breakdown
        const items: PriceBreakdownItem[] = [
            {
                label: `${numberOfDays} day${numberOfDays > 1 ? 's' : ''} @ ${profile.currency} ${dayRate}/day`,
                amount: subtotal,
                type: 'subtotal'
            },
            {
                label: `Platform fee (${PLATFORM_FEE_PERCENT}%)`,
                amount: platformFee,
                type: 'fee',
                description: 'Includes escrow protection'
            },
            {
                label: `VAT (${VAT_RATE * 100}%)`,
                amount: vatAmount,
                type: 'tax'
            },
            {
                label: 'Total',
                amount: total,
                type: 'total'
            }
        ]

        const priceBreakdown: PriceBreakdown = {
            items,
            subtotal,
            platformFee,
            platformFeePercent: PLATFORM_FEE_PERCENT,
            vatAmount,
            vatRate: VAT_RATE,
            discountAmount: 0,
            discountPercent: 0,
            total,
            currency: currency || profile.currency || 'GBP',
            dayRate,
            numberOfDays
        }

        return { data: priceBreakdown, error: null }
    } catch (err) {
        console.error('Failed to calculate booking price:', err)
        return { data: null, error: 'Failed to calculate price' }
    }
}

// ==========================================
// CREATE BOOKING
// ==========================================

export async function createBooking(
    params: BookingRequest
): Promise<{
    data: {
        orderId: string
        orderNumber: string
        paymentIntentClientSecret: string
    } | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        // Verify the provider exists
        const { data: provider, error: providerError } = await supabase
            .from('provider_profiles')
            .select('id, user_id, stripe_account_id, day_rate, currency')
            .eq('id', params.providerId)
            .single()

        if (providerError || !provider) {
            return { data: null, error: 'Provider not found' }
        }

        // Calculate the price
        let totalAmount: number
        let platformFee: number
        let vatAmount: number

        if (params.bookingType === 'people_booking' && params.startDate && params.endDate) {
            // Generate dates array
            const dates: string[] = []
            const start = new Date(params.startDate)
            const end = new Date(params.endDate)
            
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(d.toISOString().split('T')[0])
            }

            // Check availability
            const { available, unavailableDates } = await checkAvailabilityForBooking(
                params.providerId, 
                dates
            )

            if (!available) {
                return { 
                    data: null, 
                    error: `Provider not available on: ${unavailableDates.join(', ')}` 
                }
            }

            // Calculate price
            const { data: priceData, error: priceError } = await calculateBookingPrice(
                params.providerId,
                dates,
                params.currency
            )

            if (priceError || !priceData) {
                return { data: null, error: priceError || 'Failed to calculate price' }
            }

            totalAmount = priceData.total
            platformFee = priceData.platformFee
            vatAmount = priceData.vatAmount
        } else {
            // For products/services, we'd need different pricing logic
            // For now, return an error for unsupported types
            return { data: null, error: 'Only people bookings are currently supported' }
        }

        // Create Stripe payment intent
        // Convert to smallest currency unit (pence/cents)
        const amountInSmallestUnit = Math.round(totalAmount * 100)
        
        const { paymentIntent, error: paymentError } = await createPaymentIntent({
            amount: amountInSmallestUnit,
            currency: params.currency || provider.currency || 'gbp',
            orderId: 'pending', // We'll update this after creating the order
            buyerId: user.id,
            description: `Booking with ${provider.user_id}`
        })

        if (paymentError || !paymentIntent) {
            console.error('Payment intent error:', paymentError)
            return { data: null, error: paymentError || 'Failed to create payment intent' }
        }

        // Create the order
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                buyer_id: user.id,
                seller_id: params.providerId,
                listing_id: params.listingId || null,
                order_type: params.bookingType,
                status: 'pending',
                total_amount: totalAmount,
                platform_fee: platformFee,
                vat_amount: vatAmount,
                vat_rate: VAT_RATE,
                currency: params.currency || provider.currency || 'GBP',
                stripe_payment_intent_id: paymentIntent.id,
                escrow_status: 'pending',
                objective_id: params.objectiveId || null,
                business_function_id: params.businessFunctionId || null
            })
            .select('id, order_number')
            .single()

        if (orderError || !order) {
            console.error('Order creation error:', orderError)
            return { data: null, error: 'Failed to create order' }
        }

        // If this is a people booking, mark the dates as booked
        if (params.bookingType === 'people_booking' && params.startDate && params.endDate) {
            const dates: string[] = []
            const start = new Date(params.startDate)
            const end = new Date(params.endDate)
            
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(d.toISOString().split('T')[0])
            }

            // Upsert availability slots as booked
            const slotsToUpsert = dates.map(date => ({
                provider_id: params.providerId,
                date,
                status: 'booked' as const,
                booking_id: order.id,
                source: 'booking' as const
            }))

            await supabase
                .from('availability_slots')
                .upsert(slotsToUpsert, { onConflict: 'provider_id,date' })
        }

        // Create a conversation for the booking
        const { data: providerProfile } = await supabase
            .from('provider_profiles')
            .select('user_id')
            .eq('id', params.providerId)
            .single()

        if (providerProfile) {
            await supabase
                .from('conversations')
                .insert({
                    order_id: order.id,
                    listing_id: params.listingId || null,
                    buyer_id: user.id,
                    seller_id: providerProfile.user_id,
                    status: 'active'
                })
        }

        revalidatePath('/my-orders')
        revalidatePath('/marketplace')

        return {
            data: {
                orderId: order.id,
                orderNumber: order.order_number || `ORD-${order.id.slice(0, 8)}`,
                paymentIntentClientSecret: paymentIntent.clientSecret
            },
            error: null
        }
    } catch (err) {
        console.error('Failed to create booking:', err)
        return { data: null, error: 'Failed to create booking' }
    }
}

// ==========================================
// CONFIRM BOOKING PAYMENT
// ==========================================

export async function confirmBookingPayment(
    bookingId: string,
    paymentIntentId: string
): Promise<{
    data: BookingConfirmation | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        // Verify the order belongs to the user
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
                id,
                order_number,
                buyer_id,
                seller_id,
                listing_id,
                status,
                total_amount,
                currency,
                stripe_payment_intent_id,
                created_at
            `)
            .eq('id', bookingId)
            .eq('buyer_id', user.id)
            .single()

        if (orderError || !order) {
            return { data: null, error: 'Order not found' }
        }

        // Verify the payment intent matches
        if (order.stripe_payment_intent_id !== paymentIntentId) {
            return { data: null, error: 'Payment intent mismatch' }
        }

        // Update order status and escrow status
        const { error: updateError } = await supabase
            .from('orders')
            .update({
                status: 'accepted',
                escrow_status: 'held'
            })
            .eq('id', bookingId)

        if (updateError) {
            console.error('Failed to update order:', updateError)
            return { data: null, error: 'Failed to confirm payment' }
        }

        // Record escrow transaction
        await supabase
            .from('escrow_transactions')
            .insert({
                order_id: bookingId,
                type: 'deposit',
                amount: order.total_amount
            })

        // Get provider info
        const { data: provider } = await supabase
            .from('provider_profiles')
            .select(`
                id,
                user_id,
                profiles!provider_profiles_user_id_fkey (
                    full_name,
                    avatar_url
                )
            `)
            .eq('id', order.seller_id)
            .single()

        // Get listing info
        const { data: listing } = await supabase
            .from('marketplace_listings')
            .select('title')
            .eq('id', order.listing_id)
            .single()

        // Get conversation
        const { data: conversation } = await supabase
            .from('conversations')
            .select('id')
            .eq('order_id', bookingId)
            .single()

        // Get booked dates
        const { data: slots } = await supabase
            .from('availability_slots')
            .select('date')
            .eq('booking_id', bookingId)
            .order('date', { ascending: true })

        const startDate = slots && slots.length > 0 ? slots[0].date : undefined
        const endDate = slots && slots.length > 0 ? slots[slots.length - 1].date : undefined

        const confirmation: BookingConfirmation = {
            orderId: order.id,
            orderNumber: order.order_number,
            status: 'confirmed',
            providerId: order.seller_id,
            providerName: (provider?.profiles as { full_name?: string })?.full_name || 'Provider',
            providerAvatarUrl: (provider?.profiles as { avatar_url?: string })?.avatar_url,
            listingTitle: listing?.title || 'Booking',
            startDate,
            endDate,
            createdAt: order.created_at,
            totalAmount: order.total_amount,
            currency: order.currency,
            paymentIntentId,
            conversationId: conversation?.id,
            nextSteps: [
                'Your payment has been securely held in escrow',
                'The provider has been notified of your booking',
                'You can message the provider to discuss details',
                'Payment will be released upon successful completion'
            ]
        }

        revalidatePath('/my-orders')

        return { data: confirmation, error: null }
    } catch (err) {
        console.error('Failed to confirm booking payment:', err)
        return { data: null, error: 'Failed to confirm payment' }
    }
}

// ==========================================
// GET LISTING FOR BOOKING
// ==========================================

export async function getListingForBooking(listingId: string): Promise<{
    data: {
        listing: {
            id: string
            title: string
            description: string | null
            category: 'People' | 'Products' | 'Services' | 'AI'
            subcategory: string
            attributes: Record<string, unknown>
        }
        provider: {
            id: string
            userId: string
            name: string
            avatarUrl?: string
            dayRate?: number
            currency: string
            minimumDays: number
            isActive: boolean
        } | null
    } | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        
        // Get listing
        const { data: listing, error: listingError } = await supabase
            .from('marketplace_listings')
            .select('*')
            .eq('id', listingId)
            .single()

        if (listingError || !listing) {
            return { data: null, error: 'Listing not found' }
        }

        // Try to get associated provider profile
        const { data: provider } = await supabase
            .from('provider_profiles')
            .select(`
                id,
                user_id,
                day_rate,
                currency,
                is_active,
                profiles!provider_profiles_user_id_fkey (
                    full_name,
                    avatar_url
                )
            `)
            .eq('listing_id', listingId)
            .single()

        return {
            data: {
                listing: {
                    id: listing.id,
                    title: listing.title,
                    description: listing.description,
                    category: listing.category,
                    subcategory: listing.subcategory,
                    attributes: (listing.attributes as Record<string, unknown>) || {}
                },
                provider: provider ? {
                    id: provider.id,
                    userId: provider.user_id,
                    name: (provider.profiles as { full_name?: string })?.full_name || 'Provider',
                    avatarUrl: (provider.profiles as { avatar_url?: string })?.avatar_url,
                    dayRate: provider.day_rate ?? undefined,
                    currency: provider.currency || 'GBP',
                    minimumDays: DEFAULT_MINIMUM_DAYS,
                    isActive: provider.is_active
                } : null
            },
            error: null
        }
    } catch (err) {
        console.error('Failed to get listing for booking:', err)
        return { data: null, error: 'Failed to load listing' }
    }
}
