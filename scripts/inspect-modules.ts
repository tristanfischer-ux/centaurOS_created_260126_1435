import { createAdminClient } from "../src/lib/supabase/admin";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createAdminClient();
    const projectId = "cf0933a5-ca1d-4d46-8aa4-6aeac4b0d0c7";
    
    const { data, error } = await supabase
        .from('cad_lab_projects')
        .select('modules')
        .eq('id', projectId)
        .single();
        
    console.log(JSON.stringify(data, null, 2));
}
main();
