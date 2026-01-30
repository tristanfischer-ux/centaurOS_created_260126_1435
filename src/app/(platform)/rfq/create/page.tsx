import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { RFQCreator } from '@/components/rfq/RFQCreator'

export const metadata = {
  title: 'Create RFQ | CentaurOS',
  description: 'Create a new request for quote',
}

export default async function CreateRFQPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="h-[calc(100vh-4rem)]">
      {/* Back button - fixed at top */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto py-3 px-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/rfq">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to RFQs
            </Link>
          </Button>
        </div>
      </div>

      {/* Full-width RFQ Creator with side-by-side preview */}
      <div className="h-[calc(100%-57px)]">
        <RFQCreator
          defaultPreviewOpen={true}
          showPreviewToggle={true}
        />
      </div>
    </div>
  )
}
