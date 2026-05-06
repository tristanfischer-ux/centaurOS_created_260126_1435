import { createAdminClient } from "../src/lib/supabase/admin";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createAdminClient();
    const foundryId = "test-foundry-pipeline";
    
    const { data: project, error } = await supabase
        .from('cad_lab_projects')
        .select('id, subject, status, foundry_id')
        .eq('foundry_id', foundryId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
    console.log(project);
    if (error) console.log(error);
}
main();
