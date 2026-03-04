/**
 * Check Soldado Correspondence Data
 * 
 * Verifies if any conversations, messages, or advisory questions exist
 * for the Soldado account.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAIL = 'mark@soldado.uk'
const PASSWORD = 'Soldado2026!'

async function checkCorrespondence() {
  console.log('━'.repeat(60))
  console.log('  Checking Soldado Correspondence Data')
  console.log('━'.repeat(60))

  // Sign in
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })

  if (authError || !authData.user) {
    console.error('✗ Login failed:', authError?.message)
    process.exit(1)
  }

  console.log('\n✓ Logged in as:', authData.user.email)

  // Check conversations (via participants)
  console.log('\n1. Checking conversations...')
  const userId = authData.user.id
  
  const { data: participantConvs, error: partError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', userId)

  let convIds: string[] = []
  let conversations: any[] = []

  if (partError) {
    console.log(`   ✗ Error: ${partError.message}`)
  } else {
    convIds = participantConvs?.map(p => p.conversation_id) || []
    
    if (convIds.length > 0) {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('id, title, created_at')
        .in('id', convIds)

      if (convError) {
        console.log(`   ✗ Error: ${convError.message}`)
      } else {
        conversations = convData || []
        console.log(`   Found ${conversations.length} conversations`)
        conversations.forEach(conv => {
          console.log(`     - ${conv.title}`)
        })
      }
    } else {
      console.log('   Found 0 conversations')
    }
  }

  // Check messages (in user's conversations)
  console.log('\n2. Checking messages...')
  
  let messages: any[] = []
  
  if (convIds && convIds.length > 0) {
    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .select('id, content, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(5)

    if (msgError) {
      console.log(`   ✗ Error: ${msgError.message}`)
    } else {
      messages = msgData || []
      console.log(`   Found ${messages.length} messages (showing first 5)`)
      messages.forEach(msg => {
        const preview = msg.content.substring(0, 50)
        console.log(`     - ${preview}...`)
      })
    }
  } else {
    console.log('   No conversations to check messages in')
  }

  // Check task comments
  console.log('\n3. Checking task comments...')
  const { data: comments, error: commentError } = await supabase
    .from('task_comments')
    .select('id, content, created_at')
    .eq('foundry_id', 'soldado')
    .limit(5)

  if (commentError) {
    console.log(`   ✗ Error: ${commentError.message}`)
  } else {
    console.log(`   Found ${comments?.length || 0} task comments`)
    comments?.forEach(comment => {
      const preview = comment.content.substring(0, 50)
      console.log(`     - ${preview}...`)
    })
  }

  // Check advisory questions
  console.log('\n4. Checking advisory questions...')
  const { data: questions, error: questionError } = await supabase
    .from('advisory_questions')
    .select('id, title, created_at')
    .eq('foundry_id', 'soldado')

  if (questionError) {
    console.log(`   ✗ Error: ${questionError.message}`)
  } else {
    console.log(`   Found ${questions?.length || 0} advisory questions`)
    questions?.forEach(q => {
      console.log(`     - ${q.title}`)
    })
  }

  console.log('\n' + '━'.repeat(60))
  console.log('  Summary')
  console.log('━'.repeat(60))
  console.log(`  Conversations: ${conversations?.length || 0}`)
  console.log(`  Messages: ${messages?.length || 0}`)
  console.log(`  Task Comments: ${comments?.length || 0}`)
  console.log(`  Advisory Questions: ${questions?.length || 0}`)
  console.log('━'.repeat(60))

  if ((conversations?.length || 0) === 0) {
    console.log('\n⚠️  No correspondence data found for Soldado account.')
    console.log('   The seed script may not have included messaging data.')
  }
}

checkCorrespondence()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFatal error:', err)
    process.exit(1)
  })
