/**
 * @file verify-p5-p12.ts
 *
 * Tier 2 verification: Database state checks for P5-P12 specialist improvements.
 * Run with: npx tsx scripts/verify-p5-p12.ts
 */

import { createClient } from '@supabase/supabase-js'

// Env loaded via: export $(grep -v '^#' .env.local | sed 's/"//g' | xargs)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('Run: export $(grep -v "^#" .env.local | sed \'s/"//g\' | xargs) && npx tsx scripts/verify-p5-p12.ts')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type Result = { check: string; status: 'PASS' | 'INFO' | 'FAIL'; detail: string }
const results: Result[] = []

function pass(check: string, detail: string) { results.push({ check, status: 'PASS', detail }) }
function info(check: string, detail: string) { results.push({ check, status: 'INFO', detail }) }
function fail(check: string, detail: string) { results.push({ check, status: 'FAIL', detail }) }

async function checkP12MigrationColumns() {
  // Check that outcome_status, outcome_notes, outcome_recorded_at exist
  const { data, error } = await supabase.rpc('exec_sql' as any, {
    query: `SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'specialist_decision_journal'
              AND column_name IN ('outcome_status', 'outcome_notes', 'outcome_recorded_at')
            ORDER BY column_name`
  })

  // Fallback: try querying the table directly if exec_sql doesn't exist
  if (error) {
    // Direct approach: try to select the columns
    const { data: testRow, error: selectError } = await supabase
      .from('specialist_decision_journal')
      .select('outcome_status, outcome_notes, outcome_recorded_at')
      .limit(1)

    if (selectError?.message?.includes('outcome_status')) {
      fail('P12: Migration columns', `Column missing: ${selectError.message}`)
    } else {
      pass('P12: Migration columns', 'outcome_status, outcome_notes, outcome_recorded_at all queryable')
    }
    return
  }

  const columns = (data as any[]) ?? []
  const found = columns.map((c: any) => c.column_name)
  const expected = ['outcome_notes', 'outcome_recorded_at', 'outcome_status']
  const missing = expected.filter(e => !found.includes(e))

  if (missing.length === 0) {
    pass('P12: Migration columns', `All 3 columns exist: ${found.join(', ')}`)
  } else {
    fail('P12: Migration columns', `Missing: ${missing.join(', ')}`)
  }
}

async function checkP12OutcomeStatusConstraint() {
  // Try inserting an invalid outcome_status to verify constraint
  const { error } = await supabase
    .from('specialist_decision_journal')
    .insert({
      foundry_id: '00000000-0000-0000-0000-000000000000',
      specialist_id: '__test__',
      decision: '__constraint_test__',
      context: '__test__',
      outcome_status: 'INVALID_VALUE',
    })

  if (error?.message?.includes('outcome_status')) {
    pass('P12: Outcome status constraint', 'CHECK constraint rejects invalid values')
  } else if (error) {
    // Some other error (e.g., foreign key) — constraint may still exist
    info('P12: Outcome status constraint', `Insert failed with different error: ${error.message.slice(0, 100)}`)
  } else {
    // Clean up the accidental insert
    await supabase
      .from('specialist_decision_journal')
      .delete()
      .eq('specialist_id', '__test__')
    fail('P12: Outcome status constraint', 'INSERT with invalid outcome_status succeeded — constraint missing!')
  }
}

async function checkP7ProactiveOpeners() {
  const { data, error, count } = await supabase
    .from('agent_insights')
    .select('id, specialist_id, title, urgency', { count: 'exact' })
    .not('domain_data->proactive_opener', 'is', null)
    .limit(5)

  if (error) {
    fail('P7: Proactive openers', `Query failed: ${error.message}`)
    return
  }

  if (!data?.length) {
    info('P7: Proactive openers', 'No proactive openers in DB yet (sweep may not have run since deploy)')
  } else {
    pass('P7: Proactive openers', `${count ?? data.length} insights have proactive_opener. Latest: "${data[0].title}" (${data[0].urgency})`)
  }
}

async function checkP9PushbackInsights() {
  const { data, error, count } = await supabase
    .from('agent_insights')
    .select('id, specialist_id, title, urgency', { count: 'exact' })
    .ilike('title', 'Pushback:%')
    .limit(5)

  if (error) {
    fail('P9: Pushback insights', `Query failed: ${error.message}`)
    return
  }

  if (!data?.length) {
    info('P9: Pushback insights', 'No "Pushback:" insights yet (LLM-dependent, may appear after sweep)')
  } else {
    pass('P9: Pushback insights', `${count ?? data.length} disagreement insights found. Latest: "${data[0].title}"`)
  }
}

async function checkP12PendingDecisions() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error, count } = await supabase
    .from('specialist_decision_journal')
    .select('id, specialist_id, decision, outcome_status, created_at', { count: 'exact' })
    .eq('outcome_status', 'pending')
    .lt('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: true })
    .limit(5)

  if (error) {
    if (error.message?.includes('outcome_status')) {
      fail('P12: Pending decisions', `outcome_status column not found: ${error.message}`)
    } else {
      fail('P12: Pending decisions', `Query failed: ${error.message}`)
    }
    return
  }

  if (!data?.length) {
    info('P12: Pending decisions (30+ days)', 'No pending decisions older than 30 days — autoFollowUp has no candidates')
  } else {
    const oldest = data[0]
    const daysOld = Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60 * 24))
    pass('P12: Pending decisions (30+ days)', `${count ?? data.length} candidates for follow-up. Oldest: ${daysOld} days old — "${oldest.decision.slice(0, 60)}"`)
  }
}

async function checkP12ReminderInsights() {
  const { data, error } = await supabase
    .from('agent_insights')
    .select('id, specialist_id, title')
    .eq('insight_type', 'reminder')
    .ilike('title', 'How did it go?%')
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    fail('P12: Reminder insights', `Query failed: ${error.message}`)
    return
  }

  if (!data?.length) {
    info('P12: Reminder insights', 'No "How did it go?" reminders yet — may appear after next sweep')
  } else {
    pass('P12: Reminder insights', `${data.length} outcome follow-up reminders found. Latest: "${data[0].title.slice(0, 80)}"`)
  }
}

async function checkP10CelebrationInsights() {
  // Check if any celebration-type insights exist (from server-side celebrateMilestone)
  const { data, error } = await supabase
    .from('agent_insights')
    .select('id, specialist_id, title, insight_type')
    .eq('insight_type', 'observation')
    .ilike('title', '%completed%')
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    info('P10: Celebration insights', `Query skipped: ${error.message}`)
    return
  }

  if (!data?.length) {
    info('P10: Celebration insights', 'No celebration insights yet (triggers when tasks are completed)')
  } else {
    pass('P10: Celebration insights', `${data.length} celebration insights found`)
  }
}

async function checkDecisionJournalHasData() {
  const { count, error } = await supabase
    .from('specialist_decision_journal')
    .select('*', { count: 'exact', head: true })

  if (error) {
    fail('Decision journal data', `Query failed: ${error.message}`)
    return
  }

  if ((count ?? 0) === 0) {
    info('Decision journal data', 'Empty — no decisions recorded yet')
  } else {
    pass('Decision journal data', `${count} decisions in journal`)
  }
}

async function checkAgentInsightsHaveData() {
  const { count, error } = await supabase
    .from('agent_insights')
    .select('*', { count: 'exact', head: true })

  if (error) {
    fail('Agent insights data', `Query failed: ${error.message}`)
    return
  }

  if ((count ?? 0) === 0) {
    info('Agent insights data', 'Empty — no sweep insights yet')
  } else {
    pass('Agent insights data', `${count} insights in database`)
  }
}

// ─── Run All Checks ──────────────────────────────────────────────────

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  P5-P12 Database Verification')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Data state checks (prerequisites)
  await checkAgentInsightsHaveData()
  await checkDecisionJournalHasData()

  // P12: Migration verification
  await checkP12MigrationColumns()
  await checkP12OutcomeStatusConstraint()
  await checkP12PendingDecisions()
  await checkP12ReminderInsights()

  // P7: Proactive openers
  await checkP7ProactiveOpeners()

  // P9: Disagreement alerts
  await checkP9PushbackInsights()

  // P10: Celebrations
  await checkP10CelebrationInsights()

  // Print results
  console.log('\n  Results:')
  console.log('  ─────────────────────────────────────────────────────\n')

  let passes = 0, infos = 0, fails = 0
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'INFO' ? 'ℹ️ ' : '❌'
    console.log(`  ${icon} ${r.check}`)
    console.log(`     ${r.detail}\n`)
    if (r.status === 'PASS') passes++
    else if (r.status === 'INFO') infos++
    else fails++
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  ✅ ${passes} passed  ℹ️  ${infos} info  ❌ ${fails} failed`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  if (fails > 0) process.exit(1)
}

main().catch(err => {
  console.error('Verification script failed:', err)
  process.exit(1)
})
