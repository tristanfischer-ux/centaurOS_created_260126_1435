import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Mail, Briefcase, Shield, Award } from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { CompareToDialog } from './compare-to-dialog'

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()

    // Fetch profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single()

    if (!profile) {
        notFound()
    }

    // Fetch assigned tasks for this profile
    const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', profile.id)
        .order('created_at', { ascending: false })

    // Fetch ALL profiles for comparison feature
    const { data: allProfiles } = await supabase
        .from('profiles')
        .select('*')

    // Fetch ALL tasks for metrics calculation
    const { data: allTasks } = await supabase
        .from('tasks')
        .select('assignee_id, status')

    // Calculate metrics for ALL members (for comparison)
    const allMembersWithMetrics = allProfiles?.map(p => {
        const memberTasks = allTasks?.filter(t => t.assignee_id === p.id) || []
        return {
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            role: p.role,
            activeTasks: memberTasks.filter(t => t.status === 'Accepted').length,
            completedTasks: memberTasks.filter(t => t.status === 'Completed').length,
            pendingTasks: memberTasks.filter(t => t.status === 'Pending').length,
            rejectedTasks: memberTasks.filter(t => t.status === 'Rejected').length,
        }
    }) || []

    const currentMemberMetrics = allMembersWithMetrics.find(m => m.id === profile.id)!

    return (
        <div className="space-y-8">
            {/* Header / Profile Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex items-start gap-8">
                <div className="h-32 w-32 bg-slate-100 rounded-full flex items-center justify-center text-4xl border-4 border-slate-50 shadow-inner">
                    {profile.role === 'AI_Agent' ? '🤖' : '👤'}
                </div>
                <div className="flex-1">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">{profile.full_name}</h1>
                            <div className="flex items-center gap-2 mt-2 text-slate-500">
                                <Mail className="w-4 h-4" />
                                <span>{profile.email}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <CompareToDialog
                                currentMember={currentMemberMetrics}
                                allMembers={allMembersWithMetrics}
                            />
                            <Badge variant="outline" className="text-lg px-4 py-1 bg-slate-50">
                                {profile.role}
                            </Badge>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-6 mt-8 border-t border-slate-100 pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                <Briefcase className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-sm text-slate-500">Active Tasks</div>
                                <div className="font-semibold text-slate-900">{tasks?.filter(t => t.status === 'Accepted').length || 0}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                                <Shield className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-sm text-slate-500">Completed</div>
                                <div className="font-semibold text-slate-900">{tasks?.filter(t => t.status === 'Completed').length || 0}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                                <Award className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-sm text-slate-500">Reputation</div>
                                <div className="font-semibold text-slate-900">Good</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Task History */}
            <div>
                <h2 className="text-xl font-bold text-slate-900 mb-4">Task History</h2>
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    {tasks?.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">No tasks assigned yet.</div>
                    ) : (
                        tasks?.map(task => (
                            <div key={task.id} className="p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 flex justify-between items-center">
                                <div>
                                    <div className="font-medium text-slate-900">{task.title}</div>
                                    <div className="text-sm text-slate-500 truncate max-w-md">{task.description}</div>
                                </div>
                                <Badge variant="secondary">{task.status}</Badge>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
