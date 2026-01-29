# Marketplace Preview Components

Beautiful, conversion-optimized marketplace preview components for the join page.

## Components

### 1. `MarketplacePreviewCard`
A compact card displaying a marketplace listing with:
- Image with verified badge overlay
- Category badge and AI type icon
- Title, role/function, and description
- Star rating with review count
- Location, experience, or other key metrics
- Skills/tags (max 3 displayed)
- Price/rate with CTA button

### 2. `MarketplacePreviewSection`
A full section that displays multiple preview cards:
- Role-specific heading and description
- Responsive grid (1-4 columns based on screen size)
- Displays up to 4 preview cards
- Bottom CTA card to join and unlock full marketplace

### 3. `PreviewSkeleton`
Loading states:
- `PreviewCardSkeleton` - Single card skeleton
- `PreviewSectionSkeleton` - Full section with 4 card skeletons

## Usage

```tsx
import { MarketplacePreviewSection } from '@/components/marketing/marketplace-preview'
import { PreviewSectionSkeleton } from '@/components/marketing/marketplace-preview'

function JoinPage() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Fetch curated listings
    fetchPreviewListings().then(data => {
      setListings(data)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <PreviewSectionSkeleton />
  }

  return (
    <MarketplacePreviewSection
      role="founder" // or "executive" or "apprentice"
      listings={listings}
      onJoinClick={() => router.push('/join')}
    />
  )
}
```

## Sample Data Structure

```typescript
const sampleListings: PreviewListing[] = [
  // Person
  {
    id: '1',
    category: 'People',
    subcategory: 'Engineer',
    title: 'Sarah Chen',
    description: 'Senior Full-Stack Engineer specializing in React, Node.js, and cloud architecture. Built scalable systems for Fortune 500 companies.',
    attributes: {
      role: 'Senior Full-Stack Engineer',
      rate: '$150/hr',
      location: 'San Francisco, CA',
      years_experience: 8,
      skills: ['React', 'Node.js', 'AWS', 'TypeScript', 'Docker'],
      rating: 4.9,
      reviews_count: 42,
      projects_completed: 127
    },
    image_url: '/images/engineer-profile.jpg',
    is_verified: true
  },

  // AI Agent
  {
    id: '2',
    category: 'AI',
    subcategory: 'Agent',
    title: 'CodeReview AI',
    description: 'Automated code review and security analysis agent. Identifies bugs, security vulnerabilities, and suggests optimizations.',
    attributes: {
      function: 'Automated code quality and security analysis',
      cost: '$0.05/review',
      autonomy_level: 'High',
      accuracy: '94%',
      latency: '<2min',
      integrations: ['GitHub', 'GitLab', 'Bitbucket', 'Slack'],
      rating: 4.8,
      reviews_count: 156,
      setup_time: '5 minutes'
    },
    image_url: '/images/ai-agent.png',
    is_verified: true
  },

  // Product/Manufacturer
  {
    id: '3',
    category: 'Products',
    subcategory: 'Manufacturer',
    title: 'Precision Metal Works',
    description: 'ISO 9001 certified precision metal manufacturing with CNC machining, laser cutting, and finishing services.',
    attributes: {
      location: 'Austin, TX',
      lead_time: '5-7 days',
      capacity_available: '65%',
      certifications: ['ISO 9001', 'AS9100', 'ITAR'],
      rating: 4.7,
      reviews_count: 89,
      min_order: '$500'
    },
    image_url: '/images/manufacturer.jpg',
    is_verified: true
  },

  // Machine Capacity
  {
    id: '4',
    category: 'Products',
    subcategory: 'Machine Capacity',
    title: 'Industrial 3D Printing Bay',
    description: 'High-volume FDM and SLA printing with large build volumes. Perfect for prototyping and small production runs.',
    attributes: {
      machine_type: 'FDM & SLA',
      location: 'Boston, MA',
      availability: '24/7',
      rate: '$45/hr',
      build_volume: '300x300x400mm',
      materials: ['PLA', 'ABS', 'Nylon', 'Resin'],
      rating: 4.9,
      reviews_count: 34
    },
    image_url: '/images/3d-printer.jpg',
    is_verified: true
  }
]
```

## Role-Specific Copy

The section automatically adjusts copy based on the `role` prop:

- **founder**: "Your team is waiting" / "Connect with world-class talent..."
- **executive**: "Transform your operations" / "Access enterprise-grade providers..."
- **apprentice**: "Learn from the best" / "Discover mentors, courses..."

## Styling

Components use:
- Tailwind CSS for styling
- shadcn/ui components (Card, Badge, Button, Skeleton)
- Gradient backgrounds and hover effects
- Responsive design (mobile-first)
- Trust signals (verified badges, star ratings)
- Conversion-optimized CTAs

## Fetching Preview Data

Create a server action to fetch curated listings:

```typescript
// src/actions/preview-marketplace.ts
'use server'

import { createClient } from '@/lib/supabase/server'

export async function getPreviewListings(limit: number = 4) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('is_verified', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error('Failed to fetch preview listings:', error)
    return []
  }
  
  return data
}
```

## Integration with Join Page

1. Fetch 4 curated listings (mix of categories)
2. Show loading skeleton while fetching
3. Display preview section
4. Handle join clicks to route to signup/login

```tsx
// In your join page
const listings = await getPreviewListings()

<MarketplacePreviewSection
  role={selectedRole}
  listings={listings}
  onJoinClick={() => router.push('/join')}
/>
```
