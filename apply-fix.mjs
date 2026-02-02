import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function applyFix() {
  try {
    console.log('🔧 Applying Daily Pulse fix to remote database...\n');
    
    const sql = readFileSync('fix-daily-pulse.sql', 'utf8');
    
    const { error } = await supabase.rpc('exec', { sql });
    
    if (error) {
      // Try alternative approach - split into statements
      console.log('⚠️ exec() not available, applying directly...\n');
      
      // For Supabase, we need to use the REST API to execute raw SQL
      const response = await fetch(`${url}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ query: sql })
      });
      
      if (!response.ok) {
        console.error('❌ Failed to apply fix:', await response.text());
        process.exit(1);
      }
    }
    
    console.log('✅ Fix applied successfully!\n');
    console.log('🧪 Testing the fixed function...\n');
    
    // Test the function
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .not('foundry_id', 'is', null)
      .limit(1);
    
    if (!profiles || profiles.length === 0) {
      console.log('⚠️ No profiles to test with');
      return;
    }
    
    const profile = profiles[0];
    const { data, error: testError } = await supabase
      .rpc('get_daily_pulse', {
        p_profile_id: profile.id,
        p_date: new Date().toISOString().split('T')[0]
      });
    
    if (testError) {
      console.error('❌ Function still has errors:', testError);
      process.exit(1);
    }
    
    console.log('✅ Function is working correctly!');
    console.log(`   Tested with profile: ${profile.full_name}`);
    console.log(`   Personal tasks completed: ${data.personal?.tasks_completed_count || 0}`);
    console.log(`   Team tasks completed: ${data.team?.total_completed || 0}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyFix();
