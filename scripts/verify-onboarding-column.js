const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jyarhvinengfyrwgtskq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YXJodmluZW5nZnlyd2d0c2txIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQzMzU2NCwiZXhwIjoyMDg1MDA5NTY0fQ.A4FN045WPv9yTe8EIe--lGyrFT-bF5W1y24gA4dyj1A'
);

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
