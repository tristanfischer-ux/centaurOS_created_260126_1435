/**
 * Test Script: Create 10 tasks to verify notification trigger improvements
 * 
 * This script creates tasks assigned to a test user to verify that the
 * improved notification trigger creates proper notifications with:
 * - Assigner name
 * - Task title
 * - Direct link to task
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing credentials in .env.local')
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const TASK_TITLES = [
    'Review Q1 Financial Report',
    'Prepare Client Presentation',
    'Update Marketing Strategy',
    'Schedule Team Standup',
    'Finalize Contract Terms',
    'Research Competitor Pricing',
    'Draft Press Release',
    'Audit Security Policies',
    'Plan Product Launch',
    'Organize Customer Feedback'
]

async function testNotificationTasks() {
    console.log('🧪 Testing Notification Trigger Improvements')
    console.log('============================================\n')

    // 1. Get profiles to use for testing
    console.log('📋 Finding test users...')
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role, foundry_id')
        .limit(10)

    if (profileError || !profiles || profiles.length < 2) {
        console.error('❌ Error: Need at least 2 profiles to test notifications')
        console.error('   Run seed-dummy-data.ts first to create test users')
        process.exit(1)
    }

    // Find an assignee (preferably an Executive or Apprentice)
    const assignee = profiles.find(p => p.role === 'Executive' || p.role === 'Apprentice') || profiles[0]
    // Find a creator (different from assignee, preferably a Founder)
    const creator = profiles.find(p => p.id !== assignee.id && p.role === 'Founder') 
        || profiles.find(p => p.id !== assignee.id) 
        || profiles[0]
    
    const foundryId = assignee.foundry_id

    console.log(`   Creator:  ${creator.full_name} (${creator.role})`)
    console.log(`   Assignee: ${assignee.full_name} (${assignee.role})`)
    console.log(`   Foundry:  ${foundryId}\n`)

    // 2. Get an objective to link tasks to (optional)
    const { data: objectives } = await supabase
        .from('objectives')
        .select('id')
        .eq('foundry_id', foundryId)
        .limit(1)

    const objectiveId = objectives?.[0]?.id || null

    // 3. Create 10 test tasks
    console.log('📝 Creating 10 test tasks...\n')
    
    const createdTasks: { id: string; title: string }[] = []

    for (let i = 0; i < 10; i++) {
        const title = TASK_TITLES[i]
        
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .insert({
                title,
                description: `Test task #${i + 1} to verify notification trigger creates proper notifications with assigner name and task title.`,
                status: 'Pending',
                creator_id: creator.id,
                assignee_id: assignee.id,
                objective_id: objectiveId,
                foundry_id: foundryId,
                risk_level: ['Low', 'Medium', 'High'][i % 3],
                start_date: new Date().toISOString(),
            })
            .select('id, title')
            .single()

        if (taskError) {
            console.error(`   ❌ Task ${i + 1} failed: ${taskError.message}`)
        } else if (task) {
            createdTasks.push(task)
            console.log(`   ✅ Task ${i + 1}: "${title}"`)
        }
        
        // Small delay to ensure trigger fires properly
        await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`\n📬 Created ${createdTasks.length} tasks. Checking notifications...\n`)

    // 4. Wait a moment for triggers to complete
    await new Promise(resolve => setTimeout(resolve, 500))

    // 5. Check the notifications that were created
    const { data: notifications, error: notifError } = await supabase
        .from('notifications')
        .select('id, title, message, link, type, created_at')
        .eq('user_id', assignee.id)
        .eq('type', 'task_assigned')
        .order('created_at', { ascending: false })
        .limit(10)

    if (notifError) {
        console.error(`❌ Error fetching notifications: ${notifError.message}`)
    } else if (notifications && notifications.length > 0) {
        console.log('🔔 Recent Task Assignment Notifications:')
        console.log('─'.repeat(60))
        
        for (const notif of notifications) {
            console.log(`\n   Title:   ${notif.title}`)
            console.log(`   Message: ${notif.message || '(none)'}`)
            console.log(`   Link:    ${notif.link || '(none)'}`)
            console.log(`   Created: ${new Date(notif.created_at).toLocaleString()}`)
        }
        
        console.log('\n' + '─'.repeat(60))
        
        // Verify the format is correct
        const sample = notifications[0]
        const hasAssignerName = sample.title?.includes(creator.full_name)
        const hasTaskTitle = TASK_TITLES.some(t => sample.title?.includes(t))
        const hasTaskIdInLink = sample.link?.includes('taskId=')
        
        console.log('\n✅ Notification Quality Check:')
        console.log(`   ${hasAssignerName ? '✅' : '❌'} Contains assigner name: "${creator.full_name}"`)
        console.log(`   ${hasTaskTitle ? '✅' : '❌'} Contains task title`)
        console.log(`   ${hasTaskIdInLink ? '✅' : '❌'} Link includes taskId parameter`)
        
        if (hasAssignerName && hasTaskTitle && hasTaskIdInLink) {
            console.log('\n🎉 SUCCESS! Notification trigger is working correctly!')
        } else {
            console.log('\n⚠️  Some checks failed. The trigger may need review.')
        }
    } else {
        console.log('⚠️  No notifications found. The trigger may not have fired.')
    }

    // 6. Summary
    console.log('\n============================================')
    console.log('🧪 Test Complete!')
    console.log(`   Tasks created: ${createdTasks.length}`)
    console.log(`   Assignee: ${assignee.full_name}`)
    console.log('\n   Log in as the assignee to see notifications in the bell icon.')
    console.log('============================================\n')
}

testNotificationTasks().catch(console.error)
