import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function ObjectiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()

    // Fetch Objective
    const { data: objective, error } = await supabase
        .from('objectives')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !objective) {
        return <div className="p-8 text-red-500">Objective not found.</div>
    }

    // Fetch Linked Tasks
    const { data: tasks } = await supabase
        .from('tasks')
        .select('*, assignee:profiles!assignee_id(id, full_name, role)')
        .eq('objective_id', id)
        .order('created_at', { ascending: false })

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            {/* Header / Back Link */}
            <div>
                <Link href="/objectives" className="text-sm text-slate-400 hover:text-slate-600 flex items-center mb-4 transition-colors">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back to Objectives
                </Link>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">{objective.title}</h1>
                <p className="text-lg text-slate-600 leading-relaxed max-w-3xl">{objective.description}</p>
                <div className="flex items-center gap-4 mt-4 text-sm text-slate-400">
                    <span>ID: {objective.id}</span>
                    <span>•</span>
                    <span>Created: {new Date(objective.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
            </div>

            {/* Tasks Section */}
            <div className="pt-8 mt-4">
                <h2 className="text-xl font-semibold text-slate-800 mb-6 flex items-center">
                    Associated Tasks
                    <Badge variant="secondary" className="ml-3 rounded-full">{tasks?.length || 0}</Badge>
                </h2>

                <div className="grid gap-4 md:grid-cols-2">
                    {tasks?.map((task) => (
                        <Card key={task.id} className="bg-white hover:shadow-lg transition-all">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <Badge variant={
                                        task.status === 'Accepted' ? 'default' :
                                            task.status === 'Completed' ? 'secondary' :
                                                task.status === 'Rejected' ? 'destructive' : 'secondary'
                                    } className="mb-2">
                                        {task.status}
                                    </Badge>
                                    {task.assignee?.role === 'AI_Agent' && (
                                        <Badge variant="secondary" className="border-purple-200 text-purple-600 bg-purple-50">
                                            🤖 AI Agent
                                        </Badge>
                                    )}
                                </div>
                                <CardTitle className="text-lg text-slate-900 leading-tight">
                                    {task.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2 mt-2">
                                    <UserAvatar
                                        name={task.assignee?.full_name}
                                        role={task.assignee?.role}
                                        size="sm"
                                    />
                                    <span className="text-sm text-slate-600">
                                        {task.assignee?.full_name}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {(!tasks || tasks.length === 0) && (
                        <div className="col-span-full py-12 text-center text-slate-400 bg-slate-100/50 rounded-lg">
                            No tasks linked to this objective yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
