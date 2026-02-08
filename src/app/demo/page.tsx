import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TestTube2, ArrowRight, User, Briefcase, GraduationCap, Building2, Factory, BookOpen, Network, Users } from 'lucide-react'

const DEMO_ROLES = [
  {
    id: 'founder',
    name: 'Founder',
    description: 'Test the founder onboarding flow with pre-filled startup details',
    icon: User,
    email: 'demo.founder@centauros.io',
    password: 'DemoFounder2026!'
  },
  {
    id: 'executive',
    name: 'Executive',
    description: 'Test the executive cadre application with fractional expertise profile',
    icon: Briefcase,
    email: 'demo.executive@centauros.io',
    password: 'DemoExecutive2026!'
  },
  {
    id: 'apprentice',
    name: 'Apprentice',
    description: 'Test the Guild entry flow for Founder-in-Training apprentices',
    icon: GraduationCap,
    email: 'demo.apprentice@centauros.io',
    password: 'DemoApprentice2026!'
  },
  {
    id: 'vc',
    name: 'Venture Capital',
    description: 'Test the VC application flow with firm and AUM details',
    icon: Building2,
    email: 'demo.vc@centauros.io',
    password: 'DemoVC2026!'
  },
  {
    id: 'supplier',
    name: 'Supplier / Factory',
    description: 'Test marketplace supplier onboarding with manufacturing capabilities',
    icon: Factory,
    email: 'demo.supplier@centauros.io',
    password: 'DemoSupplier2026!'
  },
  {
    id: 'university',
    name: 'University',
    description: 'Test academic partnership application with institution details',
    icon: BookOpen,
    email: 'demo.university@centauros.io',
    password: 'DemoUniversity2026!'
  },
  {
    id: 'network',
    name: 'Network Partner',
    description: 'Test network partner application for infrastructure providers',
    icon: Network,
    email: 'demo.network@centauros.io',
    password: 'DemoNetwork2026!'
  },
  {
    id: 'general',
    name: 'General Signup',
    description: 'Test the general signup flow without a specific role',
    icon: Users,
    email: 'demo.general@centauros.io',
    password: 'DemoGeneral2026!'
  }
]

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-violet-100 flex items-center justify-center">
              <TestTube2 className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Demo Account Testing</h1>
              <p className="text-muted-foreground">Pre-populated accounts for quick onboarding flow testing</p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <Card className="border-violet-200 bg-violet-50">
          <CardHeader>
            <CardTitle className="text-violet-900 flex items-center gap-2">
              <TestTube2 className="h-5 w-5" />
              How to Use Demo Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-violet-800">
            <p>
              <strong>1.</strong> Click any role below to open the signup page with pre-populated fields
            </p>
            <p>
              <strong>2.</strong> All form fields will be automatically filled with demo data
            </p>
            <p>
              <strong>3.</strong> Just click the submit button to test the complete onboarding flow
            </p>
            <p className="text-xs text-violet-600 mt-4 pt-3 border-t border-violet-200">
              Note: Demo accounts are already created in Supabase with confirmed emails, so the flows will work immediately.
            </p>
          </CardContent>
        </Card>

        {/* Demo Roles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {DEMO_ROLES.map(role => {
            const Icon = role.icon
            return (
              <Card key={role.id} className="border hover:border-violet-300 transition-colors">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-violet-600" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-lg">{role.name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {role.description}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-xs bg-muted p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <code className="text-foreground font-mono">{role.email}</code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Password:</span>
                      <code className="text-foreground font-mono">{role.password}</code>
                    </div>
                  </div>
                  
                  <Link href={`/join/${role.id}?demo=true`} className="block">
                    <Button className="w-full" variant="default">
                      Test {role.name} Flow
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Quick Links */}
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-base">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/">
              <Button variant="outline" size="sm">Marketing Home</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm">Login Page</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="sm">Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
