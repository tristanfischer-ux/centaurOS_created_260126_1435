'use client'

import Link from 'next/link'
import {
  Briefcase,
  GraduationCap,
  Factory,
  ShieldCheck,
  ArrowRight,
  ChevronRight,
  Star,
  Store,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface FeaturedListing {
  id: string
  title: string
  description: string | null
  category: string
  subcategory: string
  is_verified: boolean | null
  image_url: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: any
}

interface MarketplaceSpotlightProps {
  featuredListings: FeaturedListing[]
}

const categoryConfig: Record<string, {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  label: string
}> = {
  People: {
    icon: Briefcase,
    color: 'text-chart-5',
    bgColor: 'bg-chart-5/10',
    label: 'Expert',
  },
  Services: {
    icon: Factory,
    color: 'text-status-success',
    bgColor: 'bg-status-success-light',
    label: 'Service',
  },
  Products: {
    icon: Star,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    label: 'Product',
  },
  AI: {
    icon: GraduationCap,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Tool',
  },
}

/**
 * Marketplace Spotlight - Featured people, services, and products.
 * People-first design: shows names, faces, what they do.
 * No "AI" language even for AI category items.
 */
export function MarketplaceSpotlight({ featuredListings }: MarketplaceSpotlightProps) {
  if (!featuredListings || featuredListings.length === 0) {
    return <MarketplaceSpotlightEmpty />
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-green-50/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Store className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Marketplace Spotlight</h2>
              <p className="text-sm text-muted-foreground">People and services to help you move faster</p>
            </div>
          </div>
        </div>
      </div>

      {/* Listings */}
      <div className="divide-y divide-slate-100">
        {featuredListings.slice(0, 3).map((listing) => (
          <SpotlightCard key={listing.id} listing={listing} />
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 bg-slate-50 border-t border-slate-100">
        <Link
          href="/marketplace"
          className="text-sm text-international-orange hover:text-orange-700 font-medium flex items-center gap-1 group w-fit"
        >
          Browse full marketplace
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  )
}

function SpotlightCard({ listing }: { listing: FeaturedListing }) {
  const config = categoryConfig[listing.category] || categoryConfig.Services
  const Icon = config.icon
  const attrs = listing.attributes as Record<string, unknown> | null
  const rate = attrs?.rate || attrs?.price || attrs?.cost
  const location = attrs?.location as string | undefined
  const initials = listing.title
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="group flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors"
    >
      {/* Avatar / Image */}
      <Avatar className="w-11 h-11 flex-shrink-0">
        <AvatarImage src={listing.image_url || undefined} />
        <AvatarFallback className={cn("text-sm font-semibold", config.bgColor, config.color)}>
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors truncate">
              {listing.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {listing.subcategory}
              {location && <span> &middot; {location}</span>}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-international-orange transition-colors flex-shrink-0 mt-0.5" />
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant="outline" className={cn("text-[10px] border-slate-200", config.color)}>
            <Icon className="w-2.5 h-2.5 mr-1" />
            {config.label}
          </Badge>
          {listing.is_verified && (
            <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">
              <ShieldCheck className="w-2.5 h-2.5 mr-1" />
              Verified
            </Badge>
          )}
          {rate ? (
            <span className="text-xs font-medium text-foreground">
              {typeof rate === 'number' ? `£${rate}` : String(rate)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

/**
 * Empty state: show the HireExpertCTA-style cards instead
 */
function MarketplaceSpotlightEmpty() {
  const cards = [
    {
      title: 'Find an Expert',
      description: 'Fractional executives and domain specialists ready to guide your work.',
      href: '/marketplace?tab=People&subcategory=Executive',
      icon: Briefcase,
      color: 'text-chart-5',
      bgColor: 'bg-chart-5/10',
      borderHover: 'hover:border-chart-5/40',
    },
    {
      title: 'Hire an Apprentice',
      description: 'Skilled hands-on support for CAD, testing, documentation, and more.',
      href: '/marketplace?tab=People&subcategory=Apprentice',
      icon: GraduationCap,
      color: 'text-status-info',
      bgColor: 'bg-status-info/10',
      borderHover: 'hover:border-status-info/40',
    },
    {
      title: 'Browse Services',
      description: 'DFM review, quality systems, supply chain, and manufacturing services.',
      href: '/marketplace?tab=Services',
      icon: Factory,
      color: 'text-status-success',
      bgColor: 'bg-status-success-light',
      borderHover: 'hover:border-status-success/40',
    },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-green-50/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <Store className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Marketplace</h2>
            <p className="text-sm text-muted-foreground">People and services to help you move faster</p>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="p-4 space-y-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={cn(
              "group flex items-center gap-4 p-4 rounded-xl border border-slate-100 transition-all duration-200",
              card.borderHover, "hover:shadow-sm"
            )}
          >
            <div className={cn("flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center", card.bgColor)}>
              <card.icon className={cn("w-5 h-5", card.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors">
                {card.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {card.description}
              </p>
            </div>
            <ArrowRight className={cn("w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-all", `group-hover:${card.color}`)} />
          </Link>
        ))}
      </div>
    </div>
  )
}
