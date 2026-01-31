import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { escapeHtml } from '@/lib/security/sanitize'

// SECURITY: Validate input with Zod schema
const ExecutiveSetupSchema = z.object({
  expertise: z.array(z.string().max(100)).max(20).optional(),
  bio: z.string().max(2000).optional(),
  availability_hours: z.number().min(0).max(168).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Rate limit profile updates (5 updates per hour)
    const headersList = await headers()
    const clientIP = getClientIP(headersList)
    const rateLimitResult = await rateLimit('api', `executive-setup:${user.id}`, { limit: 5, window: 3600 })
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before updating your profile again.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    
    // SECURITY: Validate input
    const validationResult = ExecutiveSetupSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.flatten() },
        { status: 400 }
      )
    }

    const { expertise, bio, availability_hours } = validationResult.data

    // SECURITY: Sanitize bio to prevent XSS if rendered as HTML anywhere
    const sanitizedBio = bio ? escapeHtml(bio) : undefined

    // Update the profile with executive-specific data
    const { error } = await supabase
      .from('profiles')
      .update({
        bio: sanitizedBio,
        onboarding_data: {
          executive_profile_completed: true,
          expertise_areas: expertise,
          availability_hours,
          profile_completed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      console.error('Error updating executive profile:', error)
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Executive profile setup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
