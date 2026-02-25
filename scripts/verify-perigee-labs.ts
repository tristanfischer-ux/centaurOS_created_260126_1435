import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const FOUNDER = 'f8bc159f-aeb1-4765-be2a-9341198833e7'

async function main() {
  const checks: [string, Promise<{ count?: number | null; data?: unknown; error?: unknown }>][] = [
    ['foundry',          sb.from('foundries').select('name').eq('id','perigee-labs').single()],
    ['team_members',     sb.from('foundry_memberships').select('*',{count:'exact',head:true}).eq('foundry_id','perigee-labs')],
    ['budgets',          sb.from('finance_budgets').select('*',{count:'exact',head:true}).eq('foundry_id','perigee-labs')],
    ['expenses',         sb.from('finance_expenses').select('*',{count:'exact',head:true}).eq('foundry_id','perigee-labs')],
    ['projects',         sb.from('finance_projects').select('*',{count:'exact',head:true}).eq('foundry_id','perigee-labs')],
    ['project_txns',     sb.from('finance_project_transactions').select('*',{count:'exact',head:true})],
    ['funding',          sb.from('finance_funding_opportunities').select('*',{count:'exact',head:true}).eq('foundry_id','perigee-labs')],
    ['invoices',         sb.from('finance_standalone_invoices').select('*',{count:'exact',head:true}).eq('foundry_id','perigee-labs')],
    ['cost_items',       sb.from('money_map_cost_items').select('*',{count:'exact',head:true}).eq('foundry_id','perigee-labs')],
    ['revenue_streams',  sb.from('money_map_revenue_streams').select('*',{count:'exact',head:true}).eq('foundry_id','perigee-labs')],
    ['objectives',       sb.from('objectives').select('*',{count:'exact',head:true}).eq('foundry_id','perigee-labs')],
    ['balance_txns',     sb.from('balance_transactions').select('*',{count:'exact',head:true}).eq('user_id',FOUNDER)],
    ['cash_balance',     sb.from('account_balances').select('balance_amount').eq('user_id',FOUNDER).single()],
  ]

  const results = await Promise.all(checks.map(([, p]) => p))

  console.log('\n╔══════════════════════════════════════╗')
  console.log('║  Perigee Labs — Data Verification    ║')
  console.log('╠══════════════════════════════════════╣')
  checks.forEach(([label], i) => {
    const r = results[i]
    const val = (r as any).data?.name
      ?? (r as any).data?.balance_amount
      ?? (r as any).count
    const err = (r as any).error?.message
    const display = label === 'cash_balance'
      ? `£${((val ?? 0) / 100).toLocaleString()}`
      : val
    console.log(`║  ${label.padEnd(18)} ${String(display ?? '—').padEnd(10)} ${err ? '❌ '+err : '✓'}`)
  })
  console.log('╚══════════════════════════════════════╝')
}

main().then(() => process.exit(0)).catch(console.error)
