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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

dotenv.config({ path: '.env.local' });

async function main() {
    console.log("=== STARTING FULL END-TO-END BESS PIPELINE ===");
    const supabase = createAdminClient();
    
    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', 'test-founder@fractionalforge.app')
        .single();
        
    const userId = profile?.id;
    const foundryId = "test-foundry-pipeline";
    
    console.log("\n1. Updating existing project to a FEASIBLE BESS (1.2 MWh)...");
    
    const projectId = "cf0933a5-ca1d-4d46-8aa4-6aeac4b0d0c7";

    const { data: updatedProject, error: updateError } = await supabase
        .from('cad_lab_projects')
        .update({
            subject: "BESS 40ft Container (1.2 MWh Feasible)",
            founder_raw_brief: "A 40-foot containerised LFP battery energy storage system with 1.2 MWh capacity. Grid-tied commercial and industrial application with 6000+ cycle life target. External dimensions 12.192m x 2.438m x 2.896m. Target mass 35,000 kg. Target cost of goods sold £250,000. Target selling price £450,000. Markets: UK, EU, North America. Key competitors: BYD Cube, CATL EnerOne, Tesla Megapack. Operating temperature range -20C to +55C. 3-phase grid connection, 500kW charge/discharge rate. Safety certifications: UL 9540, IEC 62619, UN 38.3.",
            status: "draft",
            modules: null,
            dimension_sheet: null,
            spatial_plan: null,
            reviews: null,
            ai_cost_estimates: null,
            proofread_findings: null,
            feasibility_verdict: null,
            research: null,
            canonical_specs: {},
            autopilot_state: {
                stage: 'waiting_chase',
                status: 'manual_review',
                attempts: 1
            }
        })
        .eq('id', projectId)
        .select()
        .single();

    if (updateError || !updatedProject) {
        console.error("Failed to update project:", updateError);
        return;
    }
    
    console.log(`Using Project: ${projectId}`);
    
    // Clear pipeline runs
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
        await runFinnCostBackground(projectId, foundryId, userId, "manual");
        
        console.log("\n[7/10] Supplier Discovery...");
        await runSupplierDiscoveryBackground(projectId, foundryId, "manual");
        
        console.log("\n[8/10] Fang (Reviews)...");
        await runFangReviewBackground(projectId, foundryId, userId, "manual");
        
        console.log("\n[9/10] Proofreader...");
        await runProofreaderBackground(projectId, foundryId, userId, "manual");
        
        console.log("\n[10/10] PDF Export...");
        const pdfRes = await exportProjectPdfBackground(projectId, foundryId);
        
        if (pdfRes.ok && pdfRes.base64) {
            const outDir = path.join(os.homedir(), "Downloads", "forge-demos");
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
            const outPath = path.join(outDir, "BESS-1.2MWh-End-to-End.pdf");
            fs.writeFileSync(outPath, Buffer.from(pdfRes.base64, "base64"));
            console.log("\n✅ SUCCESS! PDF saved to:", outPath);
        } else {
            console.error("PDF generation failed:", pdfRes.error);
        }
        
    } catch (e) {
        console.error("\n=== PIPELINE FAILED ===");
        console.error(e);
    }
}

main().catch(console.error);
