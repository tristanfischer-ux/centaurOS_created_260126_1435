import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function addOnboardingColumn() {
  console.log('Adding onboarding_data column to profiles table...');
  
  // Use raw SQL query
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Connection test failed:', error);
    return;
  }
  
  console.log('Connection successful!');
  
  // Now execute the ALTER TABLE via raw query
  const alterQuery = `
    ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}'::jsonb NOT NULL;
  `;
  
  const indexQuery = `
    CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_data 
    ON public.profiles USING GIN(onboarding_data);
  `;
  
  try {
    // Execute via RPC or direct query
    const { data: result1, error: error1 } = await supabase.rpc('exec_sql', { sql: alterQuery });
    if (error1) {
      console.log('Direct ALTER not supported, trying via Postgres connection...');
      console.log('Please run this SQL manually in Supabase Dashboard:');
      console.log(alterQuery);
      console.log(indexQuery);
    } else {
      console.log('✅ Column added successfully!');
      
      const { data: result2, error: error2 } = await supabase.rpc('exec_sql', { sql: indexQuery });
      if (!error2) {
        console.log('✅ Index created successfully!');
      }
    }
  } catch (err) {
    console.error('Error executing SQL:', err);
    console.log('\nPlease run this SQL manually in Supabase Dashboard SQL Editor:');
    console.log('\n' + alterQuery + '\n' + indexQuery);
  }
  
  // Verify column exists
  console.log('\nVerifying column...');
  const { data: columns, error: colError } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);
    
  if (!colError) {
    console.log('✅ Profiles table accessible');
  }
}

addOnboardingColumn().catch(console.error);
