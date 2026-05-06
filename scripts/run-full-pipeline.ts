import { createAdminClient } from "../src/lib/supabase/admin";
import { runChaseResearchBackground } from "../src/actions/specialists/run-chase-research";
import { runMaxDecompositionBackground } from "../src/actions/specialists/run-max-decomposition";
import { runFangSizingBackground } from "../src/actions/specialists/run-fang-sizing";
import { runFangLayoutBackground } from "../src/actions/specialists/run-fang-layout";
import { runBomGeneratorBackground } from "../src/actions/specialists/run-bom-generator";
import { runFinnCostBackground } from "../src/actions/specialists/run-finn-cost";
import { runSupplierDiscoveryBackground } from "../src/actions/forge-v2-supplier-discovery";
import { runFangReviewBackground } from "../src/actions/specialists/run-fang-review";
import { runProofreaderBackground } from "../src/actions/specialists/run-proofreader";
import { exportProjectPdfBackground } from "../src/actions/export-project-pdf";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log("=== STARTING FULL END-TO-END FORGEOS PIPELINE ===");
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
    console.log(`Using Foundry: ${foundryId}`);
    console.log(`Using User: ${userId}`);
    
    console.log("\n1. Updating project brief to Heat Pump...");
    const { data: updatedProject, error: updateError } = await supabase
        .from('cad_lab_projects')
        .update({
            subject: "Commercial Air-Source Heat Pump",
            founder_raw_brief: "A 500kW commercial air-source heat pump system designed to retrofit a mid-sized office building. The system provides high-efficiency heating and cooling year-round with a target COP of 3.5. Must fit on a standard 3m x 2m roof pad. Target unit cost is £30,000.",
            status: "draft",
            modules: null,
            dimension_sheet: null,
            spatial_plan: null,
            reviews: null,
            ai_cost_estimates: null,
            proofread_findings: null,
            feasibility_verdict: null
        })
        .eq('id', projectId)
        .select()
        .single();

    if (updateError || !updatedProject) {
        console.error("Failed to update test project:", updateError);
        return;
    }
    
    // Just clear out the pipeline_runs so we aren't blocked by dedup
    await supabase.from('cad_lab_pipeline_runs').delete().eq('project_id', projectId);
    
    try {
        console.log("\n[1/10] Chase (Research)...");
        await runChaseResearchBackground(projectId, foundryId, userId, "manual");
        
        console.log("\n[2/10] Max (Decomposition)...");
        await runMaxDecompositionBackground(projectId, foundryId, userId, "manual");
        
        console.log("\n[3/10] Fang (Sizing)...");
        const sizingRes = await runFangSizingBackground(projectId, foundryId, userId, "manual");
        if (!sizingRes.feasible) {
            console.error("Pipeline aborted: Design is INFEASIBLE.", sizingRes);
            return;
        }
        
        console.log("\n[4/10] Fang (Layout)...");
        await runFangLayoutBackground(projectId, foundryId, userId, "manual");
        
        console.log("\n[5/10] BOM Generator...");
        await runBomGeneratorBackground(projectId, foundryId, userId, "manual");
        
        console.log("\n[6/10] Finn (Cost)...");
        await runFinnCostBackground(projectId, foundryId, userId, "manual.rerun");
        
        console.log("\n[7/10] Supplier Discovery...");
        await runSupplierDiscoveryBackground(projectId, foundryId, "manual");
        
        console.log("\n[8/10] Fang (Reviews)...");
        await runFangReviewBackground(projectId, foundryId, userId, "manual");
        
        console.log("\n[9/10] Proofreader...");
        await runProofreaderBackground(projectId, foundryId, userId, "manual");
        
        console.log("\n[10/10] PDF Export...");
        // Bypassing illustration stage for this test to speed up execution
        const pdfRes = await exportProjectPdfBackground(projectId, foundryId);
        
        console.log("\n=== PIPELINE COMPLETE ===");
        console.log(`PDF Generated: ${pdfRes.filename} (${pdfRes.sizeBytes} bytes)`);
        
    } catch (e) {
        console.error("\n=== PIPELINE FAILED ===");
        console.error(e);
    }
}

main().catch(console.error);
