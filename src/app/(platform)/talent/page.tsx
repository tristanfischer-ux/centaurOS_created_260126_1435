import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
    GraduationCap, 
    Users, 
    Search, 
    TrendingUp, 
    Award, 
    Clock, 
    Target, 
    Briefcase,
    ArrowRight,
    CheckCircle2,
    Lightbulb,
    Building2,
    UserPlus
} from 'lucide-react'

export const metadata = {
    title: 'Talent | CentaurOS',
    description: 'Find apprentices and manage training programs. Build your team with skilled talent from the CentaurOS Guild.'
}

export default async function TalentPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get user profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, foundry_id')
        .eq('id', user.id)
        .single()

    const isFounderOrExecutive = profile?.role === 'Founder' || profile?.role === 'Executive'
    const isApprentice = profile?.role === 'Apprentice'

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="pb-6 border-b border-slate-100">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                    <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                        Talent & Apprenticeships
                    </h1>
                </div>
                <p className="text-muted-foreground text-sm font-medium pl-4 max-w-2xl">
                    Build your team with skilled apprentices. Find talent, track their growth, and develop the next generation of professionals.
                </p>
            </div>

            {/* Why This Matters Section */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-international-orange" />
                    Why Apprenticeships Matter
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                    <Card className="bg-gradient-to-br from-orange-50 to-background border-orange-100">
                        <CardContent className="pt-6">
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                                    <TrendingUp className="h-5 w-5 text-international-orange" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground mb-1">Grow Your Team Affordably</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Apprentices bring fresh perspectives and enthusiasm at a fraction of senior hire costs. Invest in talent that grows with your company.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-blue-50 to-background border-blue-100">
                        <CardContent className="pt-6">
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                    <Target className="h-5 w-5 text-electric-blue" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground mb-1">Shape Skills to Your Needs</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Train apprentices in your specific workflows, tools, and culture. Build loyalty through investment in their development.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-status-success-light to-background border-status-success/30">
                        <CardContent className="pt-6">
                            <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-lg bg-status-success-light flex items-center justify-center shrink-0">
                                    <Award className="h-5 w-5 text-status-success" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground mb-1">Structured Learning Paths</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Track On-The-Job Training hours, complete learning modules, and earn certifications. Real progress, measurable outcomes.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>

            {/* Main Action Cards */}
            <section className="grid gap-6 md:grid-cols-2">
                {/* Guild - Find Talent */}
                <Card className="relative overflow-hidden group hover:shadow-lg transition-all hover:border-electric-blue">
                    <div className="absolute top-0 left-0 w-1 h-full bg-electric-blue" />
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                                <Search className="h-6 w-6 text-electric-blue" />
                            </div>
                            <Badge variant="secondary" className="bg-blue-50 text-electric-blue border-blue-200">
                                Browse Pool
                            </Badge>
                        </div>
                        <CardTitle className="text-xl mt-4">Find Apprentices</CardTitle>
                        <CardDescription className="text-sm">
                            Browse the Guild pool to discover pre-vetted apprentices ready to join your team
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CheckCircle2 className="h-4 w-4 text-status-success" />
                                <span>Browse available apprentices by skill and experience</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CheckCircle2 className="h-4 w-4 text-status-success" />
                                <span>View profiles, portfolios, and past work</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CheckCircle2 className="h-4 w-4 text-status-success" />
                                <span>Assign apprentices to specific projects</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CheckCircle2 className="h-4 w-4 text-status-success" />
                                <span>Connect with the broader CentaurOS community</span>
                            </div>
                        </div>
                        <Button asChild className="w-full group-hover:bg-electric-blue group-hover:text-white transition-colors">
                            <Link href="/guild">
                                Browse Guild Pool
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                {/* Apprenticeship Management */}
                <Card className="relative overflow-hidden group hover:shadow-lg transition-all hover:border-international-orange">
                    <div className="absolute top-0 left-0 w-1 h-full bg-international-orange" />
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
                                <GraduationCap className="h-6 w-6 text-international-orange" />
                            </div>
                            <Badge variant="secondary" className="bg-orange-50 text-international-orange border-orange-200">
                                {isApprentice ? 'Your Dashboard' : 'Manage Team'}
                            </Badge>
                        </div>
                        <CardTitle className="text-xl mt-4">
                            {isApprentice ? 'Your Apprenticeship' : 'Manage Apprenticeships'}
                        </CardTitle>
                        <CardDescription className="text-sm">
                            {isApprentice 
                                ? 'Track your progress, log OTJT hours, and complete learning modules'
                                : 'Enroll apprentices, track their progress, and mentor their development'
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            {isApprentice ? (
                                <>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Clock className="h-4 w-4 text-international-orange" />
                                        <span>Log your On-The-Job Training (OTJT) hours</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Target className="h-4 w-4 text-international-orange" />
                                        <span>Track skills progress and competency levels</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Award className="h-4 w-4 text-international-orange" />
                                        <span>Complete learning modules and earn certifications</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Users className="h-4 w-4 text-international-orange" />
                                        <span>Connect with your mentor for guidance</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <UserPlus className="h-4 w-4 text-international-orange" />
                                        <span>Enroll new apprentices in structured programs</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Clock className="h-4 w-4 text-international-orange" />
                                        <span>Review and approve OTJT hour submissions</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <TrendingUp className="h-4 w-4 text-international-orange" />
                                        <span>Monitor progress with skills gap analysis</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Award className="h-4 w-4 text-international-orange" />
                                        <span>Conduct reviews and sign off on competencies</span>
                                    </div>
                                </>
                            )}
                        </div>
                        <Button asChild variant="default" className="w-full bg-international-orange hover:bg-international-orange/90">
                            <Link href="/apprenticeship">
                                {isApprentice ? 'Go to Dashboard' : 'Manage Apprentices'}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </section>

            {/* How It Works Section */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-muted-foreground" />
                    How the Apprenticeship Program Works
                </h2>
                <Card className="bg-muted/30">
                    <CardContent className="pt-6">
                        <div className="grid gap-6 md:grid-cols-4">
                            <div className="text-center space-y-2">
                                <div className="h-12 w-12 rounded-full bg-electric-blue text-white flex items-center justify-center mx-auto text-lg font-bold">
                                    1
                                </div>
                                <h3 className="font-semibold text-foreground">Find Talent</h3>
                                <p className="text-sm text-muted-foreground">
                                    Browse the Guild pool for apprentices matching your needs
                                </p>
                            </div>
                            <div className="text-center space-y-2">
                                <div className="h-12 w-12 rounded-full bg-electric-blue text-white flex items-center justify-center mx-auto text-lg font-bold">
                                    2
                                </div>
                                <h3 className="font-semibold text-foreground">Enroll & Assign</h3>
                                <p className="text-sm text-muted-foreground">
                                    Enroll apprentices in programs and assign them to projects
                                </p>
                            </div>
                            <div className="text-center space-y-2">
                                <div className="h-12 w-12 rounded-full bg-electric-blue text-white flex items-center justify-center mx-auto text-lg font-bold">
                                    3
                                </div>
                                <h3 className="font-semibold text-foreground">Track Progress</h3>
                                <p className="text-sm text-muted-foreground">
                                    Monitor OTJT hours, module completion, and skill development
                                </p>
                            </div>
                            <div className="text-center space-y-2">
                                <div className="h-12 w-12 rounded-full bg-international-orange text-white flex items-center justify-center mx-auto text-lg font-bold">
                                    4
                                </div>
                                <h3 className="font-semibold text-foreground">Certify & Promote</h3>
                                <p className="text-sm text-muted-foreground">
                                    Sign off on competencies and help apprentices advance
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* For Apprentices Section */}
            {isApprentice && (
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-international-orange" />
                        Your Apprenticeship Journey
                    </h2>
                    <Card className="bg-gradient-to-r from-orange-50 to-background border-orange-100">
                        <CardContent className="pt-6">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div>
                                    <h3 className="font-semibold text-foreground mb-3">What You&apos;ll Learn</h3>
                                    <ul className="space-y-2 text-sm text-muted-foreground">
                                        <li className="flex items-start gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                                            <span>Real-world skills through hands-on project work</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                                            <span>Industry best practices from experienced mentors</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                                            <span>Professional communication and collaboration</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                                            <span>Portfolio-worthy work to showcase your abilities</span>
                                        </li>
                                    </ul>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground mb-3">Your Responsibilities</h3>
                                    <ul className="space-y-2 text-sm text-muted-foreground">
                                        <li className="flex items-start gap-2">
                                            <Clock className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                            <span>Log your OTJT hours weekly for accurate tracking</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Target className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                            <span>Complete assigned learning modules on time</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Users className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                            <span>Communicate regularly with your mentor</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Award className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                            <span>Prepare for competency reviews</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            )}

            {/* For Founders/Executives Section */}
            {isFounderOrExecutive && (
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-electric-blue" />
                        For Your Organization
                    </h2>
                    <Card className="bg-gradient-to-r from-blue-50 to-background border-blue-100">
                        <CardContent className="pt-6">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div>
                                    <h3 className="font-semibold text-foreground mb-3">Benefits of the Program</h3>
                                    <ul className="space-y-2 text-sm text-muted-foreground">
                                        <li className="flex items-start gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                                            <span>Access to pre-vetted, motivated talent</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                                            <span>Lower hiring costs than senior roles</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                                            <span>Train talent specific to your workflows</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                                            <span>Build loyalty through career investment</span>
                                        </li>
                                    </ul>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground mb-3">Your Role as Mentor</h3>
                                    <ul className="space-y-2 text-sm text-muted-foreground">
                                        <li className="flex items-start gap-2">
                                            <Target className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                            <span>Set clear learning objectives and milestones</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Clock className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                            <span>Review and approve OTJT hour submissions</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Users className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                            <span>Provide regular feedback and guidance</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Award className="h-4 w-4 text-electric-blue mt-0.5 shrink-0" />
                                            <span>Conduct competency reviews and sign-offs</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            )}
        </div>
    )
}
