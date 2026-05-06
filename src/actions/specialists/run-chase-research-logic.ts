import { runCadLabResearch } from "@/actions/cad-lab"
import { saveCadLabResearch } from "@/actions/cad-lab-projects"
import {
    consumeRemediationContext,
    buildRemediationPromptBlock,
} from "@/lib/forge-v2/stage-gates/remediation"
import { getCouncilFeedbackForStage } from "@/lib/forge-v2/stage-scoring"
import {
    completePipelineRun,
    failPipelineRun,
    loadLatestRunForStage,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { sweepStalledRuns } from "@/actions/pipeline-runs-watchdog"
import { callAI, callOpenAI } from "@/lib/cad-lab/api-helpers"
import { checkAILimit } from "@/lib/ai/limit-check"
import type {
    CadLabDesignBrief,
    CadLabDesignBriefCompetitor,
    CadLabDesignBriefMarketSizing,
    CadLabDesignBriefSource,
    CadLabResearchResult,
} from "@/lib/cad-lab-types"
import { triageRegulatoryMatrix } from "@/lib/regulatory-triage"
import { validateStandards, formatStandardsWarnings } from "@/lib/regulatory/standards-validator"
import { createAdminClient } from "@/lib/supabase/admin"
import {
    extractCostCeilingFromProse,
    extractAllCostCeilingsFromProse,
} from "@/lib/brief-cost-ceiling-extractor"
import { compressReferenceDossier } from "@/lib/reference-dossier"

export type ChaseRunStatusChip =
    | "not-started"
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "cancelled"

export interface RunChaseResearchResult {
    ok: boolean
    error?: string
    errorCode?:
        | "BUDGET_CAPPED"
        | "BUDGET_NOT_CHECKABLE"
        | "MISSING_SUBJECT"
        | "PROJECT_NOT_FOUND"
        | "PROJECT_FORBIDDEN"
        | "RESEARCH_FAILED"
        | "SAVE_FAILED"
        | "INTERNAL"
    brief?: Partial<CadLabDesignBrief>
    status?: ChaseRunStatusChip
}
export type RunChaseResearchReturn = RunChaseResearchResult

interface ExtractionResult {
    ok: boolean
    brief: Partial<CadLabDesignBrief> | null
    tokensIn: number
    tokensOut: number
    rawLlmText?: string
}

