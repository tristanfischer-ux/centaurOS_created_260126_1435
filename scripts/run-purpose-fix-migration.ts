/**
 * One-off script to run the purpose RPC fix migration (DROP UUID overload) against
 * the linked Supabase database. Requires DATABASE_URL or SUPABASE_DB_URL in env
 * (e.g. from Supabase Dashboard > Project Settings > Database > Connection string).
 *
 * Usage: npx tsx scripts/run-purpose-fix-migration.ts
 */

import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const SQL = `DROP FUNCTION IF EXISTS update_foundry_purpose(UUID, JSONB);`

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL
  if (!url) {
    console.error(
      'Missing DATABASE_URL or SUPABASE_DB_URL. Get the connection string from:\n' +
        '  Supabase Dashboard > Project Settings > Database > Connection string (URI)\n' +
        'Then run: DATABASE_URL="postgresql://..." npx tsx scripts/run-purpose-fix-migration.ts'
    )
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: url })
  try {
    await client.connect()
    await client.query(SQL)
    console.log('Done. Dropped UUID overload of update_foundry_purpose.')
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
