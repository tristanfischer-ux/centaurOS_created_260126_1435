import { createAdminClient } from "../src/lib/supabase/admin";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createAdminClient();
    
    // Find the latest project
    const { data: project, error: err } = await supabase
        .from('cad_lab_projects')
        .select('id, dimension_sheet')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
    if (err) {
        console.log("Error:", err);
        return;
    }
    
    const sheet = project?.dimension_sheet as any;
    console.log("Conflicts:");
    console.log(JSON.stringify(sheet?.conflicts, null, 2));
}
main();
