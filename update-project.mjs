import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
await supabase.from('cad_lab_projects').update({
  autopilot_state: { stage: 'waiting_chase', status: 'awaiting_gate', attempts: 0 }
}).eq('id', '89f37321-cec4-4f05-b06a-6d01965f4976')
console.log("Updated")
