import { createAdminClient } from "../src/lib/supabase/admin";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const supabase = createAdminClient();
    
    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', 'test-founder@fractionalforge.app')
        .single();
        
    const userId = profile.id;
    const foundryId = "test-foundry-pipeline";
    
    console.log(`Adding User ${userId} to Foundry ${foundryId}`);
    
    const { error } = await supabase
        .from('foundry_memberships')
        .insert({
            user_id: userId,
            foundry_id: foundryId,
            role: 'Founder'
        });
        
    if (error) {
        console.error("Failed to add membership:", error);
    } else {
        console.log("Successfully added membership!");
    }
}
main();
