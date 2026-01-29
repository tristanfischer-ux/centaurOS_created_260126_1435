// ==========================================
// BOOKING TYPES
// ==========================================

export type BookingType = 'people_booking' | 'product_rfq' | 'service'
export type BookingStatus = 'draft' | 'pending_payment' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'disputed'
export type PaymentStatus = 'pending' | 'held' | 'partial_release' | 'released' | 'refunded'

// ==========================================
// BOOKING REQUEST
// ==========================================

export interface BookingRequest {
    listingId: string
    providerId: string
    bookingType: BookingType
    // For people bookings
    startDate?: string
    endDate?: string
    // For products/services
    requirements?: string
    quantity?: number
    // Payment
    currency: string
    // Optional
    message?: string
    objectiveId?: string
    businessFunctionId?: string
}

// ==========================================
// PRICE BREAKDOWN
// ==========================================

export interface PriceBreakdownItem {
    label: string
    amount: number
    type: 'subtotal' | 'fee' | 'tax' | 'discount' | 'total'
    description?: string
}

export interface PriceBreakdown {
    items: PriceBreakdownItem[]
    subtotal: number
    platformFee: number
    platformFeePercent: number
    vatAmount: number
    vatRate: number
    discountAmount: number
    discountPercent: number
    total: number
    currency: string
    // Metadata
    dayRate?: number
    numberOfDays?: number
    unitPrice?: number
    quantity?: number
}

// ==========================================
// BOOKING CONFIRMATION
// ==========================================

export interface BookingConfirmation {
    orderId: string
    orderNumber: string
    status: BookingStatus
    // Provider info
    providerId: string
    providerName: string
    providerAvatarUrl?: string
    listingTitle: string
    // Dates
    startDate?: string
    endDate?: string
    createdAt: string
    // Payment
    totalAmount: number
    currency: string
    paymentIntentId?: string
    // Conversation
    conversationId?: string
    // Next steps
    nextSteps: string[]
}

// ==========================================
// ORDER SUMMARY (for buyer view)
// ==========================================

export interface OrderSummary {
    id: string
    orderNumber: string
    status: BookingStatus
    bookingType: BookingType
    // Provider
    providerId: string
    providerName: string
    providerAvatarUrl?: string
    // Listing
    listingId?: string
    listingTitle: string
    listingCategory: 'People' | 'Products' | 'Services' | 'AI'
    // Dates
    startDate?: string
    endDate?: string
    createdAt: string
    completedAt?: string
    // Payment
    totalAmount: number
    currency: string
    escrowStatus: PaymentStatus
    // Conversation
    conversationId?: string
    hasUnreadMessages: boolean
    // Review
    hasLeftReview: boolean
}

// ==========================================
// BUYER DASHBOARD STATS
// ==========================================

export interface BuyerDashboardStats {
    activeOrdersCount: number
    completedOrdersCount: number
    totalSpend: number
    spendThisMonth: number
    favoriteProvidersCount: number
    currency: string
}

// ==========================================
// FAVORITE PROVIDER
// ==========================================

export interface FavoriteProvider {
    providerId: string
    userId: string
    name: string
    avatarUrl?: string
    headline?: string
    dayRate?: number
    currency: string
    averageRating?: number
    totalReviews: number
    isAvailable: boolean
    addedAt: string
    notes?: string
    autoNotify: boolean
}

// ==========================================
// DATE SELECTION
// ==========================================

export interface DateSelection {
    startDate: Date | null
    endDate: Date | null
    selectedDates: Date[]
    numberOfDays: number
    isValid: boolean
    validationMessage?: string
}

// ==========================================
// BOOKING WIZARD STATE
// ==========================================

export type BookingWizardStep = 'dates' | 'requirements' | 'review' | 'payment' | 'confirmation'

export interface BookingWizardState {
    currentStep: BookingWizardStep
    listing: {
        id: string
        title: string
        category: 'People' | 'Products' | 'Services' | 'AI'
        subcategory: string
        description?: string
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
    dates: DateSelection
    requirements: string
    message: string
    priceBreakdown: PriceBreakdown | null
    paymentIntentClientSecret?: string
    confirmation: BookingConfirmation | null
    error?: string
}
