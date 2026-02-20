# Business Plan Intelligence Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to drop a business plan (PDF/text) onto the Strategy page and have the AI automatically generate strategic objectives, tasks, hiring requirements, capacity needs, and funding milestones — with smart merge against existing data and user-overridable dates.

**Architecture:** Three new DB tables (`business_plan_analyses`, `hiring_requirements`, `funding_requirements`) store AI-derived data. The existing `analyzeBusinessPlan` action in `src/actions/analyze.ts` is extended to produce all five output streams. A new smart merge utility reconciles AI suggestions against existing objectives. The Strategy page gains a drag-and-drop upload zone + review dialog. The Team page gains a Hiring Timeline tab. A new `/funding` page shows cash flow projections.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), OpenAI GPT-4o, TypeScript, Tailwind CSS v4, Recharts (already used for Money Map), shadcn/ui components.

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260220120000_business_plan_intelligence.sql`

**Step 1: Write the migration**

```sql
-- Business Plan Intelligence Engine
-- Three new tables: analyses, hiring requirements, funding requirements

-- 1. Store raw business plan analyses
CREATE TABLE IF NOT EXISTS public.business_plan_analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id    UUID NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  file_name     TEXT,
  analyzed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  analysis_json JSONB NOT NULL DEFAULT '{}',
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_plan_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their foundry's analyses"
  ON public.business_plan_analyses FOR SELECT
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Members can insert analyses for their foundry"
  ON public.business_plan_analyses FOR INSERT
  WITH CHECK (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

-- 2. Hiring requirements derived from business plan
CREATE TABLE IF NOT EXISTS public.hiring_requirements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id          UUID NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  analysis_id         UUID REFERENCES public.business_plan_analyses(id) ON DELETE SET NULL,
  role_title          TEXT NOT NULL,
  role_type           TEXT NOT NULL CHECK (role_type IN ('full_time', 'fractional', 'apprentice')),
  reason              TEXT,
  linked_objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  ai_suggested_date   DATE,
  user_override_date  DATE,
  status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'recruiting', 'hired', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hiring_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view hiring requirements"
  ON public.hiring_requirements FOR SELECT
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Members can manage hiring requirements"
  ON public.hiring_requirements FOR ALL
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

-- 3. Funding requirements derived from business plan
CREATE TABLE IF NOT EXISTS public.funding_requirements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id           UUID NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  analysis_id          UUID REFERENCES public.business_plan_analyses(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  amount_usd           NUMERIC(12, 2),
  reason               TEXT,
  needed_by_date       DATE,
  funding_type         TEXT CHECK (funding_type IN ('bootstrapping', 'angel', 'vc', 'grant', 'revenue_based', 'debt', 'other')),
  linked_objective_ids UUID[] DEFAULT '{}',
  status               TEXT NOT NULL DEFAULT 'projected' CHECK (status IN ('projected', 'seeking', 'secured', 'cancelled')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.funding_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view funding requirements"
  ON public.funding_requirements FOR SELECT
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Members can manage funding requirements"
  ON public.funding_requirements FOR ALL
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));
```

**Step 2: Apply the migration**

```bash
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
npx supabase db push
```

Expected: Migration applied successfully

**Step 3: Regenerate types**

```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260220120000_business_plan_intelligence.sql src/types/database.types.ts
git commit -m "feat: add business plan intelligence tables (analyses, hiring, funding)"
```

---

## Task 2: Business Plan Types

**Files:**
- Create: `src/lib/business-plan-types.ts`

**Step 1: Write the types file**

```typescript
/**
 * @file business-plan-types.ts
 * @description Type definitions for the Business Plan Intelligence Engine.
 * Covers AI analysis output, smart merge results, hiring requirements,
 * and funding requirements.
 */

// ─── AI Analysis Output ──────────────────────────────────────────────────────

// INTENT: The AI produces five parallel output streams from the business plan.
// Each stream seeds a different part of the platform.

export interface AnalyzedObjective {
  title: string
  description: string
  phase?: string
  suggestedStartDate?: string   // ISO date string, e.g. "2026-04-01"
  suggestedEndDate?: string
  tasks: AnalyzedTask[]
}

export interface AnalyzedTask {
  title: string
  description: string
  role: 'Executive' | 'Apprentice' | 'AI_Agent'
  estimatedDays?: number
}

export interface HiringRequirement {
  roleTitle: string
  roleType: 'full_time' | 'fractional' | 'apprentice'
  reason: string
  linkedObjectiveTitle: string   // matched to objectives after merge
  suggestedDate: string          // ISO date, derived from objective start - buffer
  phase?: string
}

export interface CapacityRequirement {
  description: string
  linkedObjectiveTitle: string
  requiredByDate?: string
  notes?: string
}

export interface FundingRequirement {
  title: string
  amountUsd?: number
  reason: string
  neededByDate?: string          // ISO date
  fundingType?: 'bootstrapping' | 'angel' | 'vc' | 'grant' | 'revenue_based' | 'debt' | 'other'
  linkedObjectiveTitles: string[]
}

export interface BusinessPlanAnalysis {
  objectives: AnalyzedObjective[]
  hiringRequirements: HiringRequirement[]
  capacityRequirements: CapacityRequirement[]
  fundingRequirements: FundingRequirement[]
  executiveSummary: string       // 2-3 sentence summary of the business plan
}

// ─── Smart Merge ─────────────────────────────────────────────────────────────

// INTENT: Smart merge reconciles AI suggestions against what the user already
// has in ForgeOS. Each suggestion gets a disposition: adopt, merge, or skip.
// This prevents blowing away existing work.

export type MergeDisposition = 'adopt' | 'merge' | 'skip' | 'pending'

export interface ObjectiveMergeSuggestion {
  id: string                         // temporary client-side id
  aiObjective: AnalyzedObjective
  existingObjectiveId?: string       // set if similar objective found
  existingObjectiveTitle?: string
  disposition: MergeDisposition
  similarity?: number                // 0-1, how similar to existing
}

export interface MergeReviewState {
  objectiveSuggestions: ObjectiveMergeSuggestion[]
  hiringRequirements: HiringRequirement[]
  capacityRequirements: CapacityRequirement[]
  fundingRequirements: FundingRequirement[]
  analysisId: string
}

// ─── DB-backed hiring requirement (after saving) ─────────────────────────────

export interface SavedHiringRequirement {
  id: string
  foundry_id: string
  analysis_id: string | null
  role_title: string
  role_type: 'full_time' | 'fractional' | 'apprentice'
  reason: string | null
  linked_objective_id: string | null
  ai_suggested_date: string | null
  user_override_date: string | null
  status: 'planned' | 'recruiting' | 'hired' | 'cancelled'
  created_at: string
  updated_at: string
  // Joined
  linked_objective_title?: string | null
}

// ─── DB-backed funding requirement (after saving) ────────────────────────────

export interface SavedFundingRequirement {
  id: string
  foundry_id: string
  analysis_id: string | null
  title: string
  amount_usd: number | null
  reason: string | null
  needed_by_date: string | null
  funding_type: string | null
  linked_objective_ids: string[]
  status: 'projected' | 'seeking' | 'secured' | 'cancelled'
  created_at: string
  updated_at: string
}
```

**Step 2: Commit**

```bash
git add src/lib/business-plan-types.ts
git commit -m "feat: add business plan intelligence type definitions"
```

---

## Task 3: Enhanced Analysis Server Action

**Files:**
- Modify: `src/actions/analyze.ts` (replace current implementation)

**Step 1: Read the current file**

Current `src/actions/analyze.ts` only extracts objectives and tasks. We extend the system prompt to also produce hiring requirements, capacity requirements, and funding requirements in a single AI call.

**Step 2: Write the new implementation**

Replace `src/actions/analyze.ts` with:

```typescript
"use server"

import OpenAI from 'openai'
import { withAuth } from '@/lib/server-action-utils'
import { checkRateLimit } from '@/lib/security/rate-limit'
import type { BusinessPlanAnalysis } from '@/lib/business-plan-types'

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!openaiClient) openaiClient = new OpenAI({ apiKey })
  return openaiClient
}

const SYSTEM_PROMPT = `You are an expert business consultant, strategic planner, and operations advisor.

Analyze the provided business plan and extract ALL of the following in a single JSON response:

1. **Strategic Objectives** — The key pillars or goals of the plan. For each objective:
   - Break it into 3-5 concrete, actionable tasks
   - Assign a role to each task: Executive (decisions/hiring/strategy), Apprentice (research/setup/calls), AI_Agent (data/coding/analysis)
   - Estimate a suggestedStartDate and suggestedEndDate (ISO format, e.g. "2026-04-01") if timing is mentioned or can be inferred
   - Include the business phase this belongs to (e.g. "Launch", "Scale", "Consolidate")

2. **Hiring Requirements** — Who the business needs to hire to execute the plan:
   - role_title: the specific role (e.g. "Head of Manufacturing Operations", "Fractional CFO", "Sales Apprentice")
   - role_type: "full_time", "fractional", or "apprentice"
   - reason: why this role is needed (link to plan goals)
   - linkedObjectiveTitle: which objective requires this hire
   - suggestedDate: when they should start (ISO date, derive from the linked objective's start date minus 6 weeks)
   - phase: the business phase

3. **Capacity Requirements** — Manufacturing, production, or operational capacity needs:
   - description: what capacity is needed
   - linkedObjectiveTitle: which objective drives this need
   - requiredByDate: when it's needed (ISO date if inferable)
   - notes: any specific equipment, space, certifications, or process requirements

4. **Funding Requirements** — Specific funding events the business needs:
   - title: short label (e.g. "Seed Round", "Equipment Purchase", "Working Capital Facility")
   - amountUsd: estimated amount in USD (integer, omit if unknown)
   - reason: what the money is for
   - neededByDate: when (ISO date if inferable)
   - fundingType: one of: bootstrapping, angel, vc, grant, revenue_based, debt, other
   - linkedObjectiveTitles: array of objective titles that depend on this funding

5. **executiveSummary**: A 2-3 sentence plain-language summary of the business plan.

Return ONLY a raw JSON object with this exact structure (no markdown, no code fences):
{
  "objectives": [...],
  "hiringRequirements": [...],
  "capacityRequirements": [...],
  "fundingRequirements": [...],
  "executiveSummary": "..."
}`

export async function analyzeBusinessPlan(
  formData: FormData
): Promise<{ analysis?: BusinessPlanAnalysis; error?: string }> {
  return withAuth(async ({ user }) => {
    const openai = getOpenAIClient()
    if (!openai) return { error: 'AI analysis service is not configured' }

    // SECURITY: Rate limit AI calls to prevent cost abuse
    const rateLimitError = await checkRateLimit('aiAnalysis', `ai:${user.id}`)
    if (rateLimitError) return { error: rateLimitError }

    try {
      const file = formData.get('file') as File | null
      const textInput = formData.get('text') as string | null

      if (!file && !textInput) return { error: 'No file or text provided' }

      let text = ''

      if (file) {
        if (file.type === 'application/pdf') {
          const buffer = Buffer.from(await file.arrayBuffer())
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfParse = require('pdf-parse')
          const data = await pdfParse(buffer)
          text = data.text
        } else {
          text = await file.text()
        }
      } else if (textInput) {
        text = textInput
      }

      if (!text || text.length < 50) {
        return { error: 'Could not extract enough text from the file.' }
      }

      const truncatedText = text.slice(0, 100000)

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analyze the following business plan:\n\n${truncatedText}` },
        ],
      })

      if (!completion.choices?.length) return { error: 'AI returned no response choices' }

      const content = completion.choices[0].message.content
      if (!content) return { error: 'AI returned no content' }

      try {
        const analysis = JSON.parse(content) as BusinessPlanAnalysis
        return { analysis }
      } catch (e) {
        console.error('[analyze] Failed to parse AI JSON response:', e)
        return { error: 'Failed to parse AI response' }
      }
    } catch (error) {
      console.error('[analyze] Business plan analysis failed:', error)
      return { error: 'Failed to analyze document. Please ensure it is a valid PDF or text file.' }
    }
  })
}
```

**Step 3: Verify types compile**

```bash
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to analyze.ts

**Step 4: Commit**

```bash
git add src/actions/analyze.ts
git commit -m "feat: extend analyzeBusinessPlan to produce 5 output streams (objectives, hiring, capacity, funding, summary)"
```

---

## Task 4: Save Analysis & Smart Merge Server Actions

**Files:**
- Create: `src/actions/business-plan.ts`

**Step 1: Write the server actions**

```typescript
"use server"

import { createClient } from '@/lib/supabase/server'
import { withAuth } from '@/lib/server-action-utils'
import type {
  BusinessPlanAnalysis,
  MergeReviewState,
  ObjectiveMergeSuggestion,
  SavedHiringRequirement,
  SavedFundingRequirement,
} from '@/lib/business-plan-types'

// INTENT: Save the raw AI analysis to the DB so we can reference it
// when creating hiring/funding records and support re-analysis history.
export async function saveBusinessPlanAnalysis(
  analysis: BusinessPlanAnalysis,
  fileName: string
): Promise<{ analysisId?: string; error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { data, error } = await supabase
      .from('business_plan_analyses')
      .insert({
        foundry_id: profile.foundry_id,
        file_name: fileName,
        analysis_json: analysis as unknown as Record<string, unknown>,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[business-plan] Failed to save analysis:', error.message)
      return { error: 'Failed to save analysis' }
    }

    return { analysisId: data.id }
  })
}

// INTENT: Smart merge compares the AI-suggested objectives against what
// the foundry already has. Returns a MergeReviewState the user can
// review and selectively adopt. Uses simple string similarity (Jaccard
// on title words) to detect potential duplicates — good enough for
// short objective titles without a vector DB.
export async function buildSmartMerge(
  analysis: BusinessPlanAnalysis,
  analysisId: string
): Promise<{ mergeState?: MergeReviewState; error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    // Fetch existing objectives for comparison
    const { data: existingObjectives } = await supabase
      .from('objectives')
      .select('id, title')
      .eq('foundry_id', profile.foundry_id)
      .eq('is_ghost', false)
      .is('deleted_at', null)

    const existing = existingObjectives || []

    // DECISION: Using word-overlap (Jaccard coefficient) for similarity.
    // This avoids an OpenAI embedding call per objective which would be slow
    // and expensive. For objective titles (typically 5-10 words), word
    // overlap is surprisingly effective.
    function jaccardSimilarity(a: string, b: string): number {
      const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3))
      const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3))
      const intersection = new Set([...setA].filter(x => setB.has(x)))
      const union = new Set([...setA, ...setB])
      if (union.size === 0) return 0
      return intersection.size / union.size
    }

    const SIMILARITY_THRESHOLD = 0.35

    const suggestions: ObjectiveMergeSuggestion[] = analysis.objectives.map((aiObj, index) => {
      let bestMatch: { id: string; title: string; similarity: number } | null = null

      for (const existing_obj of existing) {
        const similarity = jaccardSimilarity(aiObj.title, existing_obj.title)
        if (similarity > SIMILARITY_THRESHOLD) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { id: existing_obj.id, title: existing_obj.title, similarity }
          }
        }
      }

      return {
        id: `suggestion-${index}`,
        aiObjective: aiObj,
        existingObjectiveId: bestMatch?.id,
        existingObjectiveTitle: bestMatch?.title,
        similarity: bestMatch?.similarity,
        disposition: bestMatch ? 'merge' : 'adopt',
      }
    })

    return {
      mergeState: {
        objectiveSuggestions: suggestions,
        hiringRequirements: analysis.hiringRequirements,
        capacityRequirements: analysis.capacityRequirements,
        fundingRequirements: analysis.fundingRequirements,
        analysisId,
      },
    }
  })
}

// INTENT: Apply adopted/merged suggestions from the review dialog.
// Creates objectives+tasks, hiring requirements, and funding requirements
// in the DB based on what the user accepted.
export async function applyMergeReview(mergeState: MergeReviewState): Promise<{ error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }
    const foundryId = profile.foundry_id

    // Process objective suggestions
    const objectiveIdMap: Record<string, string> = {} // aiTitle -> db objective id

    for (const suggestion of mergeState.objectiveSuggestions) {
      if (suggestion.disposition === 'skip') continue

      if (suggestion.disposition === 'adopt') {
        // Create new objective
        const { data: newObj } = await supabase
          .from('objectives')
          .insert({
            foundry_id: foundryId,
            creator_id: user.id,
            title: suggestion.aiObjective.title,
            description: suggestion.aiObjective.description,
            is_strategic_goal: false,
            start_date: suggestion.aiObjective.suggestedStartDate || null,
            end_date: suggestion.aiObjective.suggestedEndDate || null,
            status: 'Not Started',
          })
          .select('id')
          .single()

        if (newObj) {
          objectiveIdMap[suggestion.aiObjective.title] = newObj.id

          // Create tasks for this objective
          const taskInserts = suggestion.aiObjective.tasks.map(task => ({
            foundry_id: foundryId,
            creator_id: user.id,
            objective_id: newObj.id,
            title: task.title,
            description: task.description,
            status: 'Pending',
          }))

          if (taskInserts.length > 0) {
            await supabase.from('tasks').insert(taskInserts)
          }
        }
      } else if (suggestion.disposition === 'merge' && suggestion.existingObjectiveId) {
        // Link to existing objective — no new objective created
        objectiveIdMap[suggestion.aiObjective.title] = suggestion.existingObjectiveId
      }
    }

    // Create hiring requirements
    if (mergeState.hiringRequirements.length > 0) {
      const hiringInserts = mergeState.hiringRequirements.map(hr => ({
        foundry_id: foundryId,
        analysis_id: mergeState.analysisId,
        role_title: hr.roleTitle,
        role_type: hr.roleType,
        reason: hr.reason,
        linked_objective_id: objectiveIdMap[hr.linkedObjectiveTitle] || null,
        ai_suggested_date: hr.suggestedDate || null,
        status: 'planned' as const,
      }))

      const { error } = await supabase.from('hiring_requirements').insert(hiringInserts)
      if (error) console.error('[business-plan] Failed to insert hiring requirements:', error.message)
    }

    // Create funding requirements
    if (mergeState.fundingRequirements.length > 0) {
      const fundingInserts = mergeState.fundingRequirements.map(fr => ({
        foundry_id: foundryId,
        analysis_id: mergeState.analysisId,
        title: fr.title,
        amount_usd: fr.amountUsd || null,
        reason: fr.reason,
        needed_by_date: fr.neededByDate || null,
        funding_type: fr.fundingType || null,
        linked_objective_ids: fr.linkedObjectiveTitles
          .map(title => objectiveIdMap[title])
          .filter(Boolean),
        status: 'projected' as const,
      }))

      const { error } = await supabase.from('funding_requirements').insert(fundingInserts)
      if (error) console.error('[business-plan] Failed to insert funding requirements:', error.message)
    }

    return {}
  })
}

// INTENT: Fetch hiring requirements for the team page hiring timeline.
export async function getHiringRequirements(): Promise<{
  data?: SavedHiringRequirement[]
  error?: string
}> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { data, error } = await supabase
      .from('hiring_requirements')
      .select(`
        *,
        objectives!linked_objective_id ( title )
      `)
      .eq('foundry_id', profile.foundry_id)
      .order('ai_suggested_date', { ascending: true })

    if (error) {
      console.error('[business-plan] Failed to fetch hiring requirements:', error.message)
      return { error: error.message }
    }

    // GOTCHA: Supabase join returns objectives as an object, not array.
    // Map to flatten the joined title.
    const mapped = (data || []).map(row => ({
      ...row,
      linked_objective_title: (row.objectives as { title: string } | null)?.title ?? null,
    })) as SavedHiringRequirement[]

    return { data: mapped }
  })
}

// INTENT: Update just the user_override_date for a hiring requirement.
// This is called when the user drags or edits a date on the hiring timeline.
export async function updateHiringRequirementDate(
  id: string,
  date: string | null
): Promise<{ error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { error } = await supabase
      .from('hiring_requirements')
      .update({ user_override_date: date, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('foundry_id', profile.foundry_id)  // RLS: scoped to foundry

    if (error) {
      console.error('[business-plan] Failed to update hire date:', error.message)
      return { error: error.message }
    }

    return {}
  })
}

// INTENT: Fetch funding requirements for the /funding page.
export async function getFundingRequirements(): Promise<{
  data?: SavedFundingRequirement[]
  error?: string
}> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { data, error } = await supabase
      .from('funding_requirements')
      .select('*')
      .eq('foundry_id', profile.foundry_id)
      .order('needed_by_date', { ascending: true })

    if (error) {
      console.error('[business-plan] Failed to fetch funding requirements:', error.message)
      return { error: error.message }
    }

    return { data: (data || []) as SavedFundingRequirement[] }
  })
}

// INTENT: Update funding requirement status (e.g. mark as secured).
export async function updateFundingRequirementStatus(
  id: string,
  status: 'projected' | 'seeking' | 'secured' | 'cancelled'
): Promise<{ error?: string }> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { error } = await supabase
      .from('funding_requirements')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('foundry_id', profile.foundry_id)

    if (error) return { error: error.message }
    return {}
  })
}
```

**Step 2: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No type errors

**Step 3: Commit**

```bash
git add src/actions/business-plan.ts
git commit -m "feat: add business plan server actions (save, smart merge, apply, hiring, funding)"
```

---

## Task 5: Business Plan Drop Zone Component

**Files:**
- Create: `src/components/strategy/business-plan-upload.tsx`

**Step 1: Write the component**

This is a drag-and-drop zone that shows upload state, triggers analysis, and opens the merge review dialog.

```tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { analyzeBusinessPlan } from '@/actions/analyze'
import { saveBusinessPlanAnalysis, buildSmartMerge } from '@/actions/business-plan'
import type { MergeReviewState } from '@/lib/business-plan-types'

interface BusinessPlanUploadProps {
  lastAnalyzedAt?: string | null
  onMergeReady: (mergeState: MergeReviewState) => void
}

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'

const STEP_LABELS: Record<UploadState, string> = {
  idle: '',
  uploading: 'Reading document...',
  analyzing: 'Analyzing your business plan...',
  done: 'Analysis complete',
  error: 'Analysis failed',
}

export function BusinessPlanUpload({ lastAnalyzedAt, onMergeReady }: BusinessPlanUploadProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setState('uploading')
    setErrorMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    setState('analyzing')
    const result = await analyzeBusinessPlan(formData)

    if (result.error || !result.analysis) {
      setState('error')
      setErrorMessage(result.error ?? 'Unknown error')
      return
    }

    // Save analysis to DB
    const { analysisId, error: saveError } = await saveBusinessPlanAnalysis(
      result.analysis,
      file.name
    )

    if (saveError || !analysisId) {
      setState('error')
      setErrorMessage(saveError ?? 'Failed to save analysis')
      return
    }

    // Build smart merge state
    const { mergeState, error: mergeError } = await buildSmartMerge(result.analysis, analysisId)

    if (mergeError || !mergeState) {
      setState('error')
      setErrorMessage(mergeError ?? 'Failed to build merge review')
      return
    }

    setState('done')
    onMergeReady(mergeState)
  }, [onMergeReady])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const isLoading = state === 'uploading' || state === 'analyzing'

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => !isLoading && fileInputRef.current?.click()}
      className={cn(
        'relative flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 transition-all duration-200 cursor-pointer',
        isDragging
          ? 'border-accent bg-accent/5 scale-[1.01]'
          : 'border-muted-foreground/25 hover:border-accent/50 hover:bg-muted/30',
        isLoading && 'cursor-default pointer-events-none'
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.txt,.doc,.docx"
        onChange={handleInputChange}
      />

      {isLoading ? (
        <>
          <Loader2 className="h-8 w-8 text-accent animate-spin" />
          <p className="text-sm font-medium text-foreground">{STEP_LABELS[state]}</p>
          <p className="text-xs text-muted-foreground">This usually takes 15–30 seconds</p>
        </>
      ) : state === 'done' ? (
        <>
          <CheckCircle2 className="h-8 w-8 text-status-success" />
          <p className="text-sm font-medium text-foreground">Analysis complete — review suggestions below</p>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5"
            onClick={(e) => { e.stopPropagation(); setState('idle') }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-analyse with updated plan
          </Button>
        </>
      ) : state === 'error' ? (
        <>
          <FileText className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">{errorMessage ?? 'Analysis failed'}</p>
          <p className="text-xs text-muted-foreground">Click to try again with a different file</p>
        </>
      ) : (
        <>
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drop your business plan here
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, DOCX, or TXT · The AI will generate your strategy, team plan, and funding needs
            </p>
          </div>
          {lastAnalyzedAt && (
            <p className="text-xs text-muted-foreground">
              Last analysed: {new Date(lastAnalyzedAt).toLocaleDateString()}
            </p>
          )}
          <Button variant="outline" size="sm" className="mt-1 pointer-events-none">
            Choose file
          </Button>
        </>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/strategy/business-plan-upload.tsx
git commit -m "feat: add BusinessPlanUpload drag-and-drop component with streaming state"
```

---

## Task 6: Smart Merge Review Dialog

**Files:**
- Create: `src/components/strategy/merge-review-dialog.tsx`

**Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { CheckCircle2, GitMerge, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { applyMergeReview } from '@/actions/business-plan'
import { toast } from 'sonner'
import type { MergeReviewState, ObjectiveMergeSuggestion, MergeDisposition } from '@/lib/business-plan-types'

interface MergeReviewDialogProps {
  open: boolean
  mergeState: MergeReviewState
  onClose: () => void
  onApplied: () => void
}

export function MergeReviewDialog({ open, mergeState, onClose, onApplied }: MergeReviewDialogProps) {
  const [suggestions, setSuggestions] = useState(mergeState.objectiveSuggestions)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  const adopted = suggestions.filter(s => s.disposition === 'adopt').length
  const merged = suggestions.filter(s => s.disposition === 'merge').length
  const skipped = suggestions.filter(s => s.disposition === 'skip').length

  function setDisposition(id: string, disposition: MergeDisposition) {
    setSuggestions(prev =>
      prev.map(s => s.id === id ? { ...s, disposition } : s)
    )
  }

  async function handleApply() {
    setApplying(true)
    const finalState = { ...mergeState, objectiveSuggestions: suggestions }
    const result = await applyMergeReview(finalState)
    setApplying(false)

    if (result.error) {
      toast.error('Failed to apply changes', { description: result.error })
      return
    }

    toast.success('Strategy updated', {
      description: `${adopted} new objective${adopted !== 1 ? 's' : ''} created, ${merged} merged with existing.`,
    })
    onApplied()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Review Business Plan Suggestions</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            The AI analysed your business plan and found {suggestions.length} strategic objectives.
            Review each suggestion and choose how to handle it.
          </p>
        </DialogHeader>

        {/* Summary bar */}
        <div className="flex items-center gap-4 px-1 py-2 bg-muted/40 rounded-lg text-sm">
          <span className="flex items-center gap-1.5 text-status-success font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {adopted} new
          </span>
          <span className="flex items-center gap-1.5 text-status-info font-medium">
            <GitMerge className="h-4 w-4" />
            {merged} merge
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <X className="h-4 w-4" />
            {skipped} skip
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            +{mergeState.hiringRequirements.length} hire requirements · +{mergeState.fundingRequirements.length} funding events
          </span>
        </div>

        <ScrollArea className="max-h-[52vh] pr-2">
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                expanded={expandedId === s.id}
                onToggleExpand={() => setExpandedId(prev => prev === s.id ? null : s.id)}
                onDisposition={(d) => setDisposition(s.id, d)}
              />
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={applying}>
            {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply {adopted + merged} change{adopted + merged !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SuggestionCard({
  suggestion,
  expanded,
  onToggleExpand,
  onDisposition,
}: {
  suggestion: ObjectiveMergeSuggestion
  expanded: boolean
  onToggleExpand: () => void
  onDisposition: (d: MergeDisposition) => void
}) {
  const { aiObjective, existingObjectiveTitle, disposition } = suggestion

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all',
        disposition === 'skip' && 'opacity-50',
        disposition === 'adopt' && 'border-status-success/40 bg-status-success-light/20',
        disposition === 'merge' && 'border-status-info/40 bg-status-info-light/20',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm">{aiObjective.title}</p>
          {aiObjective.phase && (
            <p className="text-xs text-muted-foreground mt-0.5">Phase: {aiObjective.phase}</p>
          )}
          {existingObjectiveTitle && (
            <p className="text-xs text-status-info mt-1">
              Similar to existing: "{existingObjectiveTitle}"
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <DispositionButton
            active={disposition === 'adopt'}
            onClick={() => onDisposition('adopt')}
            label="New"
            color="success"
          />
          {existingObjectiveTitle && (
            <DispositionButton
              active={disposition === 'merge'}
              onClick={() => onDisposition('merge')}
              label="Merge"
              color="info"
            />
          )}
          <DispositionButton
            active={disposition === 'skip'}
            onClick={() => onDisposition('skip')}
            label="Skip"
            color="neutral"
          />
          <button
            onClick={onToggleExpand}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-sm text-muted-foreground">{aiObjective.description}</p>
          <p className="text-xs font-medium text-foreground">{aiObjective.tasks.length} tasks:</p>
          <ul className="space-y-1">
            {aiObjective.tasks.map((task, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">{task.role}</Badge>
                <span>{task.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DispositionButton({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color: 'success' | 'info' | 'neutral'
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
        active && color === 'success' && 'bg-status-success-light text-status-success border-status-success/30',
        active && color === 'info' && 'bg-status-info-light text-status-info border-status-info/30',
        active && color === 'neutral' && 'bg-muted text-muted-foreground border-border',
        !active && 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}
```

**Step 2: Integrate into strategy-dashboard.tsx**

Find `src/app/(platform)/strategy/strategy-dashboard.tsx` and add:
1. Import `BusinessPlanUpload` and `MergeReviewDialog`
2. Add state for `mergeState` and `showMergeDialog`
3. Add the upload zone at the top of the dashboard (before the pillars)

In the strategy dashboard client component, add this section at the top of the rendered content (before the pillars grid):

```tsx
// Add to the top of the strategy dashboard JSX, before the pillars:
{isFounder && (
  <div className="mb-6">
    <h2 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
      Business Plan
    </h2>
    <BusinessPlanUpload
      lastAnalyzedAt={null}
      onMergeReady={(state) => {
        setMergeState(state)
        setShowMergeDialog(true)
      }}
    />
  </div>
)}

{mergeState && (
  <MergeReviewDialog
    open={showMergeDialog}
    mergeState={mergeState}
    onClose={() => setShowMergeDialog(false)}
    onApplied={() => {
      setShowMergeDialog(false)
      router.refresh()
    }}
  />
)}
```

You'll need to read `strategy-dashboard.tsx` to find the exact insertion point and add the state variables:

```tsx
const [mergeState, setMergeState] = useState<MergeReviewState | null>(null)
const [showMergeDialog, setShowMergeDialog] = useState(false)
```

**Step 3: Verify types compile and check for lint errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 4: Commit**

```bash
git add src/components/strategy/business-plan-upload.tsx src/components/strategy/merge-review-dialog.tsx src/app/(platform)/strategy/strategy-dashboard.tsx
git commit -m "feat: add business plan upload zone and smart merge review dialog to Strategy page"
```

---

## Task 7: Hiring Timeline Component

**Files:**
- Create: `src/app/(platform)/team/hiring-timeline.tsx`

**Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarDays, UserSearch, Briefcase, GraduationCap, Clock, Pencil, Check } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { updateHiringRequirementDate } from '@/actions/business-plan'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { SavedHiringRequirement } from '@/lib/business-plan-types'

interface HiringTimelineProps {
  requirements: SavedHiringRequirement[]
}

const ROLE_TYPE_CONFIG = {
  full_time: {
    label: 'Full-time',
    icon: Briefcase,
    color: 'bg-status-info-light text-status-info',
  },
  fractional: {
    label: 'Fractional',
    icon: Clock,
    color: 'bg-status-warning-light text-status-warning',
  },
  apprentice: {
    label: 'Apprentice',
    icon: GraduationCap,
    color: 'bg-status-success-light text-status-success',
  },
} as const

const STATUS_CONFIG = {
  planned: 'bg-muted text-muted-foreground',
  recruiting: 'bg-status-info-light text-status-info',
  hired: 'bg-status-success-light text-status-success',
  cancelled: 'bg-muted text-muted-foreground opacity-50',
}

export function HiringTimeline({ requirements }: HiringTimelineProps) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')

  if (requirements.length === 0) {
    return (
      <EmptyState
        title="No hiring plan yet"
        description="Upload your business plan on the Strategy page to automatically generate a hiring timeline"
        action={
          <Button variant="outline" asChild>
            <a href="/strategy">Go to Strategy</a>
          </Button>
        }
      />
    )
  }

  // Group by role type
  const grouped = {
    full_time: requirements.filter(r => r.role_type === 'full_time'),
    fractional: requirements.filter(r => r.role_type === 'fractional'),
    apprentice: requirements.filter(r => r.role_type === 'apprentice'),
  }

  async function handleSaveDate(id: string) {
    const result = await updateHiringRequirementDate(id, editDate || null)
    if (result.error) {
      toast.error('Failed to update date')
      return
    }
    setEditingId(null)
    router.refresh()
  }

  function getDisplayDate(req: SavedHiringRequirement): string | null {
    const date = req.user_override_date || req.ai_suggested_date
    if (!date) return null
    try {
      return format(parseISO(date), 'MMM d, yyyy')
    } catch {
      return null
    }
  }

  return (
    <div className="space-y-6">
      {(Object.keys(grouped) as Array<keyof typeof grouped>).map((type) => {
        const items = grouped[type]
        if (items.length === 0) return null
        const config = ROLE_TYPE_CONFIG[type]
        const Icon = config.icon

        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">{config.label} Hires</h3>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <div className="space-y-3">
              {items.map((req) => {
                const displayDate = getDisplayDate(req)
                const isEditing = editingId === req.id

                return (
                  <Card key={req.id} className={cn('border', req.status === 'cancelled' && 'opacity-50')}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-foreground text-sm">{req.role_title}</p>
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', config.color)}>
                              {config.label}
                            </span>
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CONFIG[req.status])}>
                              {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                            </span>
                          </div>
                          {req.reason && (
                            <p className="text-xs text-muted-foreground mt-1">{req.reason}</p>
                          )}
                          {req.linked_objective_title && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Needed for: <span className="text-foreground">{req.linked_objective_title}</span>
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background"
                              />
                              <button
                                onClick={() => handleSaveDate(req.id)}
                                className="p-1 rounded text-status-success hover:bg-status-success-light"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5" />
                              <span>{displayDate ?? 'No date set'}</span>
                              {req.user_override_date && (
                                <span className="text-xs text-status-info">(edited)</span>
                              )}
                              <button
                                onClick={() => {
                                  setEditingId(req.id)
                                  setEditDate(req.user_override_date || req.ai_suggested_date || '')
                                }}
                                className="p-1 rounded text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          {type === 'fractional' && (
                            <Button variant="ghost" size="sm" className="text-xs gap-1" asChild>
                              <a href="/recruits">
                                <UserSearch className="h-3.5 w-3.5" />
                                Find
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/(platform)/team/hiring-timeline.tsx
git commit -m "feat: add HiringTimeline component with editable dates and recruits link"
```

---

## Task 8: Integrate Hiring Timeline into Team Page

**Files:**
- Modify: `src/app/(platform)/team/team-page-view.tsx` (add Hiring Plan tab)
- Modify: `src/app/(platform)/team/page.tsx` (fetch hiring requirements)

**Step 1: Read team-page-view.tsx to find the tabs structure**

```bash
grep -n "Tabs\|TabsList\|TabsTrigger\|TabsContent" "src/app/(platform)/team/team-page-view.tsx" | head -20
```

**Step 2: Add the Hiring Plan tab**

In `team-page-view.tsx`, add `"hiring-plan"` as a new `TabsTrigger` and a new `TabsContent` that renders `<HiringTimeline requirements={hiringRequirements} />`.

Add to imports: `import { HiringTimeline } from './hiring-timeline'`
Add to props interface: `hiringRequirements: SavedHiringRequirement[]`

**Step 3: Fetch hiring requirements in page.tsx**

In `src/app/(platform)/team/page.tsx`, add a call to `getHiringRequirements()` alongside the existing data fetches, then pass the result to `<TeamPageView>`.

```typescript
// Add to the parallel fetch block:
const hiringResult = await getHiringRequirements()
const hiringRequirements = hiringResult.data || []
```

**Step 4: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 5: Commit**

```bash
git add src/app/(platform)/team/team-page-view.tsx src/app/(platform)/team/page.tsx
git commit -m "feat: add Hiring Plan tab to Team page with AI-derived hiring timeline"
```

---

## Task 9: Funding & Financing Page

**Files:**
- Create: `src/app/(platform)/funding/page.tsx`
- Create: `src/app/(platform)/funding/funding-page-view.tsx`

**Step 1: Write the page (server component)**

```tsx
// src/app/(platform)/funding/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFundingRequirements } from '@/actions/business-plan'
import { FundingPageView } from './funding-page-view'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'

export const dynamic = 'force-dynamic'

export default async function FundingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) return <ProfileSetupRequired userRole={profile?.role} />

  const { data: requirements = [] } = await getFundingRequirements()

  return <FundingPageView requirements={requirements ?? []} />
}
```

**Step 2: Write the client view**

```tsx
// src/app/(platform)/funding/funding-page-view.tsx
'use client'

import { useState } from 'react'
import { DollarSign, TrendingUp, Calendar, ExternalLink, Target } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { typography } from '@/lib/design-system'
import { updateFundingRequirementStatus } from '@/actions/business-plan'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import type { SavedFundingRequirement } from '@/lib/business-plan-types'

interface FundingPageViewProps {
  requirements: SavedFundingRequirement[]
}

const STATUS_CONFIG = {
  projected: { label: 'Projected', color: 'bg-muted text-muted-foreground' },
  seeking: { label: 'Seeking', color: 'bg-status-info-light text-status-info' },
  secured: { label: 'Secured', color: 'bg-status-success-light text-status-success' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground opacity-50' },
}

const FUNDING_TYPE_LABELS: Record<string, string> = {
  bootstrapping: 'Bootstrapping',
  angel: 'Angel Investment',
  vc: 'Venture Capital',
  grant: 'Grant',
  revenue_based: 'Revenue-Based',
  debt: 'Debt Financing',
  other: 'Other',
}

export function FundingPageView({ requirements }: FundingPageViewProps) {
  const router = useRouter()
  const [updating, setUpdating] = useState<string | null>(null)

  const totalRequired = requirements
    .filter(r => r.status !== 'cancelled')
    .reduce((sum, r) => sum + (r.amount_usd ?? 0), 0)

  const secured = requirements
    .filter(r => r.status === 'secured')
    .reduce((sum, r) => sum + (r.amount_usd ?? 0), 0)

  async function handleStatusChange(
    id: string,
    status: SavedFundingRequirement['status']
  ) {
    setUpdating(id)
    const result = await updateFundingRequirementStatus(id, status)
    setUpdating(null)
    if (result.error) {
      toast.error('Failed to update status')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Funding & Financing</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Capital requirements derived from your business plan, linked to strategic objectives
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/pitch-prep">
            <ExternalLink className="h-4 w-4 mr-2" />
            Prepare Pitch
          </a>
        </Button>
      </div>

      {requirements.length === 0 ? (
        <EmptyState
          title="No funding plan yet"
          description="Upload your business plan on the Strategy page to automatically generate funding requirements"
          action={
            <Button variant="outline" asChild>
              <a href="/strategy">Go to Strategy</a>
            </Button>
          }
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-status-info-light flex items-center justify-center">
                  <Target className="h-5 w-5 text-status-info" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Required</p>
                  <p className="text-2xl font-bold text-foreground">
                    ${totalRequired.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-status-success-light flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-status-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Secured</p>
                  <p className="text-2xl font-bold text-foreground">
                    ${secured.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-status-warning-light flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-status-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Still Needed</p>
                  <p className="text-2xl font-bold text-foreground">
                    ${(totalRequired - secured).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Funding events list */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">Funding Events</h2>
            {requirements.map((req) => {
              const statusConfig = STATUS_CONFIG[req.status]

              return (
                <Card key={req.id} className={cn('border', req.status === 'cancelled' && 'opacity-50')}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{req.title}</p>
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusConfig.color)}>
                            {statusConfig.label}
                          </span>
                          {req.funding_type && (
                            <Badge variant="secondary">
                              {FUNDING_TYPE_LABELS[req.funding_type] ?? req.funding_type}
                            </Badge>
                          )}
                        </div>

                        {req.amount_usd && (
                          <p className="text-lg font-bold text-foreground mt-1">
                            ${req.amount_usd.toLocaleString()}
                          </p>
                        )}

                        {req.reason && (
                          <p className="text-sm text-muted-foreground mt-1">{req.reason}</p>
                        )}

                        {req.needed_by_date && (
                          <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>
                              Needed by: {format(parseISO(req.needed_by_date), 'MMMM d, yyyy')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Status controls */}
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {(['projected', 'seeking', 'secured'] as const).map((status) => (
                          <button
                            key={status}
                            disabled={req.status === status || updating === req.id}
                            onClick={() => handleStatusChange(req.id, status)}
                            className={cn(
                              'px-3 py-1 rounded-md text-xs font-medium transition-colors border',
                              req.status === status
                                ? STATUS_CONFIG[status].color + ' border-transparent'
                                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                            )}
                          >
                            {STATUS_CONFIG[status].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
```

**Step 3: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 4: Commit**

```bash
git add src/app/(platform)/funding/page.tsx src/app/(platform)/funding/funding-page-view.tsx
git commit -m "feat: add Funding & Financing page with status tracking and summary cards"
```

---

## Task 10: Add Funding to Sidebar Navigation

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Find and update the Plan navigation array**

In `src/components/Sidebar.tsx`, locate the `planNavigation` array (around line 103):

```typescript
const planNavigation = [
  { name: "Strategy", href: "/strategy", icon: Waypoints, tooltip: "..." },
  { name: "Objectives", href: "/new-objectives", icon: Target, tooltip: "..." },
  { name: "Tasks", href: "/new-tasks", icon: CheckSquare, tooltip: "..." },
]
```

Add the Funding entry:

```typescript
const planNavigation = [
  { name: "Strategy", href: "/strategy", icon: Waypoints, tooltip: "Your strategic direction — pillars, progress, and health at a glance" },
  { name: "Objectives", href: "/new-objectives", icon: Target, tooltip: "Milestones that move the strategy forward" },
  { name: "Tasks", href: "/new-tasks", icon: CheckSquare, tooltip: "Day-to-day work that delivers on objectives" },
  { name: "Funding", href: "/funding", icon: Banknote, tooltip: "Capital requirements, funding events, and financial milestones from your business plan" },
]
```

Add `Banknote` to the lucide-react import at the top of the file.

**Step 2: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Funding to Plan section in sidebar navigation"
```

---

## Task 11: Final Verification

**Step 1: Run type check across the whole project**

```bash
npx tsc --noEmit 2>&1
```

Expected: Zero errors

**Step 2: Run linter**

```bash
npx eslint src/actions/analyze.ts src/actions/business-plan.ts src/lib/business-plan-types.ts src/components/strategy/business-plan-upload.tsx src/components/strategy/merge-review-dialog.tsx src/app/(platform)/team/hiring-timeline.tsx src/app/(platform)/funding/page.tsx src/app/(platform)/funding/funding-page-view.tsx src/components/Sidebar.tsx --max-warnings 0
```

**Step 3: Start the dev server and check each page**

```bash
npm run dev
```

Verify:
- `/strategy` — drop zone appears for Founders, upload triggers analysis, merge review dialog opens
- `/team` — Hiring Plan tab is visible, shows timeline if data exists
- `/funding` — page loads, shows empty state if no requirements yet, shows data after a business plan is uploaded

**Step 4: Final commit message summary**

The feature is now complete. All changes are in focused, reversible commits:
- Migration + types
- Enhanced AI action
- Server actions
- Upload component
- Merge review dialog
- Hiring timeline
- Team page integration
- Funding page
- Sidebar navigation

---

## Quick Reference: File Map

| File | Purpose |
|---|---|
| `supabase/migrations/20260220120000_...sql` | DB tables: analyses, hiring, funding |
| `src/lib/business-plan-types.ts` | All TypeScript types for this feature |
| `src/actions/analyze.ts` | Extended AI analysis (5 streams) |
| `src/actions/business-plan.ts` | Save, smart merge, apply, CRUD actions |
| `src/components/strategy/business-plan-upload.tsx` | Drag-and-drop upload zone |
| `src/components/strategy/merge-review-dialog.tsx` | Smart merge review UI |
| `src/app/(platform)/team/hiring-timeline.tsx` | Hiring timeline component |
| `src/app/(platform)/team/team-page-view.tsx` | Modified: +Hiring Plan tab |
| `src/app/(platform)/team/page.tsx` | Modified: +hiring requirements fetch |
| `src/app/(platform)/funding/page.tsx` | New funding page (server) |
| `src/app/(platform)/funding/funding-page-view.tsx` | New funding page (client) |
| `src/components/Sidebar.tsx` | Modified: +Funding nav item |
