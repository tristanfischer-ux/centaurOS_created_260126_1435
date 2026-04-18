import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PitchPrepForm } from '@/components/pitch-prep'

export const metadata: Metadata = {
  title: 'Create Pitch Prep Request',
  description: 'Submit a pitch preparation request to get investor-ready',
}

export default async function CreatePitchPrepPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // INTENT: Pre-fill company_name and product_description from existing foundry data
  // so founders don't re-type what the app already knows. Product description pulls
  // from the most recently-updated product, if any. Falls through silently on any
  // query error — worst case the form stays empty, same as before.
  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  let companyName = ''
  let productDescription = ''
  if (profile?.foundry_id) {
    const [foundryRes, productRes] = await Promise.all([
      supabase.from('foundries').select('name').eq('id', profile.foundry_id).single(),
      supabase
        .from('products')
        .select('name, description')
        .eq('foundry_id', profile.foundry_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    companyName = foundryRes.data?.name ?? ''
    const product = productRes.data
    if (product) {
      productDescription = product.description
        ? `${product.name} — ${product.description}`
        : product.name
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <PitchPrepForm
        initialValues={{
          company_name: companyName,
          product_description: productDescription,
        }}
      />
    </div>
  )
}
