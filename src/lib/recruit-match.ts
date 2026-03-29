/**
 * @file recruit-match.ts
 *
 * @description Deterministic 0-100 match scoring for fractional executives against
 * a company's needs profile. Pure functions -- no "use server", no DB calls.
 * All data passed in.
 *
 * Scoring factors:
 *   Function gap coverage   (30pts) -- exec skills/subcategory vs company function gaps
 *   Objective/task alignment (25pts) -- exec skills vs active workstreams/tasks
 *   Industry/stage fit       (20pts) -- exec industries/stages vs company sector/stage
 *   Trust signals            (15pts) -- rating, verification, trusted-by count
 *   Advisory question relevance (10pts) -- exec skills vs open advisory categories
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanyNeedsProfile {
  stage: string | null
  sector: string | null
  industry: string | null
  /** Business functions with coverage gaps, e.g. ["Operations", "Finance", "HR"] */
  functionGaps: string[]
  /** Workstream fields from active objectives */
  objectiveWorkstreams: string[]
  /** Keywords extracted from unassigned task titles */
  unassignedTaskKeywords: string[]
  /** Categories from open advisory questions */
  advisoryCategories: string[]
  /** Existing team member roles/headlines */
  teamRoles: string[]
}

export interface ExecutiveProfile {
  id: string
  title: string
  description: string
  subcategory: string
  skills: string[]
  industries: string[]
  companyStages: string[]
  yearsExperience: number
  rating: number
  reviewCount: number
  isVerified: boolean
  trustedByCount: number
  hourlyRate: number | null
  location: string | null
}

export interface RecruitMatchBreakdown {
  total: number
  /** 0-30: function gap coverage */
  gapScore: number
  /** 0-25: objective/task alignment */
  objectiveScore: number
  /** 0-20: industry/stage fit */
  industryScore: number
  /** 0-15: trust signals */
  trustScore: number
  /** 0-10: advisory question relevance */
  advisoryScore: number
  topFactors: string[]
}

// ---------------------------------------------------------------------------
// Function gap mapping
// ---------------------------------------------------------------------------

// DECISION: Map executive titles/skills/subcategories to business functions.
// Each entry lists keywords that, if found in exec.skills or exec.subcategory,
// indicate coverage of that business function.
const FUNCTION_KEYWORDS: Record<string, string[]> = {
  Finance: [
    'cfo', 'financial controller', 'finance director', 'financial planning',
    'fp&a', 'treasury', 'accounting', 'bookkeeping', 'fundraising', 'investor relations',
  ],
  Operations: [
    'coo', 'operations', 'supply chain', 'logistics', 'procurement',
    'manufacturing', 'process improvement', 'lean', 'six sigma',
  ],
  Engineering: [
    'cto', 'vp engineering', 'engineering manager', 'software engineering',
    'hardware engineering', 'firmware', 'systems architecture', 'devops',
  ],
  Sales: [
    'vp sales', 'sales director', 'head of sales', 'business development',
    'sdr', 'account executive', 'revenue', 'commercial',
  ],
  Marketing: [
    'vp marketing', 'cmo', 'marketing director', 'brand', 'growth marketing',
    'demand generation', 'content marketing', 'digital marketing', 'seo',
  ],
  HR: [
    'chro', 'people ops', 'hr director', 'talent acquisition', 'human resources',
    'people operations', 'culture', 'employee experience', 'recruitment',
  ],
  Legal: [
    'general counsel', 'legal', 'compliance', 'regulatory', 'ip',
    'intellectual property', 'contracts', 'corporate governance',
  ],
  Product: [
    'cpo', 'product manager', 'product director', 'vp product', 'product strategy',
    'product management', 'ux', 'user experience', 'product design',
  ],
}

// INTENT: Map advisory question categories to business functions so we can
// score executives who could answer open questions.
const ADVISORY_FUNCTION_MAP: Record<string, string[]> = {
  Finance: ['finance', 'fundraising', 'investment', 'accounting', 'cash flow', 'revenue'],
  Operations: ['operations', 'supply chain', 'logistics', 'manufacturing', 'process'],
  Engineering: ['engineering', 'technology', 'technical', 'software', 'hardware', 'architecture'],
  Sales: ['sales', 'business development', 'revenue', 'pipeline', 'commercial'],
  Marketing: ['marketing', 'brand', 'growth', 'content', 'seo', 'digital'],
  HR: ['hr', 'people', 'hiring', 'talent', 'culture', 'team'],
  Legal: ['legal', 'compliance', 'regulatory', 'ip', 'contracts'],
  Product: ['product', 'ux', 'design', 'roadmap', 'feature'],
  Strategy: ['strategy', 'planning', 'vision', 'growth', 'scaling', 'market entry'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Case-insensitive substring check between two strings */
function fuzzyMatch(a: string, b: string): boolean {
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  return al.includes(bl) || bl.includes(al)
}

/** Get the business functions an executive covers based on skills + subcategory */
function getExecFunctions(exec: ExecutiveProfile): string[] {
  const execText = [
    exec.subcategory,
    exec.title,
    ...exec.skills,
  ].join(' ').toLowerCase()

  const covered: string[] = []
  for (const [fn, keywords] of Object.entries(FUNCTION_KEYWORDS)) {
    if (keywords.some(kw => execText.includes(kw))) {
      covered.push(fn)
    }
  }
  return covered
}

/** Get advisory categories an executive can address */
function getExecAdvisoryFunctions(exec: ExecutiveProfile): string[] {
  const execText = [
    exec.subcategory,
    exec.title,
    ...exec.skills,
  ].join(' ').toLowerCase()

  const covered: string[] = []
  for (const [category, keywords] of Object.entries(ADVISORY_FUNCTION_MAP)) {
    if (keywords.some(kw => execText.includes(kw))) {
      covered.push(category)
    }
  }
  return covered
}

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/**
 * Calculates a deterministic 0-100 match score for a fractional executive
 * against a company's needs profile.
 *
 * @param exec - The executive's profile from marketplace listings
 * @param needs - The company's aggregated needs (gaps, objectives, tasks, etc.)
 * @returns Breakdown with total score and per-factor scores
 */
export function calculateRecruitMatchScore(
  exec: ExecutiveProfile,
  needs: CompanyNeedsProfile
): RecruitMatchBreakdown {
  const topFactors: string[] = []

  // 1. Function gap coverage (0-30 pts)
  // INTENT: The most valuable hire fills a gap the company explicitly has.
  let gapScore = 0
  const execFunctions = getExecFunctions(exec)

  if (needs.functionGaps.length > 0 && execFunctions.length > 0) {
    const directGapHit = needs.functionGaps.some(gap =>
      execFunctions.some(fn => fn.toLowerCase() === gap.toLowerCase())
    )
    const adjacentGapHit = needs.functionGaps.some(gap =>
      execFunctions.some(fn => fuzzyMatch(fn, gap))
    )
    // DECISION: Also check exec skills directly against gap names for partial match
    const partialHit = needs.functionGaps.some(gap =>
      exec.skills.some(skill => fuzzyMatch(skill, gap))
    )

    if (directGapHit) {
      gapScore = 30
      const matchedGap = needs.functionGaps.find(gap =>
        execFunctions.some(fn => fn.toLowerCase() === gap.toLowerCase())
      )
      topFactors.push(`Fills ${matchedGap} gap`)
    } else if (adjacentGapHit) {
      gapScore = 25
      topFactors.push('Adjacent function coverage')
    } else if (partialHit) {
      gapScore = 15
      topFactors.push('Partial gap coverage')
    }
  }

  // 2. Objective/task alignment (0-25 pts)
  // INTENT: An exec whose skills match active workstreams or unassigned tasks
  // can contribute immediately.
  let objectiveScore = 0
  const execSkillsLower = exec.skills.map(s => s.toLowerCase())
  const execTextLower = [exec.title, exec.subcategory, exec.description, ...exec.skills]
    .join(' ').toLowerCase()

  const workstreamMatches = needs.objectiveWorkstreams.filter(ws =>
    execSkillsLower.some(skill => fuzzyMatch(skill, ws)) ||
    fuzzyMatch(execTextLower, ws)
  ).length

  const taskMatches = needs.unassignedTaskKeywords.filter(kw =>
    execSkillsLower.some(skill => fuzzyMatch(skill, kw)) ||
    fuzzyMatch(execTextLower, kw)
  ).length

  const totalAlignmentMatches = workstreamMatches + taskMatches

  if (totalAlignmentMatches >= 2) {
    objectiveScore = 25
    topFactors.push('Strong objective alignment')
  } else if (totalAlignmentMatches >= 1) {
    objectiveScore = 15
    topFactors.push('Objective overlap')
  }

  // 3. Industry/stage fit (0-20 pts)
  // INTENT: Execs with experience in the company's industry and stage
  // ramp up faster and bring relevant networks.
  let industryScore = 0
  let stageScore = 0

  // Industry match (0-10)
  if (exec.industries.length > 0) {
    const sectorMatch = needs.sector && exec.industries.some(ind =>
      fuzzyMatch(ind, needs.sector!)
    )
    const industryMatch = needs.industry && exec.industries.some(ind =>
      fuzzyMatch(ind, needs.industry!)
    )
    if (sectorMatch || industryMatch) {
      industryScore = 10
      topFactors.push('Industry experience')
    }
  }

  // Stage match (0-10)
  if (exec.companyStages.length > 0 && needs.stage) {
    const stageMatch = exec.companyStages.some(s => fuzzyMatch(s, needs.stage!))
    if (stageMatch) {
      stageScore = 10
      topFactors.push('Stage experience')
    }
  }

  const industryStageScore = industryScore + stageScore

  // 4. Trust signals (0-15 pts)
  // INTENT: Higher-rated, verified execs with social proof are lower-risk hires.
  let trustScore = 0

  // Rating (0-8)
  if (exec.rating >= 4.5) {
    trustScore += 8
  } else if (exec.rating >= 4.0) {
    trustScore += 5
  } else if (exec.rating >= 3.5) {
    trustScore += 3
  }

  // Verification (0-4)
  if (exec.isVerified) {
    trustScore += 4
    topFactors.push('Verified executive')
  }

  // Social proof (0-3)
  if (exec.trustedByCount >= 3) {
    trustScore += 3
  }

  // 5. Advisory question relevance (0-10 pts)
  // INTENT: If exec can answer the company's open advisory questions,
  // they bring immediate strategic value beyond just filling a role.
  let advisoryScore = 0
  const execAdvisoryFunctions = getExecAdvisoryFunctions(exec)

  if (needs.advisoryCategories.length > 0 && execAdvisoryFunctions.length > 0) {
    const directMatch = needs.advisoryCategories.some(cat =>
      execAdvisoryFunctions.some(fn => fn.toLowerCase() === cat.toLowerCase())
    )
    const partialMatch = needs.advisoryCategories.some(cat =>
      execAdvisoryFunctions.some(fn => fuzzyMatch(fn, cat))
    )

    if (directMatch) {
      advisoryScore = 10
      topFactors.push('Can address open advisory questions')
    } else if (partialMatch) {
      advisoryScore = 5
    }
  }

  const total = Math.min(100, gapScore + objectiveScore + industryStageScore + trustScore + advisoryScore)

  return {
    total,
    gapScore,
    objectiveScore,
    industryScore: industryStageScore,
    trustScore,
    advisoryScore,
    topFactors: topFactors.slice(0, 3),
  }
}
