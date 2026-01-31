import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0"

// Mock Google Sheets Logic for MVP (since we don't have real Service Accounts in this env)
// Real implementation would use `https://googleapis.deno.dev/v1/sheets:v4` or similar.

// SECURITY: Validate UUID format
function isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(str)
}

serve(async (req) => {
  // SECURITY: Verify authorization header
  const authHeader = req.headers.get('Authorization')
  const expectedToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
      })
  }

  // SECURITY: Validate required environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseUrl || !supabaseKey) {
      console.error('[sheets-sync] Missing required environment variables')
      return new Response(JSON.stringify({ error: 'Service configuration error' }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
      })
  }

  try {
    const payload = await req.json()
    
    // SECURITY: Validate payload structure
    if (!payload || typeof payload !== 'object' || !payload.record) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        })
    }
    
    const { record } = payload
    const foundry_id = record.foundry_id

    if (!foundry_id) {
      return new Response(JSON.stringify({ error: 'No foundry_id' }), { status: 400 })
    }

    // SECURITY: Validate foundry_id format (could be UUID or string identifier)
    if (typeof foundry_id !== 'string' || foundry_id.length > 100) {
      return new Response(JSON.stringify({ error: 'Invalid foundry_id' }), { status: 400 })
    }

    // 1. Fetch Configuration (Sheet ID)
    // We use the Service Role client to bypass RLS and read encryption secrets if needed
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

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
    console.error('[sheets-sync] Error:', error instanceof Error ? error.message : 'Unknown error')
    // SECURITY: Don't expose internal error details to clients
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
    })
  }
})
