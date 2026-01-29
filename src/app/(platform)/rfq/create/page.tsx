import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { RFQCreateForm } from '@/components/rfq/RFQCreateForm'

export const metadata = {
  title: 'Create RFQ | CentaurOS',
  description: 'Create a new request for quote',
}

export default async function CreateRFQPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      {/* Back button */}
      <Button variant="ghost" asChild className="mb-6">
        <Link href="/rfq">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to RFQs
        </Link>
      </Button>

      {/* Form */}
      <RFQCreateForm />
    </div>
  )
}
