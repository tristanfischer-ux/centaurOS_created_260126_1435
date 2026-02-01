# Monetization & Trust Framework

> **Step 6 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-6

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Core Principles](#2-core-principles)
3. [Recommendation Logic](#3-recommendation-logic)
4. [Gating Rules](#4-gating-rules)
5. [Abuse & Failure Scenarios](#5-abuse--failure-scenarios)
6. [Metrics & Analytics](#6-metrics--analytics)
7. [Implementation Checklist](#7-implementation-checklist)

---

## 1. Executive Summary

The Monetization & Trust framework ensures that marketplace recommendations generated from Manufacturing Blueprint gaps are **transparent, trustworthy, and user-controlled**. Recommendations bridge engineering gaps to marketplace solutions without compromising the integrity of the blueprint analysis.

### 1.1 Design Philosophy

1. **Engineering Truth First**: Blueprint coverage analysis is independent of commercial interests. Gaps are identified based on technical merit, not monetization potential.
2. **Transparent Overlays**: Commercial recommendations are clearly marked as overlays on top of engineering truth, never hidden or conflated.
3. **User Control**: Users can dismiss, customize, or disable recommendations entirely. No dark patterns or forced engagement.
4. **Trust Through Transparency**: Every recommendation explains "why suggested" with traceable links back to source gaps.

### 1.2 Relationship to Other Specs

| Spec | Relationship |
|------|--------------|
| **11-risk-heatmap.md** | Risk-aware gating prevents aggressive CTAs for high-risk domains |
| **13-ai-confidence-verification.md** | Unverified AI content cannot trigger aggressive recommendations |
| **09-stage-gates.md** | Stage-aware gating ensures recommendations match project maturity |
| **03-data-api.md** | Uses `marketplace_recommendations` table and `generate_gap_recommendations()` function |

---

## 2. Core Principles

### 2.1 Separation of Engineering Truth vs Commercial Overlays

**Principle:** Blueprint coverage analysis (`blueprint_domain_coverage.status`) is computed independently of marketplace recommendations. Commercial overlays are applied **after** gap identification.

**Implementation:**

```typescript
// ✅ CORRECT: Gap identification is pure engineering logic
const gaps = await db.query(`
  SELECT domain_id, status, criticality
  FROM blueprint_domain_coverage
  WHERE blueprint_id = $1
    AND status IN ('gap', 'partial')
    AND is_critical = true
`);

// ✅ CORRECT: Recommendations generated separately
const recommendations = await generateRecommendationsFromGaps(gaps);

// ❌ WRONG: Don't bias gap detection toward monetization
// Never filter gaps by "marketplace availability" or "recommendation potential"
```

**Visual Separation in UI:**

- **Blueprint Canvas**: Shows pure coverage status (covered/partial/gap) with no commercial indicators
- **Marketplace Overlay**: Optional toggle that overlays recommendation badges/icons on gap domains
- **Recommendation Panel**: Separate sidebar/drawer clearly labeled "Marketplace Suggestions"

### 2.2 Transparency: "Why Suggested"

**Principle:** Every recommendation must explain its origin with traceable links.

**Required Fields:**

```typescript
interface MarketplaceRecommendation {
  id: string
  source_type: 'coverage_gap' | 'advisory' | 'ai_suggestion' | 'manual'
  source_id: string // Links to blueprint_domain_coverage.id or advisory_answer.id
  
  // Transparency fields
  reasoning: string // "Why suggested" explanation
  source_domain?: {
    id: string
    name: string
    path: string // e.g., "Electronics > Power Management > Battery Safety"
  }
  source_gap_details?: {
    status: 'gap' | 'partial'
    criticality: 'critical' | 'important' | 'nice-to-have'
    blockers?: string[]
  }
  
  // Recommendation content
  category: 'People' | 'Products' | 'Services' | 'AI'
  subcategory?: string
  search_term?: string
  priority: number // 0-100
}
```

**UI Pattern:**

```tsx
<RecommendationCard>
  <RecommendationHeader>
    <CategoryBadge category={rec.category} />
    <DismissButton onClick={() => dismiss(rec.id)} />
  </RecommendationHeader>
  
  <RecommendationContent>
    <SearchTerm>{rec.search_term}</SearchTerm>
    <Reasoning>
      <WhySuggested>
        Suggested because: {rec.reasoning}
      </WhySuggested>
      <SourceLink href={`/blueprints/${blueprintId}/domains/${rec.source_domain.id}`}>
        View source: {rec.source_domain.path}
      </SourceLink>
    </Reasoning>
  </RecommendationContent>
  
  <RecommendationActions>
    <Button onClick={() => searchMarketplace(rec.search_term)}>
      Browse {rec.category}
    </Button>
  </RecommendationActions>
</RecommendationCard>
```

### 2.3 User Controls

**Principle:** Users have granular control over recommendation visibility and generation.

**Control Options:**

1. **Global Toggle**: Disable all marketplace recommendations
   ```typescript
   // User preference stored in profiles.settings or blueprint.settings
   settings: {
     marketplace_recommendations_enabled: boolean
   }
   ```

2. **Per-Blueprint Toggle**: Disable recommendations for specific blueprints
   ```typescript
   blueprint.settings: {
     marketplace_overlay_enabled: boolean
   }
   ```

3. **Per-Domain Dismissal**: Dismiss specific recommendations
   ```typescript
   // Uses existing marketplace_recommendations.is_dismissed
   await dismissRecommendation(recommendationId, userId)
   ```

4. **Category Filters**: Show/hide by category (People/Products/Services/AI)
   ```typescript
   settings: {
     marketplace_category_filters: {
       People: boolean
       Products: boolean
       Services: boolean
       AI: boolean
     }
   }
   ```

5. **Priority Threshold**: Only show recommendations above priority threshold
   ```typescript
   settings: {
     marketplace_min_priority: number // Default: 50
   }
   ```

**UI Pattern:**

```tsx
<BlueprintSettings>
  <Section title="Marketplace Recommendations">
    <Toggle
      label="Show marketplace recommendations"
      checked={settings.marketplace_recommendations_enabled}
      onChange={toggleRecommendations}
    />
    
    {settings.marketplace_recommendations_enabled && (
      <>
        <PrioritySlider
          label="Minimum priority"
          value={settings.marketplace_min_priority}
          min={0}
          max={100}
        />
        
        <CategoryFilters>
          {['People', 'Products', 'Services', 'AI'].map(cat => (
            <Checkbox
              key={cat}
              label={cat}
              checked={settings.marketplace_category_filters[cat]}
              onChange={toggleCategory(cat)}
            />
          ))}
        </CategoryFilters>
      </>
    )}
  </Section>
</BlueprintSettings>
```

---

## 3. Recommendation Logic

### 3.1 Generation from Blueprint Domain Coverage

**Source:** `blueprint_domain_coverage` table with `status IN ('gap', 'partial')`

**Mapping:** `knowledge_domains.marketplace_categories` → `marketplace_recommendations.category`

**Function:** `generate_gap_recommendations(p_foundry_id)` (existing, needs extension for blueprint gaps)

**Algorithm:**

```sql
-- Enhanced version of generate_gap_recommendations()
-- Generates recommendations from blueprint_domain_coverage gaps

CREATE OR REPLACE FUNCTION public.generate_blueprint_gap_recommendations(
  p_blueprint_id uuid
)
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
  v_gap RECORD;
  v_domain RECORD;
  v_category text;
  v_priority integer;
BEGIN
  -- Find all gaps/partial coverage domains
  FOR v_gap IN 
    SELECT 
      bdc.id as coverage_id,
      bdc.domain_id,
      bdc.status,
      bdc.is_critical,
      bdc.domain_name,
      bdc.domain_path,
      kd.marketplace_categories,
      kd.criticality
    FROM blueprint_domain_coverage bdc
    JOIN knowledge_domains kd ON kd.id = bdc.domain_id
    WHERE bdc.blueprint_id = p_blueprint_id
      AND bdc.status IN ('gap', 'partial')
      AND bdc.status != 'not_needed'
  LOOP
    -- Skip if domain has no marketplace categories
    IF v_gap.marketplace_categories IS NULL OR array_length(v_gap.marketplace_categories, 1) = 0 THEN
      CONTINUE;
    END IF;
    
    -- Generate one recommendation per marketplace category
    FOREACH v_category IN ARRAY v_gap.marketplace_categories
    LOOP
      -- Calculate priority based on criticality and gap status
      v_priority := CASE
        WHEN v_gap.is_critical AND v_gap.status = 'gap' THEN 90
        WHEN v_gap.is_critical AND v_gap.status = 'partial' THEN 75
        WHEN v_gap.criticality = 'critical' AND v_gap.status = 'gap' THEN 80
        WHEN v_gap.criticality = 'critical' AND v_gap.status = 'partial' THEN 65
        WHEN v_gap.criticality = 'important' AND v_gap.status = 'gap' THEN 60
        WHEN v_gap.criticality = 'important' AND v_gap.status = 'partial' THEN 50
        ELSE 40
      END;
      
      -- Insert recommendation
      INSERT INTO public.marketplace_recommendations (
        foundry_id,
        source_type,
        source_id,
        category,
        subcategory,
        search_term,
        reasoning,
        priority
      )
      VALUES (
        (SELECT foundry_id FROM blueprints WHERE id = p_blueprint_id),
        'coverage_gap',
        v_gap.coverage_id,
        v_category, -- Maps to 'People', 'Products', 'Services', 'AI'
        v_gap.domain_name,
        v_gap.domain_name, -- Search term defaults to domain name
        format(
          'Your blueprint has %s coverage in "%s". Consider finding %s expertise in the marketplace.',
          CASE v_gap.status WHEN 'gap' THEN 'a gap' ELSE 'partial' END,
          v_gap.domain_path,
          CASE v_category
            WHEN 'People' THEN 'people with'
            WHEN 'Products' THEN 'products for'
            WHEN 'Services' THEN 'services for'
            WHEN 'AI' THEN 'AI tools for'
            ELSE 'solutions for'
          END
        ),
        v_priority
      )
      ON CONFLICT DO NOTHING; -- Prevent duplicates
      
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.2 Category Mapping

**Source:** `knowledge_domains.marketplace_categories` (TEXT[])

**Target:** `marketplace_recommendations.category` (CHECK constraint: 'People', 'Products', 'Services', 'AI')

**Validation:**

```typescript
// Validate marketplace_categories before inserting into knowledge_domains
const VALID_MARKETPLACE_CATEGORIES = ['People', 'Products', 'Services', 'AI'] as const

function validateMarketplaceCategories(categories: string[]): boolean {
  return categories.every(cat => 
    VALID_MARKETPLACE_CATEGORIES.includes(cat as any)
  )
}
```

**Example Domain → Category Mapping:**

| Domain | marketplace_categories | Example Recommendation |
|--------|----------------------|------------------------|
| "Battery Safety" | `['Products', 'Services']` | Products: Battery management ICs<br>Services: Safety certification consultants |
| "PCB Layout" | `['People', 'Services']` | People: PCB layout engineers<br>Services: PCB design houses |
| "Regulatory Compliance" | `['Services', 'AI']` | Services: Compliance consultants<br>AI: Compliance checking tools |
| "Thermal Management" | `['Products', 'People']` | Products: Thermal interface materials<br>People: Thermal engineers |

### 3.3 Priority Calculation

**Factors:**

1. **Coverage Status**: `gap` > `partial` (higher priority for complete gaps)
2. **Criticality Flag**: `is_critical = true` increases priority by +15
3. **Domain Criticality**: `criticality = 'critical'` increases priority by +10
4. **Stage Relevance**: Early-stage domains (concept/prototype) get +5 priority

**Formula:**

```typescript
function calculateRecommendationPriority(
  status: 'gap' | 'partial',
  isCritical: boolean,
  domainCriticality: 'critical' | 'important' | 'nice-to-have',
  projectStage: string
): number {
  let priority = 40 // Base
  
  // Status multiplier
  if (status === 'gap') priority += 20
  else if (status === 'partial') priority += 10
  
  // Criticality multipliers
  if (isCritical) priority += 15
  if (domainCriticality === 'critical') priority += 10
  else if (domainCriticality === 'important') priority += 5
  
  // Stage relevance (early stages need more help)
  if (['concept', 'prototype'].includes(projectStage)) {
    priority += 5
  }
  
  return Math.min(100, Math.max(0, priority))
}
```

---

## 4. Gating Rules

### 4.1 No Aggressive CTAs for Unverified AI Content

**Rule:** If a gap domain contains AI-suggested content with `verification_status != 'approved'`, recommendations must use **informational tone**, not aggressive CTAs.

**Implementation:**

```typescript
async function generateRecommendation(
  coverage: BlueprintDomainCoverage,
  domain: KnowledgeDomain
): Promise<MarketplaceRecommendation | null> {
  // Check if domain has unverified AI content
  const hasUnverifiedAI = await checkUnverifiedAIContent(coverage.id)
  
  if (hasUnverifiedAI) {
    // Use informational tone, no CTA
    return {
      reasoning: `This domain may need ${domain.name} expertise. Review the domain coverage before engaging marketplace resources.`,
      cta_style: 'informational', // No "Find Now" button
      priority: Math.max(30, calculatedPriority - 20) // Reduce priority
    }
  }
  
  // Normal recommendation for verified/user-entered content
  return {
    reasoning: `Your blueprint has a gap in ${domain.name}. Consider finding ${category} expertise in the marketplace.`,
    cta_style: 'actionable', // "Browse Marketplace" button
    priority: calculatedPriority
  }
}
```

**UI Pattern:**

```tsx
// Unverified AI content → Informational badge
{hasUnverifiedAI && (
  <Alert variant="info">
    <InfoIcon />
    <AlertTitle>Review recommended</AlertTitle>
    <AlertDescription>
      This recommendation is based on AI-suggested content that hasn't been verified yet.
      Review the domain coverage before engaging marketplace resources.
    </AlertDescription>
  </Alert>
)}

// Verified content → Actionable CTA
{!hasUnverifiedAI && (
  <Button onClick={browseMarketplace}>
    Browse {category} Marketplace
  </Button>
)}
```

### 4.2 Stage-Aware Gating

**Rule:** Recommendations must match project maturity. Early-stage projects get exploratory recommendations; production-stage projects get specific, qualified recommendations.

**Stage Rules:**

| Stage | Recommendation Style | Priority Adjustment | Example |
|-------|---------------------|---------------------|---------|
| `concept` | Exploratory, educational | +5 priority | "Learn about battery safety standards" |
| `prototype` | Proof-of-concept focused | +0 priority | "Find rapid prototyping services" |
| `evt` | Validation-focused | -5 priority | "Find EVT testing labs" |
| `dvt` | Production-readiness | -10 priority | "Find production-ready suppliers" |
| `production` | Operational support | -15 priority | "Find ongoing maintenance services" |
| `launched` | Sustaining only | -20 priority | "Find sustaining engineering support" |

**Implementation:**

```typescript
function adjustPriorityForStage(
  basePriority: number,
  projectStage: string,
  domainStageRelevance: string
): number {
  let adjustment = 0
  
  // Stage-specific adjustments
  switch (projectStage) {
    case 'concept':
      adjustment = +5 // Early stages need more help
      break
    case 'prototype':
      adjustment = 0
      break
    case 'evt':
    case 'dvt':
      adjustment = -5
      break
    case 'production':
      adjustment = -15
      break
    case 'launched':
      adjustment = -20 // Sustaining only
      break
  }
  
  // Domain stage relevance check
  // If domain is "not_applicable" for current stage, reduce priority further
  if (domainStageRelevance === 'not_applicable') {
    adjustment -= 30
  }
  
  return Math.max(0, Math.min(100, basePriority + adjustment))
}
```

### 4.3 Risk-Aware Gating

**Rule:** High-risk domains (from risk heatmap) get **cautious recommendations** with risk warnings, not aggressive CTAs.

**Risk Thresholds:**

| Risk Score | Recommendation Style | Warning Required |
|------------|---------------------|------------------|
| 0-2 (Low) | Normal actionable CTA | No |
| 3 (Moderate) | Normal with risk note | Optional |
| 4 (High) | Cautious tone, risk warning | Yes |
| 5 (Severe) | Informational only, no CTA | Yes, prominent |

**Implementation:**

```typescript
async function generateRiskAwareRecommendation(
  coverage: BlueprintDomainCoverage,
  riskScore: number
): Promise<MarketplaceRecommendation> {
  const baseRec = await generateBaseRecommendation(coverage)
  
  if (riskScore >= 4) {
    // High risk: Cautious tone, no aggressive CTA
    return {
      ...baseRec,
      reasoning: `⚠️ High-risk domain: ${baseRec.reasoning} Proceed with caution and expert consultation.`,
      cta_style: 'informational',
      priority: Math.max(30, baseRec.priority - 15),
      risk_warning: {
        level: riskScore >= 5 ? 'severe' : 'high',
        message: 'This domain has significant risk factors. Consult experts before making decisions.'
      }
    }
  }
  
  if (riskScore === 3) {
    // Moderate risk: Add risk note
    return {
      ...baseRec,
      reasoning: `${baseRec.reasoning} Note: This domain has moderate risk factors.`,
      risk_warning: {
        level: 'moderate',
        message: 'Review risk factors before proceeding.'
      }
    }
  }
  
  // Low risk: Normal recommendation
  return baseRec
}
```

**UI Pattern:**

```tsx
{recommendation.risk_warning && (
  <Alert variant={recommendation.risk_warning.level === 'severe' ? 'destructive' : 'warning'}>
    <AlertTriangleIcon />
    <AlertTitle>Risk Warning</AlertTitle>
    <AlertDescription>
      {recommendation.risk_warning.message}
    </AlertDescription>
  </Alert>
)}
```

### 4.4 User Preference Gating

**Rule:** Respect user's global and per-blueprint preferences. If recommendations are disabled, do not generate or display them.

**Implementation:**

```typescript
async function shouldGenerateRecommendations(
  blueprintId: string,
  userId: string
): Promise<boolean> {
  // Check global user preference
  const userSettings = await getUserSettings(userId)
  if (!userSettings.marketplace_recommendations_enabled) {
    return false
  }
  
  // Check blueprint-specific preference
  const blueprint = await getBlueprint(blueprintId)
  if (blueprint.settings?.marketplace_overlay_enabled === false) {
    return false
  }
  
  return true
}
```

---

## 5. Abuse & Failure Scenarios

### 5.1 Scenario: Spam Recommendations

**Description:** System generates excessive recommendations (e.g., 100+ per blueprint), overwhelming users and degrading trust.

**Mitigation:**

1. **Rate Limiting**: Max 20 recommendations per blueprint at any time
2. **Deduplication**: Prevent duplicate recommendations for same domain+category
3. **Expiration**: Auto-expire recommendations after 30 days if not acted upon
4. **User Feedback**: Track dismissal rate; if >80% dismissed, reduce generation frequency

```typescript
// Rate limiting
const MAX_RECOMMENDATIONS_PER_BLUEPRINT = 20

async function generateRecommendations(blueprintId: string) {
  const existing = await getActiveRecommendations(blueprintId)
  if (existing.length >= MAX_RECOMMENDATIONS_PER_BLUEPRINT) {
    // Remove lowest-priority recommendations first
    const sorted = existing.sort((a, b) => a.priority - b.priority)
    const toRemove = sorted.slice(0, newRecs.length)
    await dismissRecommendations(toRemove.map(r => r.id))
  }
}

// Deduplication
async function insertRecommendation(rec: MarketplaceRecommendation) {
  const existing = await db.query(`
    SELECT id FROM marketplace_recommendations
    WHERE foundry_id = $1
      AND source_type = $2
      AND source_id = $3
      AND category = $4
      AND is_dismissed = false
  `, [rec.foundry_id, rec.source_type, rec.source_id, rec.category])
  
  if (existing.length > 0) {
    return // Skip duplicate
  }
  
  await db.insert('marketplace_recommendations', rec)
}
```

### 5.2 Scenario: Misleading Recommendations

**Description:** Recommendations point to irrelevant marketplace categories or vendors that don't actually solve the gap.

**Mitigation:**

1. **Category Validation**: Ensure `knowledge_domains.marketplace_categories` is validated against actual marketplace inventory
2. **Search Term Quality**: Use domain name + context, not generic terms
3. **User Feedback Loop**: Track "not helpful" clicks; reduce priority for low-quality recommendations
4. **Human Review**: Flag recommendations with <30% click-through rate for manual review

```typescript
// Search term quality
function generateSearchTerm(domain: KnowledgeDomain, category: string): string {
  // Use domain name + category-specific context
  const base = domain.name
  
  switch (category) {
    case 'People':
      return `${base} expert` // e.g., "Battery Safety expert"
    case 'Products':
      return `${base} components` // e.g., "Battery Safety components"
    case 'Services':
      return `${base} consulting` // e.g., "Battery Safety consulting"
    case 'AI':
      return `${base} tools` // e.g., "Battery Safety tools"
    default:
      return base
  }
}

// Feedback tracking
interface RecommendationFeedback {
  recommendation_id: string
  helpful: boolean
  clicked: boolean
  converted: boolean // User engaged with marketplace listing
}

async function trackFeedback(feedback: RecommendationFeedback) {
  await db.insert('marketplace_recommendation_feedback', feedback)
  
  // If low quality, reduce future priority
  if (!feedback.helpful && !feedback.converted) {
    await db.query(`
      UPDATE marketplace_recommendations
      SET priority = priority - 10
      WHERE id = $1
    `, [feedback.recommendation_id])
  }
}
```

### 5.3 Scenario: Commercial Bias

**Description:** System prioritizes recommendations that generate revenue over those that best solve user needs.

**Mitigation:**

1. **Priority Formula Transparency**: Document priority calculation; no hidden "revenue multiplier"
2. **User Override**: Allow users to manually adjust recommendation priority
3. **Audit Log**: Log all recommendation generation for compliance review
4. **A/B Testing**: Test recommendation quality vs. revenue impact

```typescript
// Transparent priority calculation (no revenue factors)
function calculatePriority(
  status: string,
  criticality: string,
  isCritical: boolean
): number {
  // Pure engineering factors only
  // NO: marketplace_listing.revenue_share
  // NO: vendor.sponsorship_status
  // NO: conversion_rate (unless user benefit)
  
  return basePriority + criticalityBonus + statusBonus
}

// Audit log
interface RecommendationAuditLog {
  recommendation_id: string
  blueprint_id: string
  domain_id: string
  priority: number
  priority_factors: {
    status: string
    criticality: string
    is_critical: boolean
    stage: string
    risk_score?: number
  }
  generated_at: timestamp
  generated_by: 'system' | 'user'
}
```

### 5.4 Scenario: Privacy Leakage

**Description:** Recommendations expose sensitive blueprint information (e.g., product details, IP) to marketplace vendors.

**Mitigation:**

1. **Anonymized Search Terms**: Use generic domain names, not product-specific details
2. **Opt-In Sharing**: Require explicit consent before sharing blueprint context with vendors
3. **Redaction**: Strip sensitive metadata (product specs, IP details) from recommendation context
4. **Audit Trail**: Log all data shared with marketplace vendors

```typescript
// Anonymized search terms
function generateAnonymizedSearchTerm(
  domain: KnowledgeDomain,
  category: string,
  blueprint: Blueprint
): string {
  // Use domain name only, not product-specific context
  const base = domain.name
  
  // ❌ WRONG: "Battery Safety for Consumer Drone Product"
  // ✅ CORRECT: "Battery Safety"
  
  return generateSearchTerm(domain, category) // Generic only
}

// Opt-in sharing
interface RecommendationSharing {
  recommendation_id: string
  vendor_id?: string
  shared_context: {
    domain_name: string
    gap_status: string
    // NO: product_description
    // NO: technical_specs
    // NO: IP_details
  }
  user_consent: boolean
  shared_at: timestamp
}
```

### 5.5 Scenario: Stale Recommendations

**Description:** Recommendations persist after gaps are resolved, confusing users.

**Mitigation:**

1. **Auto-Expiration**: Recommendations expire when source gap status changes to `covered`
2. **Status Sync**: Monitor `blueprint_domain_coverage.status` changes; invalidate related recommendations
3. **User Notification**: Notify users when recommendations become stale
4. **Cleanup Job**: Periodic job to remove stale recommendations

```typescript
// Auto-expiration on gap resolution
async function onCoverageStatusChanged(
  coverageId: string,
  newStatus: string
) {
  if (newStatus === 'covered') {
    // Expire all recommendations from this coverage
    await db.query(`
      UPDATE marketplace_recommendations
      SET expires_at = now(),
          reasoning = reasoning || ' (Gap resolved)'
      WHERE source_type = 'coverage_gap'
        AND source_id = $1
        AND is_dismissed = false
    `, [coverageId])
  }
}

// Trigger on blueprint_domain_coverage updates
CREATE TRIGGER trg_invalidate_recommendations_on_coverage_change
  AFTER UPDATE OF status ON blueprint_domain_coverage
  FOR EACH ROW
  WHEN (NEW.status = 'covered' AND OLD.status != 'covered')
  EXECUTE FUNCTION invalidate_recommendations();
```

### 5.6 Scenario: Over-Promising Solutions

**Description:** Recommendations imply marketplace vendors can solve complex gaps that require internal expertise.

**Mitigation:**

1. **Tone Moderation**: Use "consider" language, not "you need" language
2. **Expertise Level Clarity**: Distinguish between "consulting" (guidance) vs. "execution" (doing the work)
3. **Limitation Disclaimers**: Add disclaimers for critical domains requiring internal knowledge
4. **User Education**: Provide context about when to use marketplace vs. build internally

```typescript
// Tone moderation
function generateReasoning(
  domain: KnowledgeDomain,
  status: string,
  isCritical: boolean
): string {
  if (isCritical) {
    return `Your blueprint has a critical gap in ${domain.name}. Consider consulting with ${category} experts to understand requirements before building internally.`
  }
  
  return `Your blueprint has ${status} coverage in ${domain.name}. You may find ${category} resources in the marketplace helpful.`
}

// Limitation disclaimers
{isCritical && (
  <Alert variant="info">
    <InfoIcon />
    <AlertDescription>
      Critical domains often require internal expertise. Marketplace resources can provide guidance, but may not replace internal knowledge.
    </AlertDescription>
  </Alert>
)}
```

### 5.7 Scenario: Vendor Manipulation

**Description:** Vendors game the system by creating listings that match common domain names, appearing in irrelevant recommendations.

**Mitigation:**

1. **Category Enforcement**: Strict category matching; vendors cannot appear in wrong categories
2. **Verification Required**: Only verified vendors appear in recommendations
3. **Relevance Scoring**: Use marketplace listing metadata to score relevance; filter low-relevance matches
4. **User Reporting**: Allow users to report irrelevant vendor matches

```typescript
// Relevance scoring
interface MarketplaceListingRelevance {
  listing_id: string
  recommendation_id: string
  relevance_score: number // 0-100
  match_factors: {
    category_match: boolean
    subcategory_match: boolean
    keyword_match: number // 0-1
    verified: boolean
  }
}

async function scoreListingRelevance(
  listing: MarketplaceListing,
  recommendation: MarketplaceRecommendation
): Promise<number> {
  let score = 0
  
  // Category must match exactly
  if (listing.category !== recommendation.category) {
    return 0 // No match
  }
  
  score += 40 // Base category match
  
  // Subcategory match
  if (listing.subcategory === recommendation.subcategory) {
    score += 30
  }
  
  // Keyword match
  const keywordMatch = calculateKeywordOverlap(
    listing.title + ' ' + listing.description,
    recommendation.search_term
  )
  score += keywordMatch * 20
  
  // Verification bonus
  if (listing.is_verified) {
    score += 10
  }
  
  return Math.min(100, score)
}

// Filter low-relevance matches
const MIN_RELEVANCE_SCORE = 50

async function getRelevantListings(recommendationId: string) {
  const recommendation = await getRecommendation(recommendationId)
  const allListings = await getMarketplaceListings(recommendation.category)
  
  const scored = await Promise.all(
    allListings.map(listing => 
      scoreListingRelevance(listing, recommendation)
    )
  )
  
  return scored
    .filter(s => s.relevance_score >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => b.relevance_score - a.relevance_score)
}
```

### 5.8 Scenario: Recommendation Fatigue

**Description:** Users see the same recommendations repeatedly, leading to dismissal and reduced engagement.

**Mitigation:**

1. **Dismissal Memory**: Remember dismissed recommendations; don't regenerate for 90 days
2. **Variety**: Rotate recommendations if multiple categories match same domain
3. **Freshness**: Prioritize recently generated recommendations
4. **User Feedback**: Track engagement; reduce frequency if user consistently dismisses

```typescript
// Dismissal memory
interface DismissedRecommendation {
  recommendation_id: string
  domain_id: string
  category: string
  dismissed_at: timestamp
  dismissed_by: string
  expires_at: timestamp // 90 days from dismissal
}

async function shouldGenerateRecommendation(
  domainId: string,
  category: string,
  userId: string
): Promise<boolean> {
  const dismissed = await db.query(`
    SELECT id FROM dismissed_recommendations
    WHERE domain_id = $1
      AND category = $2
      AND dismissed_by = $3
      AND expires_at > now()
  `, [domainId, category, userId])
  
  return dismissed.length === 0 // Don't regenerate if recently dismissed
}

// Variety rotation
async function generateRecommendationsWithVariety(
  gaps: BlueprintDomainCoverage[]
) {
  const categoryCounts: Record<string, number> = {}
  
  for (const gap of gaps) {
    const domain = await getDomain(gap.domain_id)
    const categories = domain.marketplace_categories
    
    // Prefer categories with fewer existing recommendations
    const sortedCategories = categories.sort((a, b) => 
      (categoryCounts[a] || 0) - (categoryCounts[b] || 0)
    )
    
    // Generate recommendation for least-used category
    const chosenCategory = sortedCategories[0]
    await generateRecommendation(gap, chosenCategory)
    categoryCounts[chosenCategory] = (categoryCounts[chosenCategory] || 0) + 1
  }
}
```

### 5.9 Scenario: Inappropriate Recommendations for Stage

**Description:** System recommends production-ready solutions for concept-stage projects, or vice versa.

**Mitigation:**

1. **Stage Filtering**: Filter marketplace listings by `project_stage` compatibility
2. **Stage-Aware Reasoning**: Adjust recommendation reasoning based on stage
3. **Stage Metadata**: Store `project_stage` in recommendation metadata for filtering
4. **User Override**: Allow users to see "all stages" if desired

```typescript
// Stage filtering
interface MarketplaceListing {
  id: string
  category: string
  stage_compatibility: string[] // e.g., ['prototype', 'evt', 'dvt']
  // ...
}

async function filterListingsByStage(
  listings: MarketplaceListing[],
  projectStage: string
): Promise<MarketplaceListing[]> {
  return listings.filter(listing =>
    listing.stage_compatibility.includes(projectStage) ||
    listing.stage_compatibility.length === 0 // Universal compatibility
  )
}

// Stage-aware reasoning
function generateStageAwareReasoning(
  domain: KnowledgeDomain,
  projectStage: string,
  category: string
): string {
  const stageContext = {
    concept: 'exploratory',
    prototype: 'proof-of-concept',
    evt: 'validation',
    dvt: 'production-readiness',
    production: 'operational',
    launched: 'sustaining'
  }[projectStage]
  
  return `Your ${stageContext} project has a gap in ${domain.name}. Consider ${category} resources appropriate for ${projectStage} stage.`
}
```

### 5.10 Scenario: AI Hallucination in Recommendations

**Description:** AI-generated recommendation reasoning contains false or misleading information about the gap.

**Mitigation:**

1. **Template-Based Reasoning**: Use structured templates instead of free-form AI generation
2. **Fact Verification**: Verify all facts (domain name, status, criticality) against database before generating reasoning
3. **Human Review**: Flag recommendations with unusual reasoning for manual review
4. **User Correction**: Allow users to edit recommendation reasoning if incorrect

```typescript
// Template-based reasoning (no AI generation)
function generateReasoningTemplate(
  domain: KnowledgeDomain,
  status: 'gap' | 'partial',
  category: string,
  isCritical: boolean
): string {
  // Use verified facts only
  const statusText = status === 'gap' ? 'a gap' : 'partial coverage'
  const criticalityText = isCritical ? 'critical ' : ''
  const categoryText = {
    'People': 'people with expertise',
    'Products': 'products',
    'Services': 'services',
    'AI': 'AI tools'
  }[category]
  
  return `Your blueprint has ${statusText} in the ${criticalityText}domain "${domain.name}". Consider finding ${categoryText} in the marketplace.`
}

// Fact verification
async function verifyRecommendationFacts(
  recommendation: MarketplaceRecommendation
): Promise<boolean> {
  const coverage = await getCoverage(recommendation.source_id)
  const domain = await getDomain(coverage.domain_id)
  
  // Verify all facts match database
  if (coverage.status !== 'gap' && coverage.status !== 'partial') {
    return false // Invalid source
  }
  
  if (!domain.marketplace_categories.includes(recommendation.category)) {
    return false // Category mismatch
  }
  
  return true
}
```

### 5.11 Scenario: Cross-Foundry Data Leakage

**Description:** Recommendations from one foundry's blueprint leak into another foundry's marketplace view.

**Mitigation:**

1. **RLS Enforcement**: Ensure `marketplace_recommendations` RLS policies are strict
2. **Foundry Isolation**: Always filter by `foundry_id` in all queries
3. **Audit Logging**: Log all recommendation access for security review
4. **Testing**: Regular security tests to verify isolation

```sql
-- RLS policy (already exists, verify it's correct)
CREATE POLICY "Users can view recommendations in their foundry" 
  ON public.marketplace_recommendations
  FOR SELECT
  USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
  );

-- Always include foundry_id in queries
SELECT * FROM marketplace_recommendations
WHERE foundry_id = get_my_foundry_id() -- Never trust client-provided foundry_id
  AND is_dismissed = false
```

### 5.12 Scenario: Performance Degradation

**Description:** Generating recommendations for large blueprints (100+ domains) causes slow page loads.

**Mitigation:**

1. **Lazy Loading**: Load recommendations on-demand, not on blueprint page load
2. **Pagination**: Limit recommendations per page (e.g., 10 at a time)
3. **Caching**: Cache recommendation generation results for 1 hour
4. **Background Jobs**: Generate recommendations asynchronously; notify when ready

```typescript
// Lazy loading
async function loadRecommendations(
  blueprintId: string,
  page: number = 1,
  limit: number = 10
) {
  return await db.query(`
    SELECT * FROM marketplace_recommendations
    WHERE foundry_id = get_my_foundry_id()
      AND source_type = 'coverage_gap'
      AND source_id IN (
        SELECT id FROM blueprint_domain_coverage
        WHERE blueprint_id = $1
      )
      AND is_dismissed = false
    ORDER BY priority DESC, created_at DESC
    LIMIT $2 OFFSET $3
  `, [blueprintId, limit, (page - 1) * limit])
}

// Background generation
async function generateRecommendationsAsync(blueprintId: string) {
  // Queue job
  await queueJob('generate_recommendations', {
    blueprint_id: blueprintId,
    user_id: auth.uid()
  })
  
  // Return immediately
  return { status: 'queued', job_id: jobId }
}

// Notify when ready
async function onRecommendationsReady(blueprintId: string, userId: string) {
  await sendNotification(userId, {
    type: 'marketplace_recommendations_ready',
    blueprint_id: blueprintId,
    message: 'Your marketplace recommendations are ready.'
  })
}
```

---

## 6. Metrics & Analytics

### 6.1 Conversion Metrics

**Definition:** Track user engagement with recommendations leading to marketplace actions.

**Metrics:**

1. **Recommendation Click-Through Rate (CTR)**
   ```typescript
   CTR = (clicks / impressions) * 100
   ```

2. **Marketplace Engagement Rate**
   ```typescript
   Engagement Rate = (users who clicked recommendation AND viewed marketplace listing) / total recommendations shown
   ```

3. **Conversion Rate**
   ```typescript
   Conversion Rate = (users who engaged with marketplace listing) / total recommendations shown
   ```

4. **Category Performance**
   ```typescript
   Category CTR = clicks per category / impressions per category
   ```

**Analytics Events:**

```typescript
// Recommendation shown
trackEvent('marketplace_recommendation_shown', {
  recommendation_id: string
  blueprint_id: string
  domain_id: string
  category: string
  priority: number
  source_type: string
})

// Recommendation clicked
trackEvent('marketplace_recommendation_clicked', {
  recommendation_id: string
  blueprint_id: string
  category: string
  clicked_at: timestamp
})

// Marketplace listing viewed (from recommendation)
trackEvent('marketplace_listing_viewed_from_recommendation', {
  recommendation_id: string
  listing_id: string
  category: string
})

// Recommendation dismissed
trackEvent('marketplace_recommendation_dismissed', {
  recommendation_id: string
  blueprint_id: string
  category: string
  dismissal_reason?: string
})
```

### 6.2 Retention Metrics

**Definition:** Measure how recommendations impact user retention and blueprint engagement.

**Metrics:**

1. **Blueprint Return Rate**
   ```typescript
   Return Rate = (users who returned to blueprint after seeing recommendation) / total users who saw recommendation
   ```

2. **Recommendation Re-engagement**
   ```typescript
   Re-engagement = (users who clicked recommendation on return visit) / total users who dismissed recommendation
   ```

3. **Blueprint Completion Rate**
   ```typescript
   Completion Rate = (blueprints with all gaps resolved) / total blueprints with recommendations
   ```

**Analytics Events:**

```typescript
// User returned to blueprint
trackEvent('blueprint_returned_after_recommendation', {
  blueprint_id: string
  days_since_recommendation: number
  recommendation_id?: string
})

// Gap resolved after recommendation
trackEvent('gap_resolved_after_recommendation', {
  blueprint_id: string
  domain_id: string
  recommendation_id: string
  days_to_resolution: number
})
```

### 6.3 Trust Signals

**Definition:** Measure user trust in recommendations through feedback and behavior.

**Metrics:**

1. **Helpfulness Score**
   ```typescript
   Helpfulness = (helpful votes - not_helpful votes) / total votes
   ```

2. **Dismissal Rate**
   ```typescript
   Dismissal Rate = dismissed recommendations / total recommendations shown
   ```

3. **False Positive Rate**
   ```typescript
   False Positive Rate = (recommendations marked "not relevant") / total recommendations
   ```

4. **User Override Rate**
   ```typescript
   Override Rate = (users who manually adjusted recommendation priority) / total recommendations
   ```

**Analytics Events:**

```typescript
// User feedback on recommendation
trackEvent('marketplace_recommendation_feedback', {
  recommendation_id: string
  helpful: boolean
  relevant: boolean
  feedback_text?: string
})

// User adjusted recommendation priority
trackEvent('marketplace_recommendation_priority_adjusted', {
  recommendation_id: string
  old_priority: number
  new_priority: number
  user_id: string
})

// Recommendation marked as false positive
trackEvent('marketplace_recommendation_false_positive', {
  recommendation_id: string
  domain_id: string
  category: string
  reason?: string
})
```

### 6.4 Quality Metrics

**Definition:** Measure recommendation quality and relevance.

**Metrics:**

1. **Relevance Score** (from marketplace listing matching)
   ```typescript
   Relevance Score = average relevance_score of listings shown for recommendation
   ```

2. **Category Match Accuracy**
   ```typescript
   Match Accuracy = (recommendations with correct category) / total recommendations
   ```

3. **Search Term Effectiveness**
   ```typescript
   Search Effectiveness = (successful marketplace searches) / total recommendation clicks
   ```

**Analytics Events:**

```typescript
// Marketplace search performed (from recommendation)
trackEvent('marketplace_search_from_recommendation', {
  recommendation_id: string
  search_term: string
  category: string
  results_count: number
})

// Listing relevance scored
trackEvent('marketplace_listing_relevance_scored', {
  recommendation_id: string
  listing_id: string
  relevance_score: number
  match_factors: object
})
```

### 6.5 Dashboard Metrics

**Summary Dashboard:**

```typescript
interface RecommendationMetrics {
  // Overall performance
  total_recommendations_generated: number
  active_recommendations: number
  dismissed_recommendations: number
  expired_recommendations: number
  
  // Engagement
  overall_ctr: number
  category_ctr: Record<string, number>
  average_priority: number
  
  // Trust
  helpfulness_score: number
  dismissal_rate: number
  false_positive_rate: number
  
  // Quality
  average_relevance_score: number
  category_match_accuracy: number
  
  // Time-based
  recommendations_generated_last_7_days: number
  recommendations_generated_last_30_days: number
  trend: 'increasing' | 'decreasing' | 'stable'
}
```

---

## 7. Implementation Checklist

### 7.1 Database Changes

- [ ] Verify `marketplace_recommendations` table exists with required columns
- [ ] Verify `knowledge_domains.marketplace_categories` column exists (TEXT[])
- [ ] Create `generate_blueprint_gap_recommendations()` function
- [ ] Create trigger to invalidate recommendations when coverage status changes
- [ ] Add `marketplace_recommendation_feedback` table for user feedback
- [ ] Add indexes for performance (foundry_id, source_id, category, priority)

### 7.2 API Endpoints

- [ ] `GET /api/blueprints/:id/recommendations` - Get recommendations for blueprint
- [ ] `POST /api/recommendations/:id/dismiss` - Dismiss recommendation
- [ ] `POST /api/recommendations/:id/feedback` - Submit feedback
- [ ] `POST /api/blueprints/:id/generate-recommendations` - Manually trigger generation
- [ ] `GET /api/recommendations/metrics` - Get recommendation metrics (admin)

### 7.3 UI Components

- [ ] `RecommendationCard` component with transparency fields
- [ ] `RecommendationSettings` component for user controls
- [ ] `MarketplaceOverlay` component for blueprint canvas
- [ ] `RecommendationPanel` sidebar/drawer
- [ ] `RiskWarningAlert` component for high-risk recommendations
- [ ] `UnverifiedAIContentAlert` component

### 7.4 Business Logic

- [ ] Implement priority calculation function
- [ ] Implement stage-aware gating logic
- [ ] Implement risk-aware gating logic
- [ ] Implement unverified AI content detection
- [ ] Implement recommendation deduplication
- [ ] Implement rate limiting (max 20 per blueprint)
- [ ] Implement auto-expiration on gap resolution

### 7.5 Analytics Integration

- [ ] Implement recommendation_shown event
- [ ] Implement recommendation_clicked event
- [ ] Implement recommendation_dismissed event
- [ ] Implement recommendation_feedback event
- [ ] Create metrics dashboard query
- [ ] Set up alerts for low CTR or high dismissal rate

### 7.6 Testing

- [ ] Unit tests for priority calculation
- [ ] Unit tests for gating rules
- [ ] Integration tests for recommendation generation
- [ ] Integration tests for recommendation invalidation
- [ ] E2E tests for recommendation UI flow
- [ ] Security tests for foundry isolation
- [ ] Performance tests for large blueprints (100+ domains)

### 7.7 Documentation

- [ ] Update API documentation with recommendation endpoints
- [ ] Create user guide for recommendation settings
- [ ] Document priority calculation formula
- [ ] Document gating rules for support team
- [ ] Create runbook for recommendation quality issues

---

## Changes Made

### Files Created
- `/docs/blueprint/06-monetization-trust.md` - Complete monetization and trust framework specification

### Files Updated
- `/docs/blueprint/INDEX.md` - Updated document map: Step 6 status changed from "pending" to "complete"
- `/docs/blueprint/ORCHESTRATION.md` - Updated Wave 5 status: Step 6 marked complete with completion date

### Key Additions to INDEX.md
- No new enums defined (uses existing `marketplace_category` enum)
- Documented relationship to existing `marketplace_recommendations` table and `generate_gap_recommendations()` function
- Referenced `knowledge_domains.marketplace_categories` field for recommendation generation

### Key Additions to ORCHESTRATION.md
- Step 6 marked complete with completion date 2026-02-01
- Wave 5 progress updated (1 of 2 steps complete)
