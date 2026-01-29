import { Suspense } from "react"
import { getMigrationStats, getMigrationQueue, getMigrationCandidates } from "@/actions/migration"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MigrationStatsCard } from "@/components/admin/MigrationStats"
import { MigrationTable } from "@/components/admin/MigrationTable"
import { 
    ArrowUpRight,
    Database,
    Mail,
    CheckCircle2,
    Clock,
    XCircle,
    AlertTriangle,
    RefreshCw
} from "lucide-react"

function MigrationSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                ))}
            </div>
            <Skeleton className="h-64" />
        </div>
    )
}

async function MigrationContent() {
    const [
        { data: stats, error: statsError },
        { data: pendingQueue, total: pendingTotal },
        { data: invitedQueue, total: invitedTotal },
        { data: candidates }
    ] = await Promise.all([
        getMigrationStats(),
        getMigrationQueue({ status: 'pending', limit: 20 }),
        getMigrationQueue({ status: 'invited', limit: 20 }),
        getMigrationCandidates()
    ])
    
    if (statsError || !stats) {
        return (
            <div className="text-center py-12">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-red-600">{statsError || 'Failed to load migration data'}</p>
            </div>
        )
    }
    
    const candidatesWithEmail = candidates?.filter(c => c.hasEmail).length || 0
    const candidatesWithoutEmail = (candidates?.length || 0) - candidatesWithEmail
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Listing Migration</h1>
                    <p className="text-muted-foreground mt-1">
                        Transition existing marketplace listings to the transactional system
                    </p>
                </div>
                <Badge variant="outline" className="text-sm">
                    {stats.migrationRate}% migrated
                </Badge>
            </div>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <MigrationStatsCard
                    icon={Database}
                    label="Total Listings"
                    value={stats.totalListings}
                    variant="default"
                />
                <MigrationStatsCard
                    icon={Clock}
                    label="Pending"
                    value={stats.pendingCount}
                    variant={stats.pendingCount > 0 ? 'warning' : 'default'}
                />
                <MigrationStatsCard
                    icon={Mail}
                    label="Invited"
                    value={stats.invitedCount}
                    variant="default"
                />
                <MigrationStatsCard
                    icon={CheckCircle2}
                    label="Completed"
                    value={stats.completedCount}
                    variant="success"
                />
                <MigrationStatsCard
                    icon={XCircle}
                    label="Declined"
                    value={stats.declinedCount}
                    variant={stats.declinedCount > 0 ? 'danger' : 'default'}
                />
            </div>
            
            {/* Migration Progress Bar */}
            <Card>
                <CardContent className="pt-6">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Migration Progress</span>
                            <span className="font-medium">
                                {stats.completedCount} of {stats.totalListings} listings
                            </span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full flex">
                                <div 
                                    className="bg-green-500 transition-all"
                                    style={{ 
                                        width: `${(stats.completedCount / Math.max(stats.totalListings, 1)) * 100}%` 
                                    }}
                                />
                                <div 
                                    className="bg-blue-500 transition-all"
                                    style={{ 
                                        width: `${(stats.inProgressCount / Math.max(stats.totalListings, 1)) * 100}%` 
                                    }}
                                />
                                <div 
                                    className="bg-amber-500 transition-all"
                                    style={{ 
                                        width: `${(stats.invitedCount / Math.max(stats.totalListings, 1)) * 100}%` 
                                    }}
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                Completed
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                In Progress
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                Invited
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            {/* Candidates Summary */}
            {candidates && candidates.length > 0 && (
                <Card className="border-blue-200 bg-blue-50/30">
                    <CardContent className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-100">
                                <ArrowUpRight className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="font-medium text-blue-900">
                                    {candidates.length} listings not yet in migration queue
                                </p>
                                <p className="text-sm text-blue-700">
                                    {candidatesWithEmail} with contact email, {candidatesWithoutEmail} without
                                </p>
                            </div>
                        </div>
                        <Button variant="outline" className="border-blue-300 hover:bg-blue-100">
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Add to Queue
                        </Button>
                    </CardContent>
                </Card>
            )}
            
            {/* Migration Queue Tabs */}
            <Tabs defaultValue="pending" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="pending">
                        Pending ({pendingTotal})
                    </TabsTrigger>
                    <TabsTrigger value="invited">
                        Invited ({invitedTotal})
                    </TabsTrigger>
                    <TabsTrigger value="all">
                        All Records
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="pending">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Pending Invitations</CardTitle>
                            <CardDescription>
                                Listings that haven&apos;t been sent invitations yet
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <MigrationTable 
                                records={pendingQueue} 
                                showActions={['send_invite', 'archive']}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="invited">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Awaiting Signup</CardTitle>
                            <CardDescription>
                                Listings that have been invited but haven&apos;t completed signup
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <MigrationTable 
                                records={invitedQueue}
                                showActions={['resend_invite', 'archive']}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="all">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">All Migration Records</CardTitle>
                            <CardDescription>
                                Complete list of all migration tracking records
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <AllRecordsTable />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

async function AllRecordsTable() {
    const { data: allRecords } = await getMigrationQueue({ limit: 100 })
    
    return (
        <MigrationTable 
            records={allRecords}
            showActions={['resend_invite', 'force_migrate', 'archive']}
        />
    )
}

export default function MigrationAdminPage() {
    return (
        <Suspense fallback={<MigrationSkeleton />}>
            <MigrationContent />
        </Suspense>
    )
}
