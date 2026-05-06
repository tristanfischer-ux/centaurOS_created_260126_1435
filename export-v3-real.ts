import fs from 'fs';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from './src/lib/supabase/admin';
import { ProjectPDFDocument } from './src/lib/pdf-v3/renderer/document';
import { hydrateAndCoerce } from './src/lib/pdf-v3/pipeline/01-hydration';
import { sanitizeText } from './src/lib/pdf-v3/pipeline/02-sanitization';
import { formatAndEnrich, assembleDocumentMeta } from './src/lib/pdf-v3/pipeline/03-enrichment';
import { extractAlerts } from './src/lib/pdf-v3/pipeline/04-business-rules';
import { PdfRenderData } from './src/lib/pdf-v3/types/render-contracts';
import { FORGE_GUILD_COHORT_IDS } from './src/lib/forge-v2/stage-scoring';

async function run() {
  console.log("Fetching real BESS project data using Admin Client...");
  const admin = createAdminClient();
  
  // Use the BESS project
  const projectId = '3acf3007-b720-400b-8dc4-818394df102d'; 
  
  const { data: project, error } = await admin
    .from('cad_lab_projects')
    .select('id, foundry_id, name, subject, modules, research, ai_cost_estimates, reviews, diagnostic_answers, design_revision, created_at, brief_locked_at, shipped_at, system_illustration_url, interior_overview_url, concept_render_url, dimension_sheet, spatial_plan, proofread_findings, feasibility_verdict, canonical_specs, canonical_specs_revision, parts(*)')
    .eq('id', projectId)
    .maybeSingle();

  if (error || !project) {
    console.error("Failed to fetch project:", error);
    process.exit(1);
  }
  
  console.log(`Found project: ${project.name}`);

  const research = (project.research || {}) as any;
  const designBrief = research.designBrief || {};
  const constraints = designBrief.constraints || {};
  const reviewsRaw = project.reviews || {};

  // Map modules and inject reviews
  const modules = project.modules ? Object.entries(project.modules).map(([id, m]: [string, any]) => {
    const rawModReviews = reviewsRaw[id] || [];
    const modReviews = Array.isArray(rawModReviews) ? rawModReviews : Object.values(rawModReviews);
    
    // In V3, reviews are inside the module object
    return {
      ...m,
      id,
      reviews: modReviews.map((r: any) => ({
        reviewer: r.reviewer || r.specialist || 'Specialist',
        verdict: r.verdict,
        summary: r.summary,
        issues: r.issues || [],
        recommendations: r.recommendations || [],
        reviewedAtIso: r.reviewedAt || r.reviewedAtIso
      }))
    };
  }) : [];

  // Build the raw object expected by V3 pipeline
  const raw = {
    project: {
      name: project.name,
      revision: 'v' + (project.design_revision || 1) + '.0',
      shipped: project.shipped_at != null,
      foundryName: 'Fractional Forge'
    },
    meta: {
      generatedAtIso: new Date().toISOString(),
      createdAtIso: project.created_at,
      shippedAtIso: project.shipped_at,
      briefLockedAtIso: project.brief_locked_at,
      systemIllustrationUrl: project.system_illustration_url,
      interiorOverviewUrl: project.interior_overview_url,
      designRevisionLetter: String.fromCharCode(64 + (project.design_revision || 1))
    },
    verdict: {
      ...project.feasibility_verdict,
      status: project.feasibility_verdict?.status?.toUpperCase() || 'UNREVIEWED',
      summary: project.feasibility_verdict?.summary || 'No verdict recorded',
      fails: project.feasibility_verdict?.fails || [],
      checkedConstraints: project.feasibility_verdict?.checkedConstraints || []
    },
    brief: {
      subject: project.subject,
      mission: designBrief.mission,
      useCase: designBrief.useCase,
      whyNow: designBrief.whyNow,
      targetCustomers: designBrief.targetCustomers,
      targetProcess: designBrief.targetProcess,
      targetMaterial: designBrief.targetMaterial,
      toleranceTarget: designBrief.toleranceTarget,
      quantityTarget: designBrief.quantityTarget,
      complianceNotes: designBrief.complianceNotes,
      unitCostCeilingGbp: constraints.unitCostCeilingGbp,
      maxMassKg: constraints.maxMassKg
    },
    regulatory: designBrief.regulatory || [],
    modules: modules,
    bom: project.parts || [],
    suppliers: project.supplier_shortlist ? (Array.isArray(project.supplier_shortlist) ? project.supplier_shortlist : Object.values(project.supplier_shortlist).flat()) : [],
    cost: project.ai_cost_estimates ? {
      unitTotalGbp: project.ai_cost_estimates.unitTotalGbp || null,
      ceilingGbp: project.ai_cost_estimates.ceilingGbp || null,
      perModule: Object.entries(project.ai_cost_estimates)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]: [string, any]) => ({
          moduleName: v.moduleName || k,
          totalGbp: v.totalPerUnit
        }))
    } : undefined,
    auditLog: []
  };

  const attributions = {
    brief: { source: 'llm', modelName: 'gemini-3.1-pro' },
    regulatory: { source: 'db' },
    modules: { source: 'db' },
    bom: { source: 'db' },
    cost: { source: 'db' },
    risks: { source: 'llm', modelName: 'gpt-5.4' },
    suppliers: { source: 'llm', modelName: 'deepseek-v4-flash' }
  };

  console.log("Running V3 Pipeline on REAL data...");
  const hydrated = hydrateAndCoerce(raw);
  const sanitized = sanitizeText(hydrated);
  const enriched = formatAndEnrich(sanitized);
  const alerts = extractAlerts(enriched);

  const { meta, totals } = assembleDocumentMeta(enriched, raw.meta, {
    moduleCount: hydrated.modules.length,
    keyPartCount: hydrated.modules.reduce((acc, m) => acc + (m.keyParts?.length || 0), 0),
    partRowCount: hydrated.bom.length,
    failureModeCount: hydrated.modules.reduce((acc, m) => acc + (m.failureModes?.length || 0), 0),
    unknownCount: hydrated.modules.reduce((acc, m) => acc + (m.unknowns?.length || 0), 0),
    regulatoryCount: hydrated.regulatory.length,
    supplierCount: hydrated.suppliers.length,
    reviewCount: hydrated.modules.reduce((acc, m) => acc + (m.reviews?.length || 0), 0)
  });

  const renderData: PdfRenderData = {
    project: enriched.project,
    meta,
    totals,
    brief: enriched.brief!,
    regulatory: enriched.regulatory!,
    verdict: enriched.verdict,
    alerts,
    modules: enriched.modules,
    bom: enriched.bom,
    suppliers: enriched.suppliers,
    costWaterfall: enriched.costWaterfall!,
    risks: enriched.risks!,
    auditLog: enriched.auditLog!,
    attributions: attributions as any
  };

  console.log("Rendering to PDF buffer...");
  const buffer = await renderToBuffer(React.createElement(ProjectPDFDocument as any, { data: renderData }) as any);
  
  const outputPath = 'bess-real-v3.pdf';
  fs.writeFileSync(outputPath, buffer);
  
  console.log(`Successfully generated ${outputPath}!`);
}

run().catch(console.error);