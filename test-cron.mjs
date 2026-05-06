import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
await supabase.from('cad_lab_projects').update({
  autopilot_state: { stage: 'waiting_chase', status: 'awaiting_gate', attempts: 0 }
}).eq('id', '89f37321-cec4-4f05-b06a-6d01965f4976')
await supabase.from('pipeline_runs').delete().eq('project_id', '89f37321-cec4-4f05-b06a-6d01965f4976')

const secret = process.env.FORGE_RENDER_STAGE_SECRET

console.log("Fetching...")
try {
  const res = await fetch('http://localhost:3002/api/autopilot-step', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ projectId: '89f37321-cec4-4f05-b06a-6d01965f4976', step: 'waitForChase' }),
    signal: AbortSignal.timeout(200)
  })
  console.log("Status:", res.status)
} catch (err) {
  console.log("Error:", err.message)
}
