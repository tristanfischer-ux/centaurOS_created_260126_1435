/**
 * Marketplace Preview Components
 * 
 * These components display marketplace listings on the public join page
 * to showcase available providers, services, and opportunities.
 * 
 * Usage Example:
 * 
 * ```tsx
 * import { MarketplacePreviewSection } from '@/components/marketing/marketplace-preview'
 * import { useRouter } from 'next/navigation'
 * 
 * function JoinPage() {
 *   const router = useRouter()
 *   
 *   const previewListings = [
 *     {
 *       id: '1',
 *       category: 'People',
 *       subcategory: 'Engineer',
 *       title: 'Senior Full-Stack Developer',
 *       description: 'Specialized in React, Node.js, and cloud architecture...',
 *       attributes: {
 *         role: 'Senior Engineer',
 *         rate: '$150/hr',
 *         location: 'San Francisco',
 *         years_experience: 8,
 *         skills: ['React', 'Node.js', 'AWS'],
 *         rating: 4.9,
 *         reviews_count: 42
 *       },
 *       image_url: '/images/engineer-profile.jpg',
 *       is_verified: true
 *     },
 *     // ... more listings
 *   ]
 *   
 *   return (
 *     <MarketplacePreviewSection
 *       role="founder"
 *       listings={previewListings}
 *       onJoinClick={() => router.push('/join')}
 *     />
 *   )
 * }
 * ```
 */

export { MarketplacePreviewCard } from './MarketplacePreviewCard'
export type { PreviewListing } from './MarketplacePreviewCard'
export { MarketplacePreviewSection } from './MarketplacePreviewSection'
export { PreviewCardSkeleton, PreviewSectionSkeleton } from './PreviewSkeleton'
