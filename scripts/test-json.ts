import { createAdminClient } from "../src/lib/supabase/admin";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createAdminClient();
    const projectId = "cf0933a5-ca1d-4d46-8aa4-6aeac4b0d0c7";
    
    console.log("Testing how Supabase saves a JS object with undefined fields...");
    
    const testData = {
        field1: "hello",
        field2: undefined,
        field3: null
    };
    
    const { data, error } = await supabase
        .from('cad_lab_projects')
        .update({
            research: testData as any
        })
        .eq('id', projectId)
        .select('research');
        
    console.log("Update result:", data);
}
main();
