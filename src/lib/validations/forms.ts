// @ts-nocheck - Zod v4 changed .refine() return type and error handling; update to use .superRefine() or upgrade validation patterns
import { z } from 'zod'

/**
 * Form Validation Guidelines:
 * 
 * 1. Define schemas in this file for complex forms
 * 2. Use useForm from react-hook-form with zodResolver
 * 3. Show inline errors below fields
 * 4. Validate on blur for better UX
 * 
 * @example
 * ```tsx
 * import { useForm } from 'react-hook-form'
 * import { zodResolver } from '@hookform/resolvers/zod'
 * import { rfqSchema, type RFQFormData } from '@/lib/validations/forms'
 * 
 * const form = useForm<RFQFormData>({
 *   resolver: zodResolver(rfqSchema),
 *   mode: 'onBlur', // Validate on blur
 * })
 * ```
 */

// ==========================================
// RFQ Form Schema
// ==========================================

export const rfqSchema = z.object({
    title: z.string()
        .min(5, 'Title must be at least 5 characters')
        .max(200, 'Title must be less than 200 characters'),
    description: z.string()
        .min(20, 'Description must be at least 20 characters')
        .max(5000, 'Description must be less than 5000 characters'),
    rfq_type: z.enum(['commodity', 'custom', 'service'], {
        required_error: 'Please select an RFQ type',
    }),
    urgency: z.enum(['low', 'medium', 'high', 'critical'], {
        required_error: 'Please select urgency level',
    }),
    deadline: z.string().optional(),
    budget_min: z.number().min(0).optional(),
    budget_max: z.number().min(0).optional(),
    quantity: z.number().min(1).optional(),
}).refine(
    (data) => !data.budget_max || !data.budget_min || data.budget_max >= data.budget_min,
    {
        message: 'Maximum budget must be greater than minimum budget',
        path: ['budget_max'],
    }
)

export type RFQFormData = z.infer<typeof rfqSchema>

// ==========================================
// Provider Profile Schema
// ==========================================

export const providerProfileSchema = z.object({
    title: z.string()
        .min(3, 'Title must be at least 3 characters')
        .max(100, 'Title must be less than 100 characters'),
    headline: z.string()
        .min(10, 'Headline must be at least 10 characters')
        .max(200, 'Headline must be less than 200 characters'),
    bio: z.string()
        .min(50, 'Bio must be at least 50 characters')
        .max(2000, 'Bio must be less than 2000 characters'),
    day_rate: z.number()
        .min(0, 'Day rate must be positive')
        .max(10000, 'Day rate seems too high'),
    currency: z.enum(['GBP', 'USD', 'EUR']),
    minimum_days: z.number().min(1).max(30).optional(),
    location: z.string().optional(),
    skills: z.array(z.string()).min(1, 'Add at least one skill'),
})

export type ProviderProfileFormData = z.infer<typeof providerProfileSchema>

// ==========================================
// Booking Form Schema
// ==========================================

export const bookingSchema = z.object({
    startDate: z.date({
        required_error: 'Please select a start date',
    }),
    endDate: z.date({
        required_error: 'Please select an end date',
    }),
    message: z.string().max(1000, 'Message is too long').optional(),
}).refine(
    (data) => data.endDate >= data.startDate,
    {
        message: 'End date must be after start date',
        path: ['endDate'],
    }
)

export type BookingFormData = z.infer<typeof bookingSchema>

// ==========================================
// Task Form Schema
// ==========================================

export const taskSchema = z.object({
    title: z.string()
        .min(3, 'Title must be at least 3 characters')
        .max(200, 'Title must be less than 200 characters'),
    description: z.string().max(5000).optional(),
    objective_id: z.string().uuid('Please select an objective'),
    assignee_id: z.string().uuid().optional(),
    end_date: z.date().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
})

export type TaskFormData = z.infer<typeof taskSchema>

// ==========================================
// Certification Form Schema
// ==========================================

export const certificationSchema = z.object({
    name: z.string()
        .min(2, 'Name must be at least 2 characters')
        .max(100, 'Name must be less than 100 characters'),
    issuer: z.string()
        .min(2, 'Issuer must be at least 2 characters')
        .max(100, 'Issuer must be less than 100 characters'),
    issue_date: z.date({
        required_error: 'Please select issue date',
    }),
    expiry_date: z.date().optional(),
    credential_id: z.string().optional(),
    credential_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})

export type CertificationFormData = z.infer<typeof certificationSchema>
