const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jyarhvinengfyrwgtskq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YXJodmluZW5nZnlyd2d0c2txIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQzMzU2NCwiZXhwIjoyMDg1MDA5NTY0fQ.A4FN045WPv9yTe8EIe--lGyrFT-bF5W1y24gA4dyj1A',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function applyMigrations() {
  console.log('Applying migrations to Supabase...\n');
  
  // SQL to execute
  const sql = `
    -- Create signup_intents table
    CREATE TABLE IF NOT EXISTS public.signup_intents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        intent_type TEXT NOT NULL,
        listing_id UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
        metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        fulfilled_at TIMESTAMPTZ DEFAULT NULL,
        
        CONSTRAINT valid_intent_type CHECK (
            intent_type IN (
                'book_listing',
                'view_listing',
                'contact_provider',
                'explore_marketplace',
                'join_guild',
                'create_rfq',
                'other'
            )
        )
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_signup_intents_user_id ON public.signup_intents(user_id);
    CREATE INDEX IF NOT EXISTS idx_signup_intents_listing_id ON public.signup_intents(listing_id) WHERE listing_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_signup_intents_type ON public.signup_intents(intent_type);
    CREATE INDEX IF NOT EXISTS idx_signup_intents_unfulfilled ON public.signup_intents(user_id, created_at) WHERE fulfilled_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_signup_intents_user_created ON public.signup_intents(user_id, created_at DESC);

    -- Enable RLS
    ALTER TABLE public.signup_intents ENABLE ROW LEVEL SECURITY;
  `;

  // Execute via REST API using fetch
  const response = await fetch('https://jyarhvinengfyrwgtskq.supabase.co/rest/v1/rpc/exec', {
    method: 'POST',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YXJodmluZW5nZnlyd2d0c2txIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQzMzU2NCwiZXhwIjoyMDg1MDA5NTY0fQ.A4FN045WPv9yTe8EIe--lGyrFT-bF5W1y24gA4dyj1A',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YXJodmluZW5nZnlyd2d0c2txIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQzMzU2NCwiZXhwIjoyMDg1MDA5NTY0fQ.A4FN045WPv9yTe8EIe--lGyrFT-bF5W1y24gA4dyj1A',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    console.log('❌ REST API method not available');
    console.log('Trying direct table creation...\n');
    
    // Try direct table check instead
    const { data: tables, error: tableError } = await supabase
      .from('signup_intents')
      .select('id')
      .limit(1);
    
    if (tableError && tableError.message.includes('does not exist')) {
      console.log('❌ signup_intents table does not exist');
      console.log('\n📋 Please run the SQL manually in Supabase Dashboard:');
      console.log('   https://supabase.com/dashboard/project/jyarhvinengfyrwgtskq/sql\n');
      console.log('Copy this SQL:\n');
      console.log(sql);
      process.exit(1);
    } else if (!tableError) {
      console.log('✅ signup_intents table already exists!');
    }
  } else {
    console.log('✅ Migrations applied successfully!');
  }
  
  // Verify
  console.log('\nVerifying tables...');
  const { data, error } = await supabase
    .from('signup_intents')
    .select('id')
    .limit(1);
  
  if (error) {
    console.log('❌ Verification failed:', error.message);
    console.log('\nYou need to run the SQL manually.');
    process.exit(1);
  } else {
    console.log('✅ All tables verified!');
    console.log('\nYou can now run: npm run build');
  }
}

applyMigrations().catch(console.error);
