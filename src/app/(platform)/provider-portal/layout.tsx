import { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProviderProfile } from '@/actions/provider'
import { 
    LayoutDashboard, 
    User, 
    FileText, 
    Calendar, 
    Store, 
    CreditCard,
    BarChart3,
    Award,
    Settings,
    ShoppingCart,
    MessageCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProviderPortalLayoutProps {
    children: ReactNode
}

const navigation = [
    { name: 'Dashboard', href: '/provider-portal', icon: LayoutDashboard },
    { name: 'Profile', href: '/provider-portal/profile', icon: User },
    { name: 'My Listing', href: '/provider-portal/listing', icon: Store },
    { name: 'Case Studies', href: '/provider-portal/case-studies', icon: FileText },
    { name: 'Discovery Calls', href: '/provider-portal/discovery-calls', icon: Calendar },
    { name: 'Orders', href: '/provider-portal/orders', icon: ShoppingCart },
    { name: 'Messages', href: '/provider-portal/messages', icon: MessageCircle },
    { name: 'Portfolio', href: '/provider-portal/portfolio', icon: Award },
    { name: 'Certifications', href: '/provider-portal/certifications', icon: Award },
    { name: 'Pricing', href: '/provider-portal/pricing', icon: CreditCard },
    { name: 'Payments', href: '/provider-portal/payments', icon: CreditCard },
    { name: 'Tax', href: '/provider-portal/tax', icon: FileText },
    { name: 'Analytics', href: '/provider-portal/analytics', icon: BarChart3 },
]

export default async function ProviderPortalLayout({ children }: ProviderPortalLayoutProps) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect('/login')
    }
    
    // Check if user has a provider profile
    const { profile } = await getProviderProfile()
    
    // If no provider profile, show application prompt
    if (!profile) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
                <div className="text-center max-w-md">
                    <Store className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h1 className="text-2xl font-bold mb-2">Become a Provider</h1>
                    <p className="text-muted-foreground mb-6">
                        Apply to become a provider on the CentaurOS Marketplace and start receiving orders from founders.
                    </p>
                    <Link
                        href="/provider-portal/apply"
                        className="inline-flex items-center justify-center px-6 py-3 bg-international-orange text-white font-medium rounded-lg hover:bg-international-orange/90 transition-colors"
                    >
                        Apply to Become a Provider
                    </Link>
                </div>
            </div>
        )
    }
    
    return (
        <div className="flex min-h-[calc(100vh-4rem)]">
            {/* Sidebar */}
            <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:bg-background">
                <nav className="flex-1 p-4 space-y-1">
                    {navigation.map((item) => {
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                                    "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>
                
                {/* Public Profile Link */}
                {profile.profile_slug && (
                    <div className="p-4 border-t">
                        <Link
                            href={`/profile/${profile.profile_slug}`}
                            target="_blank"
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <User className="h-4 w-4" />
                            View Public Profile
                        </Link>
                    </div>
                )}
            </aside>
            
            {/* Main Content */}
            <main className="flex-1 p-6 lg:p-8 overflow-auto">
                {children}
            </main>
        </div>
    )
}
