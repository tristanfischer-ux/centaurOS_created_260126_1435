import { runMaxDecompositionBackground } from "../src/actions/specialists/run-max-decomposition";
import { createAdminClient } from "../src/lib/supabase/admin";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log("Starting standalone Max pipeline...");
    
    const supabase = createAdminClient();
    
    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', 'test-founder@fractionalforge.app')
        .single();
        
    const userId = profile?.id;
    const foundryId = "test-foundry-pipeline";
    const projectId = "cf0933a5-ca1d-4d46-8aa4-6aeac4b0d0c7";
    
    console.log(`Using Project: ${projectId}`);
    
    // Clear out the pipeline_runs for this stage so we aren't blocked by dedup
    await supabase.from('cad_lab_pipeline_runs')
        .delete()
        .eq('project_id', projectId)
        .eq('stage', 'max.decomposition.seed');
    
    console.log("Calling runMaxDecompositionBackground...");
    try {
        const result = await runMaxDecompositionBackground(projectId, foundryId, userId, "manual");
        console.log("=== RESULT ===");
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("=== ERROR ===");
        console.error(e);
    }
}

main().catch(console.error);
