import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { 
    Users, 
    Settings, 
    Sparkles,
    ArrowRight,
    BarChart3,
    Shield
} from "lucide-react"

/**
 * Company Admin Hub
 * 
 * @description Landing page for Founders and Executives to manage their
 * company's foundry. Links to team management, settings, product updates,
 * and company-specific analytics.
 * 
 * @security Access restricted to Founder and Executive roles via the
 * admin layout's role check.
 */
export default async function CompanyAdminPage() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    // Fetch basic company stats
    let teamCount = 0
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single()
        
        if (profile?.foundry_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { count } = await (supabase as any)
                .from('foundry_memberships')
                .select('*', { count: 'exact', head: true })
                .eq('foundry_id', profile.foundry_id)
            
            teamCount = count || 0
        }
    }
    
    return (
        <div className="space-y-8">
            {/* Hub Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Team Management */}
                <Link href="/team" className="group">
                    <Card className="h-full border hover:border-international-orange/40 hover:shadow-md transition-all duration-200 cursor-pointer">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="p-2.5 bg-orange-100 rounded-lg group-hover:bg-orange-200/70 transition-colors">
                                    <Users className="h-5 w-5 text-international-orange" />
                                </div>
                                {teamCount > 0 && (
                                    <Badge variant="secondary">{teamCount} members</Badge>
                                )}
                            </div>
                            <CardTitle className="text-lg group-hover:text-international-orange transition-colors">
                                Team Management
                            </CardTitle>
                            <CardDescription>
                                Invite members, assign roles, and manage your team
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center text-sm text-muted-foreground group-hover:text-international-orange transition-colors">
                                Manage team
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                
                {/* Company Settings */}
                <Link href="/settings" className="group">
                    <Card className="h-full border hover:border-electric-blue/40 hover:shadow-md transition-all duration-200 cursor-pointer">
                        <CardHeader>
                            <div className="p-2.5 bg-blue-100 rounded-lg group-hover:bg-blue-200/70 transition-colors w-fit">
                                <Settings className="h-5 w-5 text-blue-600" />
                            </div>
                            <CardTitle className="text-lg group-hover:text-electric-blue transition-colors">
                                Company Settings
                            </CardTitle>
                            <CardDescription>
                                Update company details, branding, and preferences
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center text-sm text-muted-foreground group-hover:text-electric-blue transition-colors">
                                Open settings
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                
                {/* What's New */}
                <Link href="/whats-new" className="group">
                    <Card className="h-full border hover:border-amber-400/40 hover:shadow-md transition-all duration-200 cursor-pointer">
                        <CardHeader>
                            <div className="p-2.5 bg-amber-100 rounded-lg group-hover:bg-amber-200/70 transition-colors w-fit">
                                <Sparkles className="h-5 w-5 text-amber-600" />
                            </div>
                            <CardTitle className="text-lg group-hover:text-amber-600 transition-colors">
                                What&apos;s New
                            </CardTitle>
                            <CardDescription>
                                Latest features, improvements, and product updates
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center text-sm text-muted-foreground group-hover:text-amber-600 transition-colors">
                                View updates
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    )
}
