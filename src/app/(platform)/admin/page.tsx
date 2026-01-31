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
    RefreshCw
} from "lucide-react"

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                    icon={ClipboardList}
                    label="Pending Applications"
                    value={stats.pendingApplications}
                    variant={stats.pendingApplications > 5 ? 'warning' : 'default'}
                />
                <StatsCard
                    icon={AlertTriangle}
                    label="Open Disputes"
                    value={stats.openDisputes}
                    variant={stats.openDisputes > 0 ? 'danger' : 'default'}
                />
                <StatsCard
                    icon={RefreshCw}
                    label="Webhook Backlog"
                    value={stats.webhookBacklog}
                    variant={stats.webhookBacklog > 20 ? 'warning' : 'default'}
                />
                <StatsCard
                    icon={Activity}
                    label="Actions Today"
                    value={stats.recentActivityCount}
                />
            </div>
            
            {/* Platform Health Banner */}
            <Card className={stats.platformHealth === 'critical' 
                ? 'border-destructive bg-status-error-light' 
                : stats.platformHealth === 'degraded' 
                ? 'border-status-warning bg-status-warning-light'
                : ''
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
                        <Link href="/admin/health">
                            <Button variant="secondary" size="sm">
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
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Pending Applications</CardTitle>
                            </div>
                            <Link href="/admin/applications">
                                <Button variant="ghost" size="sm">
                                    View All
                                    <ArrowRight className="h-4 w-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                        <CardDescription>Supplier applications awaiting review</CardDescription>
                    </CardHeader>
                    <CardContent>
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
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Open Disputes</CardTitle>
                            </div>
                            <Badge variant="secondary">{openDisputes?.length || 0} open</Badge>
                        </div>
                        <CardDescription>Disputes requiring attention</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {openDisputes && openDisputes.length > 0 ? (
                            <div className="space-y-3">
                                {openDisputes.slice(0, 5).map((dispute) => (
                                    <div 
                                        key={dispute.id}
                                        className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
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
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        <CardTitle>Recent Activity</CardTitle>
                    </div>
                    <CardDescription>Latest admin actions</CardDescription>
                </CardHeader>
                <CardContent>
                    {recentActivity && recentActivity.length > 0 ? (
                        <div className="space-y-2">
                            {recentActivity.map((activity) => (
                                <div 
                                    key={activity.id}
                                    className="flex items-center gap-3 p-2 rounded text-sm"
                                >
                                    <div className="p-1.5 rounded bg-muted">
                                        {getActivityIcon(activity.action)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-foreground">
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
            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <Link href="/admin/applications">
                            <Button variant="secondary">
                                <ClipboardList className="h-4 w-4 mr-2" />
                                Review Applications
                            </Button>
                        </Link>
                        <Link href="/admin/health">
                            <Button variant="secondary">
                                <Activity className="h-4 w-4 mr-2" />
                                View System Health
                            </Button>
                        </Link>
                        <Link href="/admin/settings">
                            <Button variant="secondary">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Admin Settings
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
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
