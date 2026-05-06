import { createAdminClient } from "../src/lib/supabase/admin";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createAdminClient();
    const userId = "9423037e-b8dd-447e-a498-06c01cff3f0f";
    const foundryId = "test-foundry-pipeline";
    
    console.log("Checking EXACT row for User:", userId, "Foundry:", foundryId);
    
    // Use select with count to force a fresh DB check
    const { data, error, count } = await supabase
        .from('foundry_memberships')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .eq('foundry_id', foundryId);
        
    if (error) console.log("Error:", error);
    else console.log("Found rows:", data);
}
main();
