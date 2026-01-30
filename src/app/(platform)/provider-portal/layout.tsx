import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProviderProfile } from "@/actions/provider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
    LayoutDashboard, 
    User, 
    CreditCard, 
    Settings,
    ArrowRight,
    Store,
    FileSearch
} from "lucide-react"

const providerNavigation = [
    { name: "Dashboard", href: "/provider-portal", icon: LayoutDashboard },
    { name: "RFQs", href: "/rfq?tab=available", icon: FileSearch },
    { name: "Profile", href: "/provider-portal/profile", icon: User },
    { name: "Payments", href: "/provider-portal/payments", icon: CreditCard },
    { name: "Settings", href: "/provider-portal/settings", icon: Settings },
]

interface ProviderPortalLayoutProps {
    children: React.ReactNode
}

export default async function ProviderPortalLayout({ children }: ProviderPortalLayoutProps) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Check if user has a provider profile
    const { profile, error } = await getProviderProfile()

    // If no profile, show the "Become a Provider" CTA
    if (!profile) {
        return (
            <div className="max-w-2xl mx-auto py-12">
                <Card className="border-2 border-dashed">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-16 h-16 bg-international-orange/10 rounded-full flex items-center justify-center mb-4">
                            <Store className="h-8 w-8 text-international-orange" />
                        </div>
                        <CardTitle className="text-2xl">Become a Provider</CardTitle>
                        <CardDescription className="text-base mt-2">
                            Start selling your services on the CentaurOS Marketplace. 
                            Connect with foundries looking for your expertise.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                            <div className="p-4 rounded-lg bg-muted">
                                <div className="text-2xl font-bold text-international-orange">1</div>
                                <div className="text-sm text-muted-foreground mt-1">Apply to join</div>
                            </div>
                            <div className="p-4 rounded-lg bg-muted">
                                <div className="text-2xl font-bold text-international-orange">2</div>
                                <div className="text-sm text-muted-foreground mt-1">Get verified</div>
                            </div>
                            <div className="p-4 rounded-lg bg-muted">
                                <div className="text-2xl font-bold text-international-orange">3</div>
                                <div className="text-sm text-muted-foreground mt-1">Start earning</div>
                            </div>
                        </div>

                        <div className="space-y-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Access to a network of innovative foundries
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Secure payments through Stripe Connect
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Tools to manage your orders and availability
                            </div>
                        </div>

                        <div className="pt-4">
                            <Link href="/become-provider">
                                <Button className="w-full h-12 text-lg" size="lg">
                                    Start Your Application
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // User has a provider profile - show the portal with navigation
    return (
        <div className="flex flex-col lg:flex-row gap-6">
            {/* Provider Navigation Sidebar */}
            <aside className="lg:w-64 flex-shrink-0">
                <div className="lg:sticky lg:top-6 space-y-4">
                    <div className="flex items-center gap-3 px-3 py-2">
                        <div className="w-10 h-10 rounded-full bg-international-orange/10 flex items-center justify-center">
                            <Store className="h-5 w-5 text-international-orange" />
                        </div>
                        <div>
                            <h2 className="font-display text-sm font-semibold">Provider Portal</h2>
                            <p className="text-xs text-muted-foreground font-medium capitalize">
                                {profile.tier} tier
                            </p>
                        </div>
                    </div>

                    <nav className="space-y-1">
                        {providerNavigation.map((item) => (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg",
                                    "text-muted-foreground hover:bg-muted hover:text-foreground",
                                    "transition-colors"
                                )}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.name}
                            </Link>
                        ))}
                    </nav>

                    {/* Status indicators */}
                    <div className="px-3 pt-4 border-t space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Status</span>
                            <span className={cn(
                                "font-medium",
                                profile.is_active ? "text-green-600" : "text-amber-600"
                            )}>
                                {profile.is_active ? "Active" : "Paused"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Stripe</span>
                            <span className={cn(
                                "font-medium",
                                profile.stripe_onboarding_complete ? "text-green-600" : "text-amber-600"
                            )}>
                                {profile.stripe_onboarding_complete ? "Connected" : "Setup needed"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Orders</span>
                            <span className="font-medium">
                                {profile.current_order_count} / {profile.max_concurrent_orders}
                            </span>
                        </div>
                    </div>

                    {/* Back to marketplace link */}
                    <div className="px-3 pt-4">
                        <Link 
                            href="/marketplace" 
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            &larr; Back to Marketplace
                        </Link>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0">
                {children}
            </main>
        </div>
    )
}
