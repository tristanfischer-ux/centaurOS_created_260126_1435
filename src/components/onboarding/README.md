# Onboarding Components

## MarketplaceOnboardingModal

A 3-step wizard modal that introduces first-time users to the marketplace features.

### Features

- **Step 1: Welcome** - Introduction with role-specific copy
- **Step 2: Recommendations** - Shows 3 AI-recommended listings
- **Step 3: Take Action** - Encourages engagement (add to stack, create RFQ, use AI search)
- Progress indicator and navigation buttons
- Skip functionality
- Completion tracking via server action

### Usage

#### Basic Integration

```tsx
import { MarketplaceOnboardingModal } from '@/components/onboarding/MarketplaceOnboardingModal'
import { getMarketplaceOnboardingStatus } from '@/actions/onboarding'

export default async function MarketplacePage() {
  const { needsOnboarding } = await getMarketplaceOnboardingStatus()
  
  return (
    <div>
      {needsOnboarding && (
        <MarketplaceOnboardingModal
          recommendations={topListings}
          userRole={user.role}
        />
      )}
      {/* Rest of marketplace UI */}
    </div>
  )
}
```

#### With Recommendations

```tsx
import { MarketplaceOnboardingModal } from '@/components/onboarding/MarketplaceOnboardingModal'
import { getRecommendedListings } from '@/actions/marketplace'
import { getMarketplaceOnboardingStatus } from '@/actions/onboarding'

export default async function MarketplacePage() {
  const { needsOnboarding } = await getMarketplaceOnboardingStatus()
  const recommendations = await getRecommendedListings(3) // Get top 3
  
  return (
    <div>
      {needsOnboarding && (
        <MarketplaceOnboardingModal
          recommendations={recommendations}
          userRole={user.role}
          onComplete={() => {
            console.log('Onboarding completed!')
          }}
        />
      )}
      {/* Rest of marketplace UI */}
    </div>
  )
}
```

#### Force Show (for testing or re-onboarding)

```tsx
<MarketplaceOnboardingModal
  forceShow={true}
  recommendations={listings}
  userRole="Executive"
/>
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `recommendations` | `MarketplaceListing[]` | No | `[]` | Array of up to 3 recommended listings to show in step 2 |
| `userRole` | `'Executive' \| 'Apprentice' \| 'Founder' \| 'AI_Agent'` | No | `'Apprentice'` | User role for personalized welcome copy |
| `onComplete` | `() => void` | No | `undefined` | Callback when user completes or skips the tour |
| `forceShow` | `boolean` | No | `false` | Force show modal even if user has completed it before |

### Server Actions

The component uses the following server actions from `@/actions/onboarding`:

#### `completeMarketplaceOnboarding(skipped?: boolean)`

Marks the marketplace onboarding as complete in the user's profile.

```ts
import { completeMarketplaceOnboarding } from '@/actions/onboarding'

await completeMarketplaceOnboarding(false) // Completed normally
await completeMarketplaceOnboarding(true)  // Skipped
```

#### `getMarketplaceOnboardingStatus()`

Checks if the user needs to see the marketplace onboarding.

```ts
import { getMarketplaceOnboardingStatus } from '@/actions/onboarding'

const { needsOnboarding, wasSkipped, firstAction } = await getMarketplaceOnboardingStatus()
```

Returns:
- `needsOnboarding`: boolean - Whether user needs to see the tour
- `wasSkipped`: boolean - Whether user skipped the tour
- `firstAction`: string - Type of first marketplace action taken
- `firstActionAt`: string - Timestamp of first action

#### `recordMarketplaceAction(actionType, listingId?)`

Records the user's first marketplace action for analytics.

```ts
import { recordMarketplaceAction } from '@/actions/onboarding'

// When user adds to stack
await recordMarketplaceAction('add_to_stack', listingId)

// When user creates RFQ
await recordMarketplaceAction('create_rfq')

// When user books a listing
await recordMarketplaceAction('book_listing', listingId)
```

### Storage

The component uses two storage mechanisms:

1. **localStorage** - For immediate UI state (prevents flash of modal on page load)
   - Key: `centauros:marketplace:onboarding:completed`

2. **Database (profiles.onboarding_data)** - For persistent tracking and analytics
   - Synced via `completeMarketplaceOnboarding()` server action

### Data Structure

The `profiles.onboarding_data` JSONB field stores:

```json
{
  "marketplace_tour_completed": boolean,
  "marketplace_tour_skipped": boolean,
  "first_marketplace_action": "add_to_stack" | "create_rfq" | "book_listing" | "view_listing" | "contact_provider",
  "first_marketplace_action_at": "ISO-8601 timestamp",
  "first_marketplace_action_listing_id": "uuid"
}
```

### Example Integration in Marketplace View

```tsx
// src/app/(platform)/marketplace/page.tsx
import { MarketplaceView } from './marketplace-view'
import { MarketplaceOnboardingModal } from '@/components/onboarding/MarketplaceOnboardingModal'
import { getListings } from '@/actions/marketplace'
import { getMarketplaceOnboardingStatus } from '@/actions/onboarding'
import { createClient } from '@/lib/supabase/server'

export default async function MarketplacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id)
    .single()

  const listings = await getListings()
  const { needsOnboarding } = await getMarketplaceOnboardingStatus()
  
  // Get top 3 recommendations for onboarding
  const topListings = listings.slice(0, 3)

  return (
    <div>
      <MarketplaceView 
        initialListings={listings}
      />
      
      {needsOnboarding && (
        <MarketplaceOnboardingModal
          recommendations={topListings}
          userRole={profile?.role}
        />
      )}
    </div>
  )
}
```

### Testing

To test the onboarding modal:

1. Clear localStorage: `localStorage.removeItem('centauros:marketplace:onboarding:completed')`
2. Clear database: Update your profile's `onboarding_data` to remove `marketplace_tour_completed`
3. Or use `forceShow={true}` prop

### Styling

The modal uses shadcn/ui Dialog component with:
- Max width: `sm:max-w-2xl`
- Max height: `max-h-[90vh]` with scroll
- Blueprint-themed design matching CentaurOS aesthetic

### Related Components

- `OnboardingWelcome` - General platform onboarding (not marketplace-specific)
- `FeatureTip` - Contextual tooltips for page-specific help
- `ComparisonModal` - For comparing marketplace listings
