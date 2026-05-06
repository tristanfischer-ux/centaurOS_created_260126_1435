import { createAdminClient } from './src/lib/supabase/admin';

async function run() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('cad_lab_projects')
    .select('*')
    .limit(1);
    
  if (error) console.error(error);
  else console.log(Object.keys(data[0] || {}));
}

run().catch(console.error);
