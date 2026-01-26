import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0"

// Mock Google Sheets Logic for MVP (since we don't have real Service Accounts in this env)
// Real implementation would use `https://googleapis.deno.dev/v1/sheets:v4` or similar.



serve(async (req) => {
  try {
    const { record } = await req.json()
    const foundry_id = record.foundry_id

    if (!foundry_id) {
      return new Response(JSON.stringify({ error: 'No foundry_id' }), { status: 400 })
    }

    // 1. Fetch Configuration (Sheet ID)
    // We use the Service Role client to bypass RLS and read encryption secrets if needed
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Used to catch triggers
    )

    // Check for integration config
    const { data: integration } = await supabaseAdmin
      .from('foundry_integrations')
      .select('config')
      .eq('foundry_id', foundry_id)
      .eq('service_type', 'google_sheets')
      .single()

    // ALSO check Environment Variables as per prompt "pull... from Env Variables" fallback
    const envSheetId = Deno.env.get('SHEET_ID') // Global Sheet ID fallback
    const targetSheetId = integration?.config?.sheet_id || envSheetId

    if (!targetSheetId) {
      // console.log(`No Sheet ID configured for foundry ${foundry_id} or globally. Skipping.`)
      return new Response(JSON.stringify({ message: 'Skipped: No Sheet ID' }), { status: 200 })
    }

    // 2. Format Data for Sheets
    // const values = [
    //   Object.values(record).map(v => v === null ? '' : String(v))
    // ]

    // console.log(`Syncing to Sheet ${targetSheetId}:`, values)

    // 3. Push to Google Sheets (Mocked for this agent environment as we lack real GCP creds/keys)
    // In real prod:
    // const auth = await getGoogleAuthToken(Deno.env.get('GOOGLE_SERVICE_ACCOUNT'))
    // await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${table}!A1:append`, ...)

    return new Response(JSON.stringify({ message: "Sync successful (Mocked)" }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
