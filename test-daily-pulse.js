/**
 * Test script to debug Daily Pulse issue
 */

const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testDailyPulse() {
  try {
    console.log('🔍 Testing Daily Pulse function...\n');
    
    // Get first profile with a foundry_id
    console.log('1. Fetching a profile with foundry_id...');
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, foundry_id, role')
      .not('foundry_id', 'is', null)
      .limit(1);
    
    if (profileError) {
      console.error('❌ Error fetching profile:', profileError);
      return;
    }
    
    if (!profiles || profiles.length === 0) {
      console.error('❌ No profiles with foundry_id found');
      return;
    }
    
    const profile = profiles[0];
    console.log(`✅ Found profile: ${profile.full_name} (${profile.id})`);
    console.log(`   Foundry ID: ${profile.foundry_id}`);
    console.log(`   Role: ${profile.role}\n`);
    
    // Test the get_daily_pulse function
    console.log('2. Calling get_daily_pulse function...');
    const { data, error } = await supabase
      .rpc('get_daily_pulse', {
        p_profile_id: profile.id,
        p_date: new Date().toISOString().split('T')[0]
      });
    
    if (error) {
      console.error('❌ Error calling get_daily_pulse:', error);
      console.error('   Message:', error.message);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
      return;
    }
    
    if (!data) {
      console.error('❌ Function returned null');
      return;
    }
    
    console.log('✅ Function returned data!\n');
    console.log('📊 Daily Pulse Data:');
    console.log('   Date:', data.date);
    console.log('   Personal tasks completed:', data.personal?.tasks_completed_count || 0);
    console.log('   Team tasks completed:', data.team?.total_completed || 0);
    console.log('   Tasks overdue:', data.personal?.tasks_overdue || 0);
    console.log('   Blockers:', data.blockers?.length || 0);
    console.log('   Pending approvals:', data.pending_approvals?.length || 0);
    console.log('\n✅ Daily Pulse function is working!');
    
    // Now test the report generation
    console.log('\n3. Testing report generation...');
    const { generateDailyPulseReport } = require('./src/lib/reports/daily-pulse.ts');
    
    const report = await generateDailyPulseReport(
      profile.id,
      profile.full_name?.split(' ')[0] || 'User',
      profile.role || 'Team Member'
    );
    
    if (!report) {
      console.error('❌ Report generation failed (returned null)');
      return;
    }
    
    console.log('✅ Report generated successfully!');
    console.log('   Summary:', report.summary?.substring(0, 100) + '...');
    console.log('   Trends count:', report.trends?.length || 0);
    console.log('   Insights count:', report.insights?.length || 0);
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    console.error('   Stack:', error.stack);
  }
}

testDailyPulse();
