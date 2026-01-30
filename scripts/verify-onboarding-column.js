const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Security: Load credentials from environment variables, never hardcode
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPlease set these in your .env file or environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
  console.log('Checking if onboarding_data column exists...\n');
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id, onboarding_data')
    .limit(1);
  
  if (error) {
    console.log('❌ COLUMN DOES NOT EXIST');
    console.log('Error:', error.message);
    console.log('\n📋 You need to run the SQL in Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/jyarhvinengfyrwgtskq/sql\n');
    console.log('SQL to run:');
    console.log('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT \'{}\'::jsonb NOT NULL;');
    process.exit(1);
  } else {
    console.log('✅ Column EXISTS!');
    console.log('Sample data:', data);
    console.log('\nYou can now run: npm run build');
  }
}

verify();
