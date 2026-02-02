/**
 * End-to-end test for Daily Pulse feature
 */

const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testDailyPulseEndToEnd() {
  console.log('🧪 Testing Daily Pulse End-to-End\n');
  
  try {
    // 1. Get a test profile
    console.log('1️⃣ Fetching test profile...');
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, foundry_id, role')
      .not('foundry_id', 'is', null)
      .limit(1);
    
    if (profileError) {
      console.error('❌ Error fetching profile:', profileError);
      return false;
    }
    
    if (!profiles || profiles.length === 0) {
      console.error('❌ No profiles with foundry_id found');
      return false;
    }
    
    const profile = profiles[0];
    console.log(`✅ Using profile: ${profile.full_name} (${profile.role})`);
    console.log(`   Foundry: ${profile.foundry_id}\n`);
    
    // 2. Test the database function directly
    console.log('2️⃣ Testing get_daily_pulse database function...');
    const { data: pulseData, error: pulseError } = await supabase
      .rpc('get_daily_pulse', {
        p_profile_id: profile.id,
        p_date: new Date().toISOString().split('T')[0]
      });
    
    if (pulseError) {
      console.error('❌ Database function error:', pulseError.message);
      return false;
    }
    
    if (!pulseData) {
      console.error('❌ Function returned null');
      return false;
    }
    
    console.log('✅ Database function working');
    console.log(`   Date: ${pulseData.date}`);
    console.log(`   Personal tasks completed: ${pulseData.personal?.tasks_completed_count || 0}`);
    console.log(`   Team tasks completed: ${pulseData.team?.total_completed || 0}`);
    console.log(`   Tasks due today: ${pulseData.personal?.tasks_due_today || 0}`);
    console.log(`   Tasks overdue: ${pulseData.personal?.tasks_overdue || 0}`);
    console.log(`   Blockers: ${pulseData.blockers?.length || 0}`);
    console.log(`   Pending approvals: ${pulseData.pending_approvals?.length || 0}`);
    console.log(`   Active objectives: ${pulseData.objectives?.length || 0}\n`);
    
    // 3. Test that trends data is valid
    console.log('3️⃣ Validating trend data...');
    if (!pulseData.trends) {
      console.error('❌ Missing trends data');
      return false;
    }
    console.log(`✅ Trends data present`);
    console.log(`   Completed yesterday (personal): ${pulseData.trends.personal_completed_yesterday || 0}`);
    console.log(`   Completed yesterday (team): ${pulseData.trends.completed_yesterday || 0}\n`);
    
    // 4. Check data structure integrity
    console.log('4️⃣ Validating data structure...');
    const requiredKeys = ['date', 'foundry_id', 'personal', 'team', 'trends'];
    const missingKeys = requiredKeys.filter(key => !(key in pulseData));
    
    if (missingKeys.length > 0) {
      console.error('❌ Missing required keys:', missingKeys);
      return false;
    }
    console.log('✅ All required data fields present\n');
    
    // 5. Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL TESTS PASSED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 Daily Pulse Summary:');
    console.log(`   User: ${profile.full_name}`);
    console.log(`   Role: ${profile.role}`);
    console.log(`   Tasks completed today: ${pulseData.personal?.tasks_completed_count || 0}`);
    console.log(`   Team tasks today: ${pulseData.team?.total_completed || 0}`);
    console.log(`   Completion rate: ${pulseData.team?.completion_rate || 0}%`);
    
    if (pulseData.team?.top_completers && pulseData.team.top_completers.length > 0) {
      console.log(`\n   Top completers today:`);
      pulseData.team.top_completers.forEach((completer, idx) => {
        console.log(`   ${idx + 1}. ${completer.full_name}: ${completer.completed_count} tasks`);
      });
    }
    
    console.log('\n✨ The Daily Pulse feature is working correctly!');
    console.log('   You can now refresh the browser to see the widget.\n');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Test failed with exception:', error.message);
    console.error('   Stack:', error.stack);
    return false;
  }
}

// Run the test
testDailyPulseEndToEnd().then(success => {
  process.exit(success ? 0 : 1);
});
