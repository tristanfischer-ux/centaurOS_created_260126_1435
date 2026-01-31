import { 
    FEATURE_REGISTRY, 
    getFeaturesByReleaseDate, 
    getHiddenFeatures,
    getNewFeatures,
    isFeatureNew,
    formatReleaseDate,
    type Feature,
    type FeatureCategory,
    type FeatureStatus
} from "@/lib/features/registry"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { 
    Sparkles, 
    Calendar, 
    EyeOff, 
    Eye,
    Code,
    Globe,
    Shield,
    BarChart3,
    MessageSquare,
    Store,
    Users,
    Target,
    Clock,
    Info,
    ExternalLink
} from "lucide-react"
import Link from "next/link"

// Keep in sync with package.json
const APP_VERSION = "1.0.3"
const BUILD_DATE = new Date().toISOString().split('T')[0]

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

const statusColors: Record<FeatureStatus, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    stable: 'success',
    beta: 'warning',
    alpha: 'error',
    hidden: 'default',
    deprecated: 'error',
}

function FeatureCard({ feature }: { feature: Feature }) {
    const CategoryIcon = categoryIcons[feature.category]
    const isNew = isFeatureNew(feature)
    
    return (
        <div className="relative border-l-4 border-l-muted pl-4 py-3 hover:bg-muted/50 transition-colors rounded-r-lg">
            {/* New indicator */}
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
                        {!feature.isVisibleInNav && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                                <EyeOff className="h-2.5 w-2.5" />
                                Hidden
                            </span>
                        )}
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
                                {feature.route}
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function AdminAboutPage() {
    const allFeatures = getFeaturesByReleaseDate()
    const newFeatures = getNewFeatures()
    const hiddenFeatures = getHiddenFeatures()
    const totalFeatures = FEATURE_REGISTRY.length
    const visibleFeatures = FEATURE_REGISTRY.filter(f => f.isVisibleInNav).length
    
    // Group features by month
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
        <div className="space-y-8">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <Info className="h-5 w-5 text-international-orange" />
                    <span className="text-sm font-medium text-international-orange uppercase tracking-wider">
                        Platform Information
                    </span>
                </div>
                <h1 className="text-2xl font-bold text-foreground">
                    About CentaurOS
                </h1>
                <p className="text-muted-foreground mt-1">
                    Feature changelog, version history, and hidden features discovery
                </p>
            </div>
            
            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Version</p>
                                <p className="text-2xl font-bold text-foreground">v{APP_VERSION}</p>
                            </div>
                            <Code className="h-8 w-8 text-muted-foreground" />
                        </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Total Features</p>
                                <p className="text-2xl font-bold text-foreground">{totalFeatures}</p>
                            </div>
                            <Target className="h-8 w-8 text-muted-foreground" />
                        </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">New Features</p>
                                <p className="text-2xl font-bold text-international-orange">{newFeatures.length}</p>
                            </div>
                            <Sparkles className="h-8 w-8 text-international-orange" />
                        </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Hidden Features</p>
                                <p className="text-2xl font-bold text-muted-foreground">{hiddenFeatures.length}</p>
                            </div>
                            <EyeOff className="h-8 w-8 text-muted-foreground" />
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            {/* New Features Section */}
            {newFeatures.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-international-orange" />
                            What&apos;s New
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
            
            {/* Hidden Features Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <EyeOff className="h-5 w-5 text-muted-foreground" />
                        Hidden Features
                    </CardTitle>
                    <CardDescription>
                        Features that are coded but not visible in the main navigation. 
                        These can be accessed directly via URL.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {hiddenFeatures.map(feature => (
                        <FeatureCard key={feature.id} feature={feature} />
                    ))}
                </CardContent>
            </Card>
            
            {/* Full Changelog */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-muted-foreground" />
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
            
            {/* System Information */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Code className="h-5 w-5 text-muted-foreground" />
                        System Information
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                            <dt className="text-muted-foreground">Version</dt>
                            <dd className="font-mono text-foreground">v{APP_VERSION}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Build Date</dt>
                            <dd className="font-mono text-foreground">{BUILD_DATE}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Framework</dt>
                            <dd className="font-mono text-foreground">Next.js 16</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Runtime</dt>
                            <dd className="font-mono text-foreground">Edge Functions</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Database</dt>
                            <dd className="font-mono text-foreground">Supabase (PostgreSQL)</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Hosting</dt>
                            <dd className="font-mono text-foreground">Vercel</dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>
        </div>
    )
}
