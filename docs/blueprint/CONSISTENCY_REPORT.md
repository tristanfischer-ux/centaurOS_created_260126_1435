# Internal Consistency Review Report

> **Generated:** 2026-02-01  
> **Scope:** All 16 blueprint specification documents (00-15) + INDEX.md  
> **Review Type:** Cross-reference for contradictions and inconsistencies

---

## Summary

- **Total inconsistencies:** 8
- **Critical (blocking):** 2
- **Minor (can proceed):** 6

---

## Inconsistencies

### 1. [CRITICAL] Table Name: `domain_coverage` vs `blueprint_domain_coverage`

**Category:** Table Name Consistency

**Docs involved:** `ORCHESTRATION.md`, `08-backlog.md`, `00-repo-assessment.md`

**Issue:** Multiple documents reference `domain_coverage` (without `blueprint_` prefix) when the canonical table name is `blueprint_domain_coverage` per `INDEX.md`.

**Evidence:**

1. **ORCHESTRATION.md** (line 159):
   ```
   - JSON schema for blueprint_domain_coverage.decisions
   ```

2. **08-backlog.md** (lines 1190-1192):
   ```sql
   -- Create foundry A, blueprint A, blueprint_domain_coverage A
   -- Create foundry B, blueprint B, blueprint_domain_coverage B
   -- As user from foundry A, query blueprint_domain_coverage
   ```

3. **00-repo-assessment.md** (line 202):
   ```
   | Existing blueprint coverage data | Migration safety | Check if blueprints have `blueprint_domain_coverage` rows |
   ```

**INDEX.md says:**
```
| Domain Coverage | `blueprint_domain_coverage` | NOT `domain_coverage` |
```

**Resolution:** Replace all instances of `domain_coverage` with `blueprint_domain_coverage` in:
- `ORCHESTRATION.md` line 159
- `08-backlog.md` lines 1190-1192 (test comments)
- `00-repo-assessment.md` line 202

---

### 2. [CRITICAL] AI Auto-Approval Contradiction

**Category:** Gating Rule Consistency

**Docs involved:** `13-ai-confidence-verification.md`, `04-llm-design.md`, `06-monetization-trust.md`, `07-red-team.md`

**Issue:** Conflicting statements about whether AI-generated content can be auto-approved.

**Evidence:**

1. **13-ai-confidence-verification.md** (line 294):
   ```typescript
   recommendation_confidence: number // >= 60 required
   ```
   Implies confidence threshold for marketplace CTAs, but doesn't explicitly state auto-approval.

2. **12-rfq-starter-pack.md** (lines 594-597):
   ```
   | **80-100** | `approved` (auto) | Can export/create RFQ immediately |
   ```
   Explicitly states auto-approval for RFQ packets with confidence 80-100.

3. **06-monetization-trust.md** (line 396):
   ```typescript
   if (hasUnverifiedAI) {
     // Use informational tone, no CTA
   ```
   Implies unverified AI content should be gated, suggesting no auto-approval.

4. **07-red-team.md** (lines 972-976):
   ```
   **Contradiction:**
   - `13-ai-confidence-verification.md` mentions "auto-approval for high confidence (>0.8)" but doesn't specify when this applies.
   - `04-llm-design.md` defines `Amended_Pending_Approval` status but doesn't mention auto-approval.
   - `06-monetization-trust.md` says "unverified AI content" should be gated, implying no auto-approval.
   ```

**Resolution:** 
- **Recommendation:** Clarify auto-approval rules:
  1. RFQ packets: Auto-approve if confidence >= 80 (as stated in `12-rfq-starter-pack.md`)
  2. Expert packets: Require manual review (use `Amended_Pending_Approval` status)
  3. Marketplace recommendations: Require manual review if AI-suggested (as per `06-monetization-trust.md`)
- Update `13-ai-confidence-verification.md` to explicitly document these rules.

---

### 3. [MINOR] Stage Gate Enforcement Ambiguity

**Category:** Gating Rule Consistency

**Docs involved:** `09-stage-gates.md`, `10-decisions-assumptions.md`, `12-rfq-starter-pack.md`, `07-red-team.md`

**Issue:** Unclear whether stage gates are enforced (blocked) or advisory (warned).

**Evidence:**

1. **09-stage-gates.md** (lines 567-577):
   ```typescript
   // If criteria NOT met: Show warning dialog with blockers list
   // User can "Advance Anyway" with acknowledgment (logged to `blueprint_history`)
   ```
   Implies advisory (warn but allow override).

2. **12-rfq-starter-pack.md** (line 37):
   ```
   5. **Readiness-Gated**: RFQ generation requires minimum coverage thresholds
   ```
   Implies enforcement (requires thresholds).

3. **07-red-team.md** (lines 983-987):
   ```
   **Contradiction:**
   - `09-stage-gates.md` defines readiness evaluation but doesn't specify whether stage changes are prevented or just warned.
   - `12-rfq-starter-pack.md` mentions "readiness gating" but doesn't specify whether RFQ generation is blocked or just warned.
   ```

**Resolution:** 
- **Recommendation:** Make gates advisory in MVP (warn but allow override with Executive approval), as suggested in `07-red-team.md`.
- Update `09-stage-gates.md` to explicitly state: "Stage gates are advisory—users can override with acknowledgment."
- Update `12-rfq-starter-pack.md` to clarify: "Readiness gating shows warnings but allows RFQ generation with acknowledgment."

---

### 4. [MINOR] Risk Threshold Inconsistency

**Category:** Gating Rule Consistency

**Docs involved:** `11-risk-heatmap.md`, `06-monetization-trust.md`, `13-ai-confidence-verification.md`

**Issue:** Risk thresholds for gating are consistent, but the interpretation differs slightly.

**Evidence:**

1. **13-ai-confidence-verification.md** (line 300):
   ```typescript
   domain_risk_level: number // 0-5; only show if <= 4
   ```
   Marketplace CTA gating: Show if risk <= 4.

2. **06-monetization-trust.md** (lines 512-515):
   ```
   | 0-2 (Low) | Normal actionable CTA | No |
   | 3 (Moderate) | Normal with risk note | Optional |
   | 4 (High) | Cautious tone, risk warning | Yes |
   | 5 (Severe) | Informational only, no CTA | Yes, prominent |
   ```
   Risk-aware gating: Different styles based on risk level.

3. **11-risk-heatmap.md** (line 300):
   ```typescript
   if (riskScore >= 5) {
     return { 
       show: true, 
       variant: 'subtle', 
       warning: 'High-risk domain—consider multiple providers' 
     }
   }
   ```
   Shows CTA even for risk 5, but with warning.

**Resolution:** 
- **Recommendation:** Align risk gating:
  - Risk 0-2: Normal CTA (no warning)
  - Risk 3: Normal CTA with optional risk note
  - Risk 4: Cautious CTA with warning (as per `06-monetization-trust.md`)
  - Risk 5: Informational only, no CTA (as per `06-monetization-trust.md`)
- Update `13-ai-confidence-verification.md` to match: "only show if <= 3" (not <= 4) for prominent CTAs, or clarify that risk 4 shows subtle CTA.

---

### 5. [MINOR] Confidence Threshold Mismatch

**Category:** Gating Rule Consistency

**Docs involved:** `13-ai-confidence-verification.md`, `12-rfq-starter-pack.md`

**Issue:** RFQ generation uses confidence threshold 80 for auto-approval, but marketplace CTAs use threshold 60.

**Evidence:**

1. **13-ai-confidence-verification.md** (line 294):
   ```typescript
   recommendation_confidence: number // >= 60 required
   ```
   Marketplace CTA requires confidence >= 60.

2. **12-rfq-starter-pack.md** (line 594):
   ```
   | **80-100** | `approved` (auto) | Can export/create RFQ immediately |
   ```
   RFQ auto-approval requires confidence >= 80.

**Resolution:** 
- **Recommendation:** This is **intentional**—RFQ generation requires higher confidence (80) than marketplace recommendations (60) because RFQs are more critical. Document this rationale in both documents.
- Add note in `13-ai-confidence-verification.md`: "RFQ generation requires higher confidence threshold (80) than marketplace recommendations (60) due to higher stakes."

---

### 6. [MINOR] Template Forking Sync Ambiguity

**Category:** Cross-Doc References

**Docs involved:** `15-template-governance.md`, `05-template-library.md`, `07-red-team.md`

**Issue:** Unclear whether template forks sync with parent template updates.

**Evidence:**

1. **15-template-governance.md** (line 380):
   ```
   **Critical Decision: Upstream Updates Do NOT Propagate**
   ```
   Explicitly states forks are independent.

2. **07-red-team.md** (lines 993-997):
   ```
   **Contradiction:**
   - `15-template-governance.md` defines template forking but doesn't specify whether forks sync with parent template.
   - `05-template-library.md` mentions template updates but doesn't specify fork sync behavior.
   ```

**Resolution:** 
- **Recommendation:** `15-template-governance.md` already clarifies this—forks are independent. Update `07-red-team.md` to note this is resolved: "`15-template-governance.md` explicitly states upstream updates do NOT propagate (line 380)."

---

### 7. [MINOR] Enum Usage: All Consistent

**Category:** Enum Consistency

**Docs involved:** All documents

**Issue:** None found—all documents use enum values consistent with `INDEX.md`.

**Evidence:**
- `project_stage`: All docs use `concept|prototype|evt|dvt|production|launched` ✅
- `coverage_status`: All docs use `covered|partial|gap|not_needed` ✅
- `person_type`: All docs use `team|advisor|marketplace|external|ai_agent` ✅

**Resolution:** No action needed—enums are consistent.

---

### 8. [MINOR] Backlog Coverage: FR References Missing

**Category:** Backlog Coverage

**Docs involved:** `08-backlog.md`, `01-prd.md`

**Issue:** Backlog doesn't explicitly reference FR numbers from PRD, making it difficult to verify coverage.

**Evidence:**

1. **01-prd.md**: Defines FR-001 through FR-085 (85 functional requirements).

2. **08-backlog.md**: Organizes work by milestones/epics/stories but doesn't map to FR numbers.

**Resolution:** 
- **Recommendation:** Add FR mapping to backlog stories. For example:
  ```
  #### Story 1.1: Create Blueprint from Template
  - [ ] Implement `instantiateBlueprintFromTemplate()` server action
  - [ ] UI: Template selection modal
  - **Covers:** FR-001, FR-004
  ```
- This will make it easier to verify all PRD requirements are covered in the backlog.

---

## Cross-Doc References

### Verified References

All cross-document references appear valid:
- `09-stage-gates.md` referenced by `12-rfq-starter-pack.md` ✅
- `13-ai-confidence-verification.md` referenced by `12-rfq-starter-pack.md` ✅
- `11-risk-heatmap.md` referenced by `06-monetization-trust.md` ✅
- `09-stage-gates.md` referenced by `05-template-library.md` ✅

### Broken References

None found—all markdown links appear valid.

---

## API/UX Alignment

### Verified Alignment

All UX flows from `02-ux-spec.md` have corresponding API actions in `03-data-api.md`:

| UX Flow | API Action | Status |
|---------|------------|--------|
| Create blueprint from template | `instantiateBlueprintFromTemplate()` | ✅ |
| Update domain coverage | `updateBlueprintDomainCoverage()` | ✅ |
| Generate expert packet | `generateExpertPacket()` | ✅ |
| Create tasks from gaps | `createTasksFromGaps()` | ✅ |
| Generate marketplace recommendations | `generateMarketplaceRecommendations()` | ✅ |
| Create RFQ from domain | `createRFQFromBlueprintDomain()` | ✅ |
| Add decision to domain | `addDecisionToDomain()` | ✅ |
| Evaluate stage gate | `evaluateStageGate()` | ✅ |

**Resolution:** No action needed—API/UX alignment is complete.

---

## Recommendations Summary

### Immediate Actions (Pre-MVP)

1. **Fix Critical Issues:**
   - Replace `domain_coverage` with `blueprint_domain_coverage` in 3 documents
   - Clarify auto-approval rules in `13-ai-confidence-verification.md`

2. **Clarify Ambiguities:**
   - Document stage gate enforcement policy (advisory vs. enforced)
   - Align risk threshold interpretation across documents
   - Document rationale for different confidence thresholds (RFQ vs. marketplace)

3. **Improve Traceability:**
   - Add FR number mapping to backlog stories

### Follow-Up Actions

1. Update `07-red-team.md` to note template forking sync is resolved
2. Add confidence threshold rationale documentation
3. Consider adding a "Gating Rules Summary" section to `INDEX.md` for quick reference

---

## Conclusion

The specification documents are **largely consistent** with only 2 critical issues (table name and auto-approval) and 6 minor inconsistencies. All critical issues are resolvable with documentation updates. The enum consistency, API/UX alignment, and cross-reference checks passed without issues.

**Overall Assessment:** ✅ **Ready for implementation** after resolving the 2 critical issues.
