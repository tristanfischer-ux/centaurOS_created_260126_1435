import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import Link from 'next/link'
import { CreateObjectiveDialog } from './create-objective-dialog' // Component we will create

export default async function ObjectivesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated. Please login.</div>
    }

    // We rely on RLS, but fetching requires the session to be present.
    const { data: objectives, error } = await supabase
        .from('objectives')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error(error)
        return <div className="text-red-500">Error loading objectives</div>
    }

    const count = objectives?.length || 0
    const maxObjectives = 10
    const usagePercentage = (count / maxObjectives) * 100

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Strategic Objectives</h1>
                    <p className="text-slate-500">High-level goals driving the Foundry.</p>
                </div>
                <CreateObjectiveDialog disabled={count >= maxObjectives} />
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 max-w-md shadow-sm">
                <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500">Capacity</span>
                    <span className={count >= maxObjectives ? "text-red-500 font-bold" : "text-amber-600"}>
                        {count} / {maxObjectives}
                    </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ${count >= maxObjectives ? 'bg-red-600' : 'bg-accent'}`}
                        style={{ width: `${usagePercentage}%` }}
                    />
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {objectives?.map((obj) => (
                    <Link href={`/objectives/${obj.id}`} key={obj.id} className="block group">
                        <Card className="bg-white border-slate-200 hover:border-amber-500 transition-all shadow-sm h-full flex flex-col">
                            <CardHeader>
                                <CardTitle className="text-xl text-slate-900 group-hover:text-amber-600 transition-colors">
                                    {obj.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <p className="text-slate-600 text-sm line-clamp-3">
                                    {obj.description || "No description provided."}
                                </p>
                            </CardContent>
                            <CardFooter className="text-xs text-slate-400 border-t border-slate-100 pt-4">
                                Created {new Date(obj.created_at!).toLocaleDateString()}
                            </CardFooter>
                        </Card>
                    </Link>
                ))}

                {count === 0 && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-500">
                        No objectives set. Define your mission.
                    </div>
                )}
            </div>
        </div>
    )
}
