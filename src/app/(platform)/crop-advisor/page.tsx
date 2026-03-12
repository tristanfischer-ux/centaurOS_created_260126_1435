/**
 * @file Crop Advisor Page
 *
 * @description Server component entry point for the crop planning advisor.
 * Routes suppliers to the scoring dashboard and buyers to the intent manager.
 *
 * @security Requires authentication via platform layout.
 * Account type determines which view is rendered.
 */

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CropAdvisorLoader } from "@/components/crop-advisor/CropAdvisorLoader"

interface CropAdvisorPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function CropAdvisorPage({ searchParams }: CropAdvisorPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirect=/crop-advisor")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .single()

  const params = await searchParams

  return (
    <div className="max-w-6xl mx-auto">
      <CropAdvisorLoader
        accountType={profile?.account_type || null}
        initialTab={params?.tab}
      />
    </div>
  )
}
