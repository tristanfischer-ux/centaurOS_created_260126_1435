import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin/access'

/**
 * @file /studio layout — the concierge pipeline admin (§6.5)
 *
 * @description Tristan's board for the brief-intake pipeline. Auth =
 * Supabase Auth + the platform-admin check (admin_users table or
 * PLATFORM_SUPER_ADMIN_EMAIL), same gate as /ops.
 *
 * @security Non-admins are redirected away without revealing the area exists.
 */

export const dynamic = 'force-dynamic'

export default async function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  const hasAccess = await isAdmin(user.id)
  if (!hasAccess) redirect('/')

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-6 w-1 rounded-full bg-international-orange" />
            <Link href="/studio" className="font-bold tracking-tight">
              Studio — Dossier pipeline
            </Link>
          </div>
          <span className="text-xs text-muted-foreground">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
