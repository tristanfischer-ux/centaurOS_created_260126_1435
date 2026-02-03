import { SupplierSidebar } from "@/components/supplier/SupplierSidebar"
import { SupplierMobileNav } from "@/components/supplier/SupplierMobileNav"
import { SupplierOnboardingModal } from "@/components/supplier/SupplierOnboardingModal"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { Suspense } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function SupplierPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch profile to verify account type
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, email, account_type")
    .eq("id", user.id)
    .single()

  if (profileError) {
    console.error("Failed to fetch user profile:", profileError.message)
  }

  // If user is not a supplier, redirect them to the main platform
  if (profile?.account_type !== "supplier") {
    redirect("/timeline")
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="flex">
          {/* Sidebar - Desktop */}
          <SupplierSidebar 
            userName={profile?.full_name || undefined}
            userEmail={profile?.email || user.email || undefined}
          />
          
          {/* Main Content Area */}
          <main className="flex-1 min-h-screen">
            <div className="p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </div>
        
        {/* Mobile Navigation */}
        <SupplierMobileNav />
        
        {/* Supplier Onboarding Modal */}
        <Suspense fallback={null}>
          <SupplierOnboardingModal />
        </Suspense>
      </div>
    </TooltipProvider>
  )
}
