import { createAdminClient } from './src/lib/supabase/admin';

async function run() {
  const admin = createAdminClient();
  const projectId = '3acf3007-b720-400b-8dc4-818394df102d'; // BESS project
  
  const { data, error } = await admin
    .from('cad_lab_projects')
    .select('brief, regulatory, modules, ai_cost_estimates, reviews')
    .eq('id', projectId)
    .maybeSingle();

  if (error) {
    console.error(error);
  } else {
    console.log("Brief present:", !!data?.brief);
    console.log("Regulatory length:", data?.regulatory?.length);
    console.log("Modules count:", data?.modules ? Object.keys(data.modules).length : 0);
    const mod0 = data?.modules ? Object.values(data.modules)[0] : null;
    console.log("Module keys:", mod0 ? Object.keys(mod0) : []);
    console.log("Cost present:", !!data?.ai_cost_estimates);
    console.log("Reviews present:", !!data?.reviews);
    if (data?.reviews) {
      console.log("Review keys:", Object.keys(data.reviews));
    }
  }
}

run().catch(console.error);