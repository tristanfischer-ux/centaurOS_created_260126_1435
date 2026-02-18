import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main(): Promise<void> {
  console.log("Creating step_templates table via RPC...")

  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS step_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        subcategory TEXT,
        description TEXT,
        source_repo TEXT NOT NULL,
        source_path TEXT NOT NULL,
        license TEXT NOT NULL,
        step_url TEXT,
        stl_url TEXT,
        thumbnail_url TEXT,
        file_size_bytes INTEGER,
        tags TEXT[] DEFAULT '{}',
        is_assembly BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}',
        foundry_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_step_templates_category ON step_templates(category);
      CREATE INDEX IF NOT EXISTS idx_step_templates_subcategory ON step_templates(subcategory);
      CREATE INDEX IF NOT EXISTS idx_step_templates_tags ON step_templates USING gin(tags);
      CREATE INDEX IF NOT EXISTS idx_step_templates_source ON step_templates(source_repo);
      ALTER TABLE step_templates ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'step_templates' AND policyname = 'Anyone can view step templates') THEN
          CREATE POLICY "Anyone can view step templates" ON step_templates FOR SELECT USING (true);
        END IF;
      END $$;
    `,
  })

  if (error) {
    console.log("RPC exec_sql not available, trying direct table test...")

    const { error: testError } = await supabase
      .from("step_templates")
      .select("id")
      .limit(1)

    if (testError && testError.message.includes("does not exist")) {
      console.log("Table doesn't exist. Creating via PostgREST workaround...")
      console.log(
        "Please run this SQL in the Supabase Dashboard SQL Editor:",
      )
      console.log("  Dashboard > SQL Editor > New Query")
      console.log(
        "  Paste contents of: supabase/migrations/20260218200000_step_template_library.sql",
      )

      console.log("\nAlternatively, trying to insert a test record...")
    } else if (testError) {
      console.error("Unexpected error:", testError.message)
    } else {
      console.log("Table step_templates already exists!")
    }
  } else {
    console.log("Table created successfully!")
  }

  // Test if table exists by trying to read from it
  const { data, error: readError } = await supabase
    .from("step_templates")
    .select("id")
    .limit(1)

  if (readError) {
    console.error("Table check failed:", readError.message)
    if (readError.message.includes("does not exist")) {
      console.log("\nTable needs to be created manually.")
      console.log("Run this in the Supabase SQL Editor:")
      console.log(
        "  File: supabase/migrations/20260218200000_step_template_library.sql",
      )
    }
  } else {
    console.log(`Table exists. Current rows: ${data?.length ?? 0}`)
  }
}

main().catch(console.error)
