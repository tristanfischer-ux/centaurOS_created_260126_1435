# Integration Example: Marketplace Onboarding Modal

## Quick Start

Here's how to integrate the MarketplaceOnboardingModal into the marketplace page.

### 1. Update Marketplace Page (Server Component)

```tsx
// src/app/(platform)/marketplace/page.tsx
import { createClient } from '@/lib/supabase/server'
import { getListings } from '@/actions/marketplace'
import { getMarketplaceOnboardingStatus } from '@/actions/onboarding'
import { MarketplaceView } from './marketplace-view'

export default async function MarketplacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Get user profile for role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Get marketplace listings
  const listings = await getListings()
  
  // Check if user needs onboarding
  const { needsOnboarding } = await getMarketplaceOnboardingStatus()
  
  // Get top 3 listings for recommendations
  const topRecommendations = listings.slice(0, 3)

  return (
    <MarketplaceView 
      initialListings={listings}
      showOnboarding={needsOnboarding}
      recommendations={topRecommendations}
      userRole={profile?.role || 'Apprentice'}
    />
  )
}
```

### 2. Update MarketplaceView (Client Component)

```tsx
// src/app/(platform)/marketplace/marketplace-view.tsx
'use client'

import { MarketplaceOnboardingModal } from '@/components/onboarding/MarketplaceOnboardingModal'
import { MarketplaceListing } from '@/actions/marketplace'
// ... other imports

interface MarketplaceViewProps {
  initialListings: MarketplaceListing[]
  recommendations?: MarketplaceListing[]
  teamMembers?: TeamMember[]
  showOnboarding?: boolean
  userRole?: 'Executive' | 'Apprentice' | 'Founder' | 'AI_Agent'
}

export function MarketplaceView({ 
  initialListings, 
  recommendations = [], 
  teamMembers = [],
  showOnboarding = false,
  userRole = 'Apprentice'
}: MarketplaceViewProps) {
  // ... existing state and logic

  return (
    <div>
      {/* Show onboarding modal for first-time users */}
      {showOnboarding && (
        <MarketplaceOnboardingModal
          recommendations={recommendations}
          userRole={userRole}
          onComplete={() => {
            console.log('Marketplace onboarding completed!')
          }}
        />
      )}

      {/* Rest of marketplace UI */}
      <div className="space-y-6">
        {/* Search, filters, listings, etc. */}
      </div>
    </div>
  )
}
```

### 3. Record Actions (Optional but Recommended)

Update marketplace actions to record first-time user actions:

```tsx
// src/actions/marketplace.ts
import { recordMarketplaceAction } from '@/actions/onboarding'

export async function addToStack(id: string, type: 'provider' | 'tool' = 'provider') {
  // ... existing code
  
  // Record first action
  await recordMarketplaceAction('add_to_stack', id)
  
  return { success: true }
}

export async function createBooking(providerId: string) {
  // ... existing code
  
  // Record first action
  await recordMarketplaceAction('book_listing', providerId)
  
  return { success: true }
}
```

```tsx
// src/actions/rfq.ts
import { recordMarketplaceAction } from '@/actions/onboarding'

export async function createRFQ(data: RFQFormData) {
  // ... existing code
  
  // Record first action
  await recordMarketplaceAction('create_rfq')
  
  return { success: true, rfqId: rfq.id }
}
```

## Testing

### Clear Onboarding State

To test the onboarding modal again:

```javascript
// In browser console
localStorage.removeItem('centauros:marketplace:onboarding:completed')
location.reload()
```

### Check Onboarding Status

```sql
-- In Supabase SQL Editor
SELECT 
  id,
  email,
  onboarding_data
FROM profiles
WHERE id = 'your-user-id';
```

### Force Show Modal

```tsx
<MarketplaceOnboardingModal
  forceShow={true}
  recommendations={recommendations}
  userRole={userRole}
/>
```

## Analytics Queries

Track onboarding completion rates:

```sql
-- Users who completed marketplace onboarding
SELECT 
  COUNT(*) as completed_count
FROM profiles
WHERE onboarding_data->>'marketplace_tour_completed' = 'true';

-- Users who skipped
SELECT 
  COUNT(*) as skipped_count
FROM profiles
WHERE onboarding_data->>'marketplace_tour_skipped' = 'true';

-- First actions distribution
SELECT 
  onboarding_data->>'first_marketplace_action' as action_type,
  COUNT(*) as count
FROM profiles
WHERE onboarding_data->>'first_marketplace_action' IS NOT NULL
GROUP BY action_type
ORDER BY count DESC;

-- Conversion funnel
SELECT 
  COUNT(*) FILTER (WHERE onboarding_data->>'marketplace_tour_completed' = 'true') as completed_tour,
  COUNT(*) FILTER (WHERE onboarding_data->>'first_marketplace_action' IS NOT NULL) as took_action,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE onboarding_data->>'first_marketplace_action' IS NOT NULL) /
    NULLIF(COUNT(*) FILTER (WHERE onboarding_data->>'marketplace_tour_completed' = 'true'), 0),
    2
  ) as conversion_rate_percent
FROM profiles;
```

## Customization

### Change Welcome Copy

Edit the `getRoleSpecificCopy()` function in `MarketplaceOnboardingModal.tsx`:

```tsx
const getRoleSpecificCopy = () => {
  switch (userRole) {
    case 'Executive':
      return 'Your custom message for Executives'
    case 'Founder':
      return 'Your custom message for Founders'
    // ...
  }
}
```

### Change Recommendation Logic

Update the number of recommendations:

```tsx
// Show 5 recommendations instead of 3
const topRecommendations = listings.slice(0, 5)
```

Or implement smart recommendations:

```tsx
// Get personalized recommendations
const recommendations = await getRecommendationsForUser(user.id)
```

### Add Additional Steps

Extend the `ONBOARDING_STEPS` array:

```tsx
const ONBOARDING_STEPS: OnboardingStep[] = [
  // ... existing steps
  {
    id: 'your_new_step',
    title: 'Your New Step',
    description: 'Description of your new step',
    icon: YourIcon,
  },
]
```

Then add corresponding content in the render section:

```tsx
{currentStep === 3 && <YourNewStepContent />}
```

## Troubleshooting

### Modal doesn't show

1. Check onboarding status: `await getMarketplaceOnboardingStatus()`
2. Clear localStorage: `localStorage.removeItem('centauros:marketplace:onboarding:completed')`
3. Check database: Ensure `onboarding_data` field exists in profiles table
4. Run migration: `supabase db push` or apply migration `20260129120100_onboarding_tracking.sql`

### Actions not recording

1. Verify user is authenticated
2. Check profile exists in database
3. Review server action logs for errors
4. Ensure `recordMarketplaceAction()` is called after successful action

### Recommendations not showing

1. Verify listings are passed as prop
2. Check listings have required fields (id, title, description, category)
3. Use fallback empty state when no recommendations available
