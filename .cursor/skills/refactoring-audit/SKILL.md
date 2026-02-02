---
name: refactoring-audit
description: Systematic checklist to identify and flag messy code lacking documentation or context. Use when auditing code quality, finding technical debt, preparing for code review, or when the user mentions refactor, audit, messy code, technical debt, or code smell.
---

# Refactoring Audit Skill

This skill provides a systematic approach to identifying code that needs refactoring, prioritizing fixes, and applying consistent remediation patterns.

## Phase 1: Automated Scans

Run these commands to detect common code quality issues:

### Functions Missing JSDoc

```bash
# Find exported functions without JSDoc comments
rg "^export (async )?function" --type ts -l
```

### TypeScript Escape Hatches

```bash
# Find files with @ts-nocheck
rg "@ts-nocheck" --type ts -l

# Find @ts-ignore comments
rg "@ts-ignore" --type ts -l

# Count @ts-expect-error usage
rg "@ts-expect-error" --type ts -l
```

### `any` Type Usage

```bash
# Find explicit any types
rg ": any[^a-zA-Z]" --type ts -l

# Find any in generics
rg "<any>" --type ts -l

# Find any[] arrays
rg "any\[\]" --type ts -l
```

### Silent Error Handling

```bash
# Find empty catch blocks
rg "catch\s*\([^)]*\)\s*\{\s*\}" --type ts -l

# Find catches that only log
rg "catch\s*\([^)]*\)\s*\{\s*console\.(log|error)" --type ts -l
```

### TODO/FIXME Comments

```bash
# Find all TODOs and FIXMEs
rg "(TODO|FIXME|HACK|XXX):" --type ts

# Count by type
rg "TODO:" --type ts -c
rg "FIXME:" --type ts -c
```

### Long Files (>300 lines)

```bash
# Find files over 300 lines
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | awk '$1 > 300 {print}'
```

### Complex Functions

```bash
# Find functions with deep nesting (4+ levels of braces)
rg "^\s{16,}(if|for|while|switch)" --type ts -l
```

### Duplicate Code Patterns

```bash
# Find repeated patterns (adjust pattern as needed)
rg "const \w+ = async \(\) => \{" --type ts -c | sort -t: -k2 -nr | head -20
```

---

## Phase 2: Manual Review Checklist

| Category | Check | Flag If |
|----------|-------|---------|
| **Documentation** | JSDoc on exports | Missing on any exported function |
| **Documentation** | Business logic comments | Complex logic without "why" explanation |
| **Documentation** | Security annotations | Auth/RLS logic without `// SECURITY:` comment |
| **Typing** | `any` usage | Any non-temporary `any` type |
| **Typing** | Type assertions | `as` casts without justification comment |
| **Error Handling** | Empty catches | `catch (e) { }` patterns |
| **Error Handling** | Error swallowing | Errors caught but not logged or rethrown |
| **Complexity** | Function length | Functions > 50 lines |
| **Complexity** | Nesting depth | > 4 levels of nesting |
| **Complexity** | Parameter count | Functions with > 5 parameters |
| **Naming** | Unclear names | `data`, `result`, `temp`, `x`, single letters |
| **Naming** | Boolean naming | Booleans not prefixed with `is`, `has`, `should`, `can` |
| **Security** | Unvalidated input | User input used without validation |
| **Security** | Missing auth checks | Database queries without user context |
| **Architecture** | Mixed concerns | UI logic mixed with business logic |
| **Architecture** | Prop drilling | Props passed through 3+ component levels |

### Review Questions

For each file under review, ask:

1. **Can a new developer understand this in 5 minutes?** If not, documentation is needed.
2. **What happens when this fails?** If unclear, error handling needs work.
3. **Who can call this and with what data?** If unclear, security review needed.
4. **Is there duplicate logic elsewhere?** If yes, consider extraction.
5. **Are the tests adequate?** If not, add test coverage before refactoring.

---

## Phase 3: Prioritization Matrix

| Impact | Low Effort | Medium Effort | High Effort |
|--------|------------|---------------|-------------|
| **High** | Fix immediately | Plan for next sprint | Schedule dedicated time |
| **Medium** | Fix opportunistically | Add to backlog | Evaluate ROI |
| **Low** | Fix when touching file | Defer | Skip unless refactoring |

### Impact Assessment Criteria

**High Impact:**
- Security vulnerabilities
- Data integrity risks
- Frequent bug source
- Blocks other work
- Customer-facing issues

**Medium Impact:**
- Developer confusion
- Slow onboarding
- Moderate bug risk
- Technical debt accumulation

**Low Impact:**
- Code style issues
- Minor inconsistencies
- Rarely touched code
- Cosmetic improvements

### Effort Assessment Criteria

**Low Effort:**
- < 30 minutes
- Single file change
- No dependencies
- Safe to change

**Medium Effort:**
- 1-4 hours
- Multiple file changes
- Some dependencies
- Tests need updating

**High Effort:**
- > 4 hours
- Architectural changes
- Many dependencies
- Risk of regressions

---

## Phase 4: Remediation Templates

### Adding JSDoc to a Function

```typescript
/**
 * Brief description of what the function does.
 *
 * @param paramName - Description of the parameter
 * @returns Description of return value
 * @throws {ErrorType} When this error condition occurs
 *
 * @example
 * ```ts
 * const result = await functionName(param);
 * ```
 */
export async function functionName(paramName: ParamType): Promise<ReturnType> {
  // implementation
}
```

### Converting `any` to Proper Types

```typescript
// Before - avoid
function processData(data: any): any {
  return data.value;
}

// After - define explicit types
interface DataInput {
  value: string;
  metadata?: Record<string, unknown>;
}

interface DataOutput {
  processedValue: string;
}

function processData(data: DataInput): DataOutput {
  return { processedValue: data.value };
}
```

### Adding Security Annotations

```typescript
// SECURITY: This function requires authenticated user context
// SECURITY: RLS policy "users_own_data" enforces row-level access
// SECURITY: Input is validated by Zod schema before reaching here
export async function getUserData(userId: string) {
  // Verify caller has permission
  const { user } = await getAuthenticatedUser();
  if (user.id !== userId && !user.isAdmin) {
    throw new ForbiddenError('Cannot access other user data');
  }
  
  // ... rest of implementation
}
```

### Refactoring Long Functions

```typescript
// Before - 100+ line function
export async function processOrder(order: Order) {
  // 20 lines of validation
  // 30 lines of price calculation
  // 25 lines of inventory check
  // 25 lines of notification sending
}

// After - extracted into focused functions
export async function processOrder(order: Order) {
  const validatedOrder = await validateOrder(order);
  const pricedOrder = await calculatePricing(validatedOrder);
  await checkInventory(pricedOrder);
  await sendOrderNotifications(pricedOrder);
  return pricedOrder;
}

/** Validates order data and business rules */
async function validateOrder(order: Order): Promise<ValidatedOrder> {
  // focused validation logic
}

/** Calculates pricing including discounts and taxes */
async function calculatePricing(order: ValidatedOrder): Promise<PricedOrder> {
  // focused pricing logic
}
```

### Fixing Empty Catch Blocks

```typescript
// Before - silent failure
try {
  await riskyOperation();
} catch (e) {
}

// After - proper error handling
try {
  await riskyOperation();
} catch (error) {
  // Log for debugging
  console.error('riskyOperation failed:', error);
  
  // Option A: Rethrow with context
  throw new OperationError('Failed to complete risky operation', { cause: error });
  
  // Option B: Return fallback (with comment explaining why)
  // Fallback is acceptable here because [reason]
  return defaultValue;
  
  // Option C: Notify and continue (rare)
  // Silent failure acceptable because [reason]
  await notifyOnCallTeam(error);
}
```

---

## Quick Audit Workflow

### Step 1: Run Automated Scans

```bash
# Create a temporary report file
REPORT_FILE="audit-report-$(date +%Y%m%d).md"
echo "# Code Audit Report - $(date)" > $REPORT_FILE

# Run all scans and append to report
echo "## TypeScript Escape Hatches" >> $REPORT_FILE
echo "### @ts-nocheck files:" >> $REPORT_FILE
rg "@ts-nocheck" --type ts -l >> $REPORT_FILE 2>/dev/null || echo "None found" >> $REPORT_FILE

echo "### @ts-ignore count:" >> $REPORT_FILE
rg "@ts-ignore" --type ts -c >> $REPORT_FILE 2>/dev/null || echo "0" >> $REPORT_FILE

echo "## Any Type Usage" >> $REPORT_FILE
rg ": any" --type ts -l >> $REPORT_FILE 2>/dev/null || echo "None found" >> $REPORT_FILE

echo "## TODO/FIXME Comments" >> $REPORT_FILE
rg "(TODO|FIXME):" --type ts -c >> $REPORT_FILE 2>/dev/null || echo "0" >> $REPORT_FILE
```

### Step 2: Triage Findings by Severity

1. **Critical (fix now):**
   - Security annotations missing on auth code
   - Unvalidated user input
   - Empty catches hiding errors

2. **High (fix this sprint):**
   - `any` types on public APIs
   - Functions > 100 lines
   - Missing JSDoc on core functions

3. **Medium (add to backlog):**
   - `any` types in internal code
   - TODO/FIXME comments
   - Functions > 50 lines

4. **Low (fix opportunistically):**
   - Minor naming issues
   - Missing JSDoc on helpers
   - Style inconsistencies

### Step 3: Create Issues for Critical Items

For each critical finding, create a tracked issue with:
- Clear title describing the problem
- File path and line numbers
- Why it's critical (security? reliability?)
- Suggested fix approach
- Acceptance criteria

### Step 4: Document in Code Review

When reviewing code, add comments referencing this audit:

```
// AUDIT: Missing security annotation - see refactoring-audit skill
// AUDIT: Consider extracting to reduce function length
// AUDIT: Add JSDoc before merging
```

---

## Output Format

After running an audit, produce a summary in this format:

```markdown
## Audit Summary

**Files Scanned:** X
**Issues Found:** Y

### Critical (Must Fix)
- [ ] File: path/to/file.ts - Issue description

### High Priority
- [ ] File: path/to/file.ts - Issue description

### Medium Priority
- [ ] File: path/to/file.ts - Issue description

### Recommendations
1. First recommendation
2. Second recommendation
```

---

## Integration with Other Skills

- **security-review**: Run after refactoring to verify no security regressions
- **comprehensive-code-review**: Use findings to guide detailed review
- **code-quality**: Run linters after refactoring changes
- **bug-fix-workflow**: Apply when audit reveals bug patterns
