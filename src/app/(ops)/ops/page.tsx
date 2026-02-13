import { 
    getAdminDashboardStats, 
    getRecentActivity,
    getPendingApplications,
    getOpenDisputes 
} from "@/actions/admin"
import { StatsCard } from "@/components/admin/StatsCard"
import { ApplicationCard } from "@/components/admin/ApplicationCard"
import { HealthIndicator } from "@/components/admin/HealthIndicator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { 
    ClipboardList, 
    AlertTriangle, 
    Activity,
    Clock,
    ArrowRight,
    CheckCircle2,
    XCircle,
    RefreshCw,
    BarChart3
} from "lucide-react"

// NOTE: For StatsCard, we pass icon names as strings to avoid
// Server/Client Component serialization issues. See StatsCard.tsx
// for the ICON_MAP that maps names to components.

export default async function AdminDashboardPage() {
    // Fetch all data in parallel
    const [
        { data: stats, error: statsError },
        { data: recentActivity },
        { data: pendingApps },
        { data: openDisputes }
    ] = await Promise.all([
        getAdminDashboardStats(),
        getRecentActivity(10),
        getPendingApplications('pending'),
        getOpenDisputes()
    ])
    
    if (statsError || !stats) {
        return (
            <div className="text-center py-12">
                <p className="text-destructive">{statsError || 'Failed to load dashboard'}</p>
            </div>
        )
    }
    
    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                    iconName="ClipboardList"
                    label="Pending Applications"
                    value={stats.pendingApplications}
                    variant={stats.pendingApplications > 5 ? 'warning' : 'default'}
                />
                <StatsCard
                    iconName="AlertTriangle"
                    label="Open Disputes"
                    value={stats.openDisputes}
                    variant={stats.openDisputes > 0 ? 'danger' : 'default'}
                />
                <StatsCard
                    iconName="RefreshCw"
                    label="Webhook Backlog"
                    value={stats.webhookBacklog}
                    variant={stats.webhookBacklog > 20 ? 'warning' : 'default'}
                />
                <StatsCard
                    iconName="Activity"
                    label="Actions Today"
                    value={stats.recentActivityCount}
                />
            </div>
            
            {/* Platform Health Banner */}
            <Card className={
                stats.platformHealth === 'critical' 
                    ? 'border-destructive/50 bg-gradient-to-r from-status-error-light/80 to-status-error-light/20 shadow-sm' 
                    : stats.platformHealth === 'degraded' 
                    ? 'border-status-warning/50 bg-gradient-to-r from-status-warning-light/80 to-status-warning-light/20 shadow-sm'
                    : 'border-status-success/20 bg-gradient-to-r from-status-success-light/60 to-status-success-light/10 shadow-sm'
            }>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <HealthIndicator
                                status={stats.platformHealth}
                                label="Platform Status"
                                message={
                                    stats.platformHealth === 'healthy'
                                        ? 'All systems operational'
                                        : stats.platformHealth === 'degraded'
                                        ? 'Some issues detected'
                                        : 'Critical issues require attention'
                                }
                                size="lg"
                            />
                        </div>
                        <Link href="/ops/health">
                            <Button variant="secondary" size="sm" className="bg-background/80 hover:bg-background shadow-sm">
                                View Details
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
            
            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pending Applications */}
                <Card className="border shadow-[0_2px_15px_rgba(0,0,0,0.03)] overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-international-orange-light/60 to-transparent border-b">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-international-orange-light rounded-lg">
                                    <ClipboardList className="h-4 w-4 text-international-orange" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">Pending Applications</CardTitle>
                                    <CardDescription>Supplier applications awaiting review</CardDescription>
                                </div>
                            </div>
                            <Link href="/ops/applications">
                                <Button variant="ghost" size="sm">
                                    View All
                                    <ArrowRight className="h-4 w-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        {pendingApps && pendingApps.length > 0 ? (
                            <div className="space-y-3">
                                {pendingApps.slice(0, 5).map((app) => (
                                    <ApplicationCard
                                        key={app.id}
                                        id={app.id}
                                        companyName={app.company_name}
                                        category={app.category}
                                        status={app.status}
                                        submittedAt={app.submitted_at}
                                        applicantName={app.user?.full_name}
                                    />
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<CheckCircle2 className="h-8 w-8" />}
                                title="All caught up!"
                                description="No pending applications to review."
                            />
                        )}
                    </CardContent>
                </Card>
                
                {/* Open Disputes */}
                <Card className="border shadow-[0_2px_15px_rgba(0,0,0,0.03)] overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-status-error-light/60 to-transparent border-b">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-status-error-light rounded-lg">
                                    <AlertTriangle className="h-4 w-4 text-status-error" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">Open Disputes</CardTitle>
                                    <CardDescription>Disputes requiring attention</CardDescription>
                                </div>
                            </div>
                            <Badge variant="secondary">{openDisputes?.length || 0} open</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        {openDisputes && openDisputes.length > 0 ? (
                            <div className="space-y-3">
                                {openDisputes.slice(0, 5).map((dispute) => (
                                    <div 
                                        key={dispute.id}
                                        className="p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors border"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-sm truncate">
                                                        {dispute.order?.order_number || 'Unknown Order'}
                                                    </span>
                                                    <Badge variant={
                                                        dispute.status === 'open' ? 'destructive' :
                                                        dispute.status === 'under_review' ? 'default' :
                                                        'secondary'
                                                    }>
                                                        {dispute.status.replace('_', ' ')}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {dispute.reason}
                                                </p>
                                                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {formatDistanceToNow(new Date(dispute.created_at), { addSuffix: true })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<CheckCircle2 className="h-8 w-8" />}
                                title="No open disputes"
                                description="All disputes have been resolved."
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
            
            {/* Recent Activity */}
            <Card className="border shadow-[0_2px_15px_rgba(0,0,0,0.03)] overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-muted/80 to-transparent border-b">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-lg">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                            <CardTitle className="text-base">Recent Activity</CardTitle>
                            <CardDescription>Latest admin actions</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6">
                    {recentActivity && recentActivity.length > 0 ? (
                        <div className="space-y-1">
                            {recentActivity.map((activity) => (
                                <div 
                                    key={activity.id}
                                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted transition-colors text-sm"
                                >
                                    <div className="p-1.5 rounded-lg bg-muted">
                                        {getActivityIcon(activity.action)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-foreground font-medium">
                                            {formatActivityAction(activity.action)}
                                        </span>
                                        <span className="text-muted-foreground mx-1">
                                            on {activity.entity_type.replace('_', ' ')}
                                        </span>
                                        {activity.admin_name && (
                                            <span className="text-muted-foreground">
                                                by {activity.admin_name}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon={<Clock className="h-8 w-8" />}
                            title="No recent activity"
                            description="Admin actions will appear here."
                        />
                    )}
                </CardContent>
            </Card>
            
            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/ops/applications" className="group">
                    <Card className="h-full border hover:border-international-orange/40 hover:shadow-md transition-all duration-200 cursor-pointer">
                        <CardContent className="p-5 flex items-start gap-4">
                            <div className="p-2.5 bg-international-orange-light rounded-lg group-hover:bg-international-orange-light/70 transition-colors">
                                <ClipboardList className="h-5 w-5 text-international-orange" />
                            </div>
                            <div>
                                <p className="font-medium text-foreground group-hover:text-international-orange transition-colors">Review Applications</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Manage supplier applications and approvals</p>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/ops/health" className="group">
                    <Card className="h-full border hover:border-status-success/40 hover:shadow-md transition-all duration-200 cursor-pointer">
                        <CardContent className="p-5 flex items-start gap-4">
                            <div className="p-2.5 bg-status-success-light rounded-lg group-hover:bg-status-success-light/70 transition-colors">
                                <Activity className="h-5 w-5 text-status-success" />
                            </div>
                            <div>
                                <p className="font-medium text-foreground group-hover:text-status-success transition-colors">System Health</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Monitor platform health and performance</p>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/ops/analytics" className="group">
                    <Card className="h-full border hover:border-status-info/40 hover:shadow-md transition-all duration-200 cursor-pointer">
                        <CardContent className="p-5 flex items-start gap-4">
                            <div className="p-2.5 bg-status-info-light rounded-lg group-hover:bg-status-info-light/70 transition-colors">
                                <BarChart3 className="h-5 w-5 text-status-info" />
                            </div>
                            <div>
                                <p className="font-medium text-foreground group-hover:text-status-info transition-colors">Analytics</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Platform-wide metrics and insights</p>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    )
}

function getActivityIcon(action: string) {
    if (action.includes('approve')) return <CheckCircle2 className="h-4 w-4 text-status-success" />
    if (action.includes('reject')) return <XCircle className="h-4 w-4 text-destructive" />
    return <RefreshCw className="h-4 w-4 text-muted-foreground" />
}

function formatActivityAction(action: string): string {
    return action
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}
