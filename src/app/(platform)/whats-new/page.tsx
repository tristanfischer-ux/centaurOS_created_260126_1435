import { 
    FEATURE_REGISTRY, 
    getFeaturesByReleaseDate, 
    getNewFeatures,
    isFeatureNew,
    formatReleaseDate,
    type Feature,
    type FeatureCategory,
    type FeatureStatus
} from "@/lib/features/registry"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { typography } from "@/lib/design-system"
import { 
    Sparkles, 
    Calendar,
    Globe,
    Shield,
    BarChart3,
    MessageSquare,
    Store,
    Users,
    Target,
    Clock,
    ExternalLink
} from "lucide-react"
import Link from "next/link"

/**
 * What's New page - Product changelog visible to all authenticated users.
 * 
 * @description Shows feature releases, improvements, and updates.
 * Extracted from the old admin/about page so all users can see product updates.
 * Hidden/internal features are not shown on this page.
 */

// Keep in sync with package.json
const APP_VERSION = "0.9.0"

const categoryIcons: Record<FeatureCategory, typeof Globe> = {
    core: Target,
    marketplace: Store,
    integration: Globe,
    admin: Shield,
    analytics: BarChart3,
    communication: MessageSquare,
    provider: Users,
    buyer: Users,
    strategic: Target,
}

const categoryLabels: Record<FeatureCategory, string> = {
    core: 'Core Platform',
    marketplace: 'Marketplace',
    integration: 'Integration',
    admin: 'Administration',
    analytics: 'Analytics',
    communication: 'Communication',
    provider: 'Provider Tools',
    buyer: 'Buyer Tools',
    strategic: 'Strategic Planning',
}

const statusColors: Record<FeatureStatus, 'success' | 'warning' | 'error' | 'info' | 'pending'> = {
    stable: 'success',
    beta: 'warning',
    alpha: 'error',
    demo: 'info',
    hidden: 'pending',
    deprecated: 'error',
}

function FeatureCard({ feature }: { feature: Feature }) {
    const CategoryIcon = categoryIcons[feature.category]
    const isNew = isFeatureNew(feature)
    
    return (
        <div className="relative border-l-4 border-l-muted pl-4 py-3 hover:bg-muted/50 transition-colors rounded-r-lg">
            {isNew && (
                <span className="absolute -left-[3px] top-3 w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse" />
            )}
            
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">
                            {feature.name}
                        </h3>
                        {isNew && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider bg-international-orange text-white rounded-full px-1.5 py-0.5">
                                <Sparkles className="h-2.5 w-2.5" />
                                New
                            </span>
                        )}
                        <StatusBadge 
                            status={statusColors[feature.status]} 
                            size="sm"
                        >
                            {feature.status}
                        </StatusBadge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mt-1">
                        {feature.description}
                    </p>
                    
                    {feature.changelog && (
                        <p className="text-sm text-foreground mt-2 border-l-2 border-muted pl-3">
                            {feature.changelog}
                        </p>
                    )}
                    
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatReleaseDate(feature.releasedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                            <CategoryIcon className="h-3 w-3" />
                            {categoryLabels[feature.category]}
                        </span>
                        {feature.route && (
                            <Link 
                                href={feature.route}
                                className="flex items-center gap-1 text-electric-blue hover:underline"
                            >
                                <ExternalLink className="h-3 w-3" />
                                Try it
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function WhatsNewPage() {
    // Only show visible (non-hidden) features
    const allFeatures = getFeaturesByReleaseDate().filter(f => f.isVisibleInNav || f.status !== 'hidden')
    const newFeatures = getNewFeatures()
    
    // Group by month
    const featuresByMonth = allFeatures.reduce((acc, feature) => {
        const monthKey = feature.releasedAt.toLocaleDateString('en-GB', { 
            month: 'long', 
            year: 'numeric' 
        })
        if (!acc[monthKey]) {
            acc[monthKey] = []
        }
        acc[monthKey].push(feature)
        return acc
    }, {} as Record<string, Feature[]>)
    
    return (
        <div className="max-w-5xl space-y-6 -mt-2">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className={typography.pageHeader}>
                        <div className={typography.pageHeaderAccent} />
                        <h1 className={typography.h1}>
                            What&apos;s New
                        </h1>
                    </div>
                    <p className={typography.pageSubtitle}>
                        Shipping weekly toward v1.0 &middot; Currently v{APP_VERSION}
                    </p>
                </div>
            </div>
            
            {/* New Features Highlight */}
            {newFeatures.length > 0 && (
                <Card className="border overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-amber-50/80 to-transparent border-b border-slate-100">
                        <CardTitle className="flex items-center gap-2">
                            <div className="p-2 bg-amber-100 rounded-lg">
                                <Sparkles className="h-4 w-4 text-amber-600" />
                            </div>
                            Recently Added
                        </CardTitle>
                        <CardDescription>
                            Features added in the last 14 days
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {newFeatures.map(feature => (
                            <FeatureCard key={feature.id} feature={feature} />
                        ))}
                    </CardContent>
                </Card>
            )}
            
            {/* Full Changelog */}
            <Card className="border overflow-hidden">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <div className="p-2 bg-muted rounded-lg">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        Full Changelog
                    </CardTitle>
                    <CardDescription>
                        Complete history of all features, sorted by release date
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    {Object.entries(featuresByMonth).map(([month, features]) => (
                        <div key={month}>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                {month}
                            </h3>
                            <div className="space-y-4">
                                {features.map(feature => (
                                    <FeatureCard key={feature.id} feature={feature} />
                                ))}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}
