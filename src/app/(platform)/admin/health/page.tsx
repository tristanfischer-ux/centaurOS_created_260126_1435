import { getPlatformHealth } from "@/actions/admin"
import { HealthIndicator } from "@/components/admin/HealthIndicator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
    Database, 
    CreditCard, 
    AlertCircle,
    Activity,
    RefreshCw,
    Clock
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default async function PlatformHealthPage() {
    const { data: health, error } = await getPlatformHealth()
    
    if (error || !health) {
        return (
            <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load health data</h2>
                <p className="text-muted-foreground">{error}</p>
            </div>
        )
    }
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold text-foreground">
                    Platform Health
                </h2>
                <p className="text-sm text-muted-foreground">
                    System status and health indicators
                </p>
            </div>
            
            {/* Health Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Database Status */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Database className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Database</CardTitle>
                            </div>
                            <HealthIndicator
                                status={health.database.status}
                                label=""
                                size="sm"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Status</span>
                                <Badge variant={
                                    health.database.status === 'healthy' ? 'default' :
                                    health.database.status === 'degraded' ? 'secondary' :
                                    'destructive'
                                }>
                                    {health.database.status}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {health.database.message}
                            </p>
                        </div>
                    </CardContent>
                </Card>
                
                {/* Stripe Webhooks Status */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Stripe Webhooks</CardTitle>
                            </div>
                            <HealthIndicator
                                status={health.stripe.status}
                                label=""
                                size="sm"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Status</span>
                                <Badge variant={
                                    health.stripe.status === 'healthy' ? 'default' :
                                    health.stripe.status === 'degraded' ? 'secondary' :
                                    'destructive'
                                }>
                                    {health.stripe.status}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {health.stripe.message}
                            </p>
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                                <div>
                                    <p className="text-xs text-muted-foreground">Pending Events</p>
                                    <p className="text-lg font-semibold">{health.stripe.pendingEvents}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Failed Events</p>
                                    <p className={`text-lg font-semibold ${health.stripe.failedEvents > 0 ? 'text-destructive' : ''}`}>
                                        {health.stripe.failedEvents}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            {/* Metrics Overview */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-muted-foreground" />
                        <CardTitle>System Metrics</CardTitle>
                    </div>
                    <CardDescription>Key performance indicators</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="p-4 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 mb-2">
                                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Failed Payments</span>
                            </div>
                            <p className={`text-2xl font-bold ${health.failedPayments > 0 ? 'text-status-warning' : 'text-foreground'}`}>
                                {health.failedPayments}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Payments pending &gt; 24 hours
                            </p>
                        </div>
                        
                        <div className="p-4 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 mb-2">
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Webhook Backlog</span>
                            </div>
                            <p className={`text-2xl font-bold ${
                                (health.stripe.pendingEvents + health.stripe.failedEvents) > 20 
                                    ? 'text-status-warning' 
                                    : 'text-foreground'
                            }`}>
                                {health.stripe.pendingEvents + health.stripe.failedEvents}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Pending + failed events
                            </p>
                        </div>
                        
                        <div className="p-4 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Error Types</span>
                            </div>
                            <p className="text-2xl font-bold text-foreground">
                                {health.recentErrors.length}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Distinct error types tracked
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            {/* Recent Errors */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                        <CardTitle>Recent Error Log</CardTitle>
                    </div>
                    <CardDescription>Error metrics from platform monitoring</CardDescription>
                </CardHeader>
                <CardContent>
                    {health.recentErrors.length > 0 ? (
                        <div className="space-y-3">
                            {health.recentErrors.map((error, index) => (
                                <div 
                                    key={index}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <AlertCircle className={`h-4 w-4 ${error.count > 5 ? 'text-destructive' : 'text-status-warning'}`} />
                                        <div>
                                            <p className="font-medium text-sm">{error.type}</p>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3" />
                                                Last occurred {formatDistanceToNow(new Date(error.lastOccurred), { addSuffix: true })}
                                            </div>
                                        </div>
                                    </div>
                                    <Badge variant={error.count > 5 ? 'destructive' : 'secondary'}>
                                        {error.count} occurrences
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <Activity className="h-8 w-8 text-status-success mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">
                                No recent errors recorded
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
            
            {/* Health Summary */}
            <Card>
                <CardHeader>
                    <CardTitle>Health Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <HealthIndicator
                            status={health.database.status}
                            label="Database"
                            message={health.database.message}
                        />
                        <HealthIndicator
                            status={health.stripe.status}
                            label="Stripe Webhooks"
                            message={health.stripe.message}
                        />
                        <HealthIndicator
                            status={health.failedPayments > 5 ? 'critical' : health.failedPayments > 0 ? 'degraded' : 'healthy'}
                            label="Payment Processing"
                            message={`${health.failedPayments} stale payments`}
                        />
                        <HealthIndicator
                            status={health.recentErrors.length > 5 ? 'degraded' : 'healthy'}
                            label="Error Rate"
                            message={`${health.recentErrors.length} error types tracked`}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
