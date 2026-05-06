import { runChaseResearchBackground } from "../src/actions/specialists/run-chase-research";
import { createAdminClient } from "../src/lib/supabase/admin";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log("Starting standalone Chase pipeline...");
    
    // We don't actually need to fetch the userId via listUsers if we can just query the profile
    const supabase = createAdminClient();
    
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', 'test-founder@fractionalforge.app')
        .single();
        
    if (profileError || !profile) {
        console.error("Failed to find user profile", profileError);
        return;
    }
    
    const userId = profile.id;
    const foundryId = "test-foundry-pipeline";
    const projectId = "cf0933a5-ca1d-4d46-8aa4-6aeac4b0d0c7";
    
    console.log(`Using Project: ${projectId}`);
    console.log(`Using Foundry: ${foundryId}`);
    console.log(`Using User: ${userId}`);
    
    // DO NOT RESET AUTOPILOT
    // Just clear out the pipeline_runs so we aren't blocked by dedup
    await supabase.from('cad_lab_pipeline_runs').delete().eq('project_id', projectId);
    
    console.log("Calling runChaseResearchBackground...");
    try {
        const result = await runChaseResearchBackground(projectId, foundryId, userId, "manual");
        console.log("=== RESULT ===");
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("=== ERROR ===");
        console.error(e);
    }
}

main().catch(console.error);
