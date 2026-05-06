import { createAdminClient } from "../src/lib/supabase/admin";
import { saveCadLabModulesBackground } from "../src/actions/cad-lab-projects";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const projectId = "cf0933a5-ca1d-4d46-8aa4-6aeac4b0d0c7";
    const dummyModules = JSON.stringify([{ name: "test_module", purpose: "testing" }]);
    
    console.log("Calling saveCadLabModulesBackground...");
    const result = await saveCadLabModulesBackground(projectId, dummyModules);
    console.log("Result:", result);
    
    const supabase = createAdminClient();
    const { data } = await supabase.from('cad_lab_projects').select('modules').eq('id', projectId).single();
    console.log("Modules in DB:", data?.modules);
}

main();
