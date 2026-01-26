import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TaskCard } from '@/app/tasks/task-card'

export default async function MemberPage({ params }: { params: { id: string } }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return <div className="p-8 text-red-500">Unauthenticated</div>

    // Fetch Profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', params.id)
        .single()

    if (!profile) return notFound()

    // Fetch Assigned Tasks
    const { data: tasks } = await supabase
        .from('tasks')
        .select('*, assignee:assignee_id(id, full_name, role)')
        .eq('assignee_id', profiles.id)
        .order('created_at', { ascending: false })

    // Fetch Stats (Mocked for now or simple count)
    const completedCount = tasks?.filter(t => t.status === 'Accepted').length || 0
    const pendingCount = tasks?.filter(t => t.status === 'Pending').length || 0

    // Get Current Viewer Role for TaskCard permissions
    const { data: viewerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const viewerRole = viewerProfile?.role

    return (
        <div className="space-y-8">
            {/* Header Profile */}
            <div className="flex items-start gap-6">
                <Avatar className="h-24 w-24 border-4 border-white shadow-lg">
                    <AvatarFallback className="text-2xl font-bold bg-slate-900 text-white">
                        {profile.full_name?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold text-slate-900">{profile.full_name}</h1>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-slate-600 bg-slate-50">
                            {profile.role}
                        </Badge>
                        <span className="text-sm text-slate-500">ID: {profile.id}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                        {profile.email}
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Tasks Completed</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-green-600">{completedCount}</div></CardContent>
                </Card>
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Pending</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-amber-600">{pendingCount}</div></CardContent>
                </Card>
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Efficiency</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-blue-600">98%</div></CardContent>
                </Card>
            </div>

            {/* Assignments */}
            <Tabs defaultValue="tasks" className="w-full">
                <TabsList className="bg-slate-100">
                    <TabsTrigger value="tasks">Assigned Tasks ({tasks?.length})</TabsTrigger>
                    <TabsTrigger value="activity">Activity Log</TabsTrigger>
                </TabsList>
                <TabsContent value="tasks" className="mt-6">
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {tasks?.map(task => (
                            <TaskCard key={task.id} task={task} currentUserId={user.id} userRole={viewerRole} />
                        ))}
                        {tasks?.length === 0 && (
                            <p className="col-span-full text-center text-slate-400 py-8">No tasks assigned.</p>
                        )}
                    </div>
                </TabsContent>
                <TabsContent value="activity">
                    <p className="text-center text-slate-400 py-8">Activity log coming soon.</p>
                </TabsContent>
            </Tabs>
        </div>
    )
}
