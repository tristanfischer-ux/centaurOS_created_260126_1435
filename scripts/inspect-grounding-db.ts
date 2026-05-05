import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tables = ['material_properties', 'process_capabilities', 'marketplace_listings', 'design_standards'];
  for (const table of tables) {
    const { data, error, count } = await supabase.from(table).select('*', { count: 'exact' }).limit(3);
    console.log(`\n=== ${table} (${count} rows) ===`);
    if (error) console.log('ERROR:', error.message);
    else console.log(JSON.stringify(data, null, 2));
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
