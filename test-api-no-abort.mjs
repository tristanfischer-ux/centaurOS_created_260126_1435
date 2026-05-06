import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const secret = '8ef9d110cb97f8f00d6954517d6561cf9eaf984a9b7397da788a3205f865a1a4'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
await supabase.from('cad_lab_projects').update({
  autopilot_state: { stage: 'waiting_chase', status: 'awaiting_gate', attempts: 0 }
}).eq('id', '89f37321-cec4-4f05-b06a-6d01965f4976')
await supabase.from('pipeline_runs').delete().eq('project_id', '89f37321-cec4-4f05-b06a-6d01965f4976')

console.log("Fetching without abort...")
try {
  const start = Date.now()
  const res = await fetch('http://localhost:3001/api/autopilot-step', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ projectId: '89f37321-cec4-4f05-b06a-6d01965f4976', step: 'waitForChase' })
  })
  console.log("Returned in", Date.now() - start, "ms")
  console.log("Status:", res.status)
  const text = await res.text()
  console.log("Body:", text)
} catch (err) {
  console.log("Error:", err.message)
}
