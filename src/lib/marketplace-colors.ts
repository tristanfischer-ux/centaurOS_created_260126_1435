/**
 * Marketplace Category Color System
 * 
 * Centralized semantic color tokens for marketplace categories.
 * Eliminates duplication across MarketCard, ListingDetail, and Dialog components.
 * 
 * Color Philosophy:
 * - People: International Orange (primary brand, warm, human connection)
 * - Products: Muted tones (industrial, physical goods)
 * - Services: Electric Blue (secondary brand, digital services)
 * - AI: Status Info colors (distinct AI category within services)
 */

export type MarketplaceCategory = 'People' | 'Products' | 'Services' | 'AI'

interface CategoryColorScheme {
  /** Badge background and text classes */
  badge: string
  /** Card border color */
  card: string
  /** Card hover state */
  cardHover: string
  /** Accent color (solid) */
  accent: string
  /** Icon/text accent color */
  icon: string
  /** Button background */
  button: string
  /** Button hover state */
  buttonHover: string
  /** Light background variant */
  lightBg: string
  /** Hero card top bar */
  heroBar: string
  /** Hero card active state background */
  heroActiveBg: string
  /** Hero card icon background */
  heroIconBg: string
  /** Hero card icon background (active) */
  heroIconBgActive: string
  /** Hero card text color */
  heroText: string
  /** Hero card text color (active) */
  heroTextActive: string
}

export const CATEGORY_COLORS: Record<MarketplaceCategory, CategoryColorScheme> = {
  People: {
    badge: 'bg-international-orange-light text-international-orange',
    card: 'border-international-orange/30',
    cardHover: 'hover:border-international-orange/50 hover:bg-international-orange/5',
    accent: 'bg-international-orange',
    icon: 'text-international-orange',
    button: 'bg-international-orange',
    buttonHover: 'hover:bg-international-orange-hover',
    lightBg: 'bg-international-orange/5',
    heroBar: 'bg-international-orange',
    heroActiveBg: 'bg-international-orange/10',
    heroIconBg: 'bg-muted group-hover:bg-international-orange-light group-hover:scale-110',
    heroIconBgActive: 'bg-international-orange-light',
    heroText: 'text-muted-foreground group-hover:text-international-orange',
    heroTextActive: 'text-international-orange',
  },
  Products: {
    badge: 'bg-muted text-muted-foreground',
    card: 'border-muted-foreground/30',
    cardHover: 'hover:border-muted-foreground/40 hover:bg-muted/50',
    accent: 'bg-muted-foreground',
    icon: 'text-muted-foreground',
    button: 'bg-secondary',
    buttonHover: 'hover:bg-secondary/80',
    lightBg: 'bg-muted/30',
    heroBar: 'bg-muted-foreground',
    heroActiveBg: 'bg-muted',
    heroIconBg: 'bg-muted group-hover:bg-muted group-hover:scale-110',
    heroIconBgActive: 'bg-muted',
    heroText: 'text-muted-foreground',
    heroTextActive: 'text-muted-foreground',
  },
  Services: {
    badge: 'bg-electric-blue-light text-electric-blue',
    card: 'border-electric-blue/30',
    cardHover: 'hover:border-electric-blue/50 hover:bg-electric-blue/5',
    accent: 'bg-electric-blue',
    icon: 'text-electric-blue',
    button: 'bg-electric-blue',
    buttonHover: 'hover:bg-electric-blue-hover',
    lightBg: 'bg-electric-blue/5',
    heroBar: 'bg-electric-blue',
    heroActiveBg: 'bg-electric-blue/10',
    heroIconBg: 'bg-muted group-hover:bg-electric-blue-light group-hover:scale-110',
    heroIconBgActive: 'bg-electric-blue-light',
    heroText: 'text-muted-foreground group-hover:text-electric-blue',
    heroTextActive: 'text-electric-blue',
  },
  AI: {
    badge: 'bg-status-info-light text-status-info-dark',
    card: 'border-status-info/30',
    cardHover: 'hover:border-status-info/50 hover:bg-status-info-light/50',
    accent: 'bg-status-info',
    icon: 'text-status-info-dark',
    button: 'bg-status-info',
    buttonHover: 'hover:bg-status-info/90',
    lightBg: 'bg-status-info-light/50',
    heroBar: 'bg-status-info',
    heroActiveBg: 'bg-status-info-light/50',
    heroIconBg: 'bg-muted group-hover:bg-status-info-light group-hover:scale-110',
    heroIconBgActive: 'bg-status-info-light',
    heroText: 'text-muted-foreground group-hover:text-status-info-dark',
    heroTextActive: 'text-status-info-dark',
  },
}

/**
 * Get category color scheme
 * 
 * @param category - Marketplace category
 * @returns Color scheme object with all category-specific classes
 * 
 * @example
 * const colors = getCategoryColors('People')
 * <Badge className={colors.badge}>Expert</Badge>
 */
export function getCategoryColors(category: MarketplaceCategory): CategoryColorScheme {
  return CATEGORY_COLORS[category]
}

/**
 * Get badge classes for a category
 * 
 * @param category - Marketplace category
 * @returns Tailwind classes for badge styling
 * 
 * @example
 * <Badge className={cn("uppercase text-xs", getCategoryBadgeClasses('People'))}>
 */
export function getCategoryBadgeClasses(category: MarketplaceCategory): string {
  return CATEGORY_COLORS[category].badge
}

/**
 * Avatar gradient colors (intentional variance within categories)
 * These use a hash-based approach to provide visual variety while maintaining category identity.
 */
export function getAvatarGradient(category: MarketplaceCategory, title: string): string {
  // Use title to generate consistent but varied gradients within category
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const variant = hash % 3
  
  switch (category) {
    case 'People':
      // Orange tones - warm, human, primary brand
      return variant === 0 
        ? 'from-orange-400 to-orange-600' 
        : variant === 1 
        ? 'from-amber-400 to-orange-500'
        : 'from-orange-500 to-amber-600'
    case 'Products':
      // Slate tones - industrial, manufacturing
      return variant === 0 
        ? 'from-slate-400 to-slate-600' 
        : variant === 1 
        ? 'from-slate-500 to-slate-700'
        : 'from-zinc-400 to-slate-600'
    case 'Services':
      // Blue tones - tech, digital, secondary brand
      return variant === 0 
        ? 'from-blue-400 to-blue-600' 
        : variant === 1 
        ? 'from-sky-400 to-blue-500'
        : 'from-blue-500 to-sky-600'
    case 'AI':
      // Violet tones - AI distinction
      return variant === 0 
        ? 'from-violet-400 to-violet-600' 
        : variant === 1 
        ? 'from-purple-400 to-violet-500'
        : 'from-indigo-400 to-violet-600'
    default:
      return 'from-gray-400 to-gray-600'
  }
}
