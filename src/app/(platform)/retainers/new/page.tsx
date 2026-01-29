import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RetainerSetup } from '@/components/retainers'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Set Up Retainer | CentaurOS',
  description: 'Set up a new retainer agreement',
}

interface NewRetainerPageProps {
  searchParams: Promise<{
    providerId?: string
    listingId?: string
  }>
}

export default async function NewRetainerPage({ searchParams }: NewRetainerPageProps) {
  const { providerId, listingId } = await searchParams

  // Must have a provider ID
  if (!providerId) {
    redirect('/marketplace?category=People')
  }

  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Verify provider exists
  const { data: provider, error } = await supabase
    .from('provider_profiles')
    .select('id, user_id, is_active')
    .eq('id', providerId)
    .single()

  if (error || !provider) {
    notFound()
  }

  // Can't create retainer with yourself
  if (provider.user_id === user.id) {
    redirect('/retainers')
  }

  return (
    <div className="container max-w-3xl py-8">
      {/* Back Button */}
      <Button variant="ghost" className="mb-6" asChild>
        <Link href={listingId ? `/marketplace/${listingId}` : '/marketplace'}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to {listingId ? 'Listing' : 'Marketplace'}
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Set Up Retainer Agreement</h1>
        <p className="text-muted-foreground mt-1">
          Create an ongoing retainer with weekly billing
        </p>
      </div>

      {/* Retainer Setup Form */}
      <RetainerSetup
        providerId={providerId}
        listingId={listingId}
        onCancel={() => {}}
      />
    </div>
  )
}
