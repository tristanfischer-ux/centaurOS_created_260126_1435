# Fractional Forge — Compliance Tracker

**Last Updated**: 3 March 2026
**Status**: Initial audit

---

## 1. Data Protection & Privacy

### GDPR (General Data Protection Regulation)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Privacy Policy published | Implemented | `/privacy` route exists |
| Terms of Service published | Implemented | `/terms` route exists |
| Cookie consent mechanism | To verify | Check if cookie banner is implemented |
| Data Processing Agreement (DPA) | Needed | Required for enterprise customers |
| Data Subject Access Request (DSAR) process | Needed | Need documented process for handling requests |
| Right to erasure ("right to be forgotten") | Needed | Need mechanism to delete user data on request |
| Data breach notification process | Needed | 72-hour notification requirement |
| Records of processing activities (ROPA) | Needed | Required documentation |
| Data Protection Impact Assessment (DPIA) | Recommended | For AI processing of personal data |
| Lawful basis documented per data type | Needed | Consent vs. legitimate interest vs. contract |
| Sub-processor register | Needed | Supabase, Vercel, Stripe, AI providers, etc. |
| International data transfer mechanisms | Needed | If EU data goes to US servers |

### UK Data Protection Act 2018

| Requirement | Status | Notes |
|-------------|--------|-------|
| ICO registration | Needed | Register with Information Commissioner's Office |
| UK GDPR compliance | Partially done | Overlaps with GDPR above |
| UK representative (if applicable) | N/A | Company is UK-based |

### CCPA/CPRA (California)

| Requirement | Status | Notes |
|-------------|--------|-------|
| "Do Not Sell My Info" link | Needed | Required if serving California residents |
| Privacy policy with CCPA disclosures | Needed | Must include categories of data collected |
| Opt-out mechanism | Needed | Required for data sharing/selling |

---

## 2. Payment Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| PCI DSS compliance | Delegated | Stripe handles card data; ForgeOS never touches it |
| Stripe Terms of Service compliance | To verify | Review Stripe's acceptable use policy |
| Escrow regulation compliance | To verify | UK FCA rules on holding client money |
| Invoice requirements (UK) | Needed | VAT invoice format if VAT-registered |
| Refund policy documented | Needed | Required for consumer protection |
| Anti-money laundering (AML) | To assess | May apply for marketplace transactions |

---

## 3. AI-Specific Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| EU AI Act readiness | To assess | Understand classification of AI specialists |
| AI transparency (disclosure) | Recommended | Users know they're talking to AI (specialists have names, clear they're AI) |
| AI bias monitoring | Recommended | Particularly for marketplace matching |
| Data used for AI training | Document | Confirm: does user data train third-party models? |
| AI provider terms compliance | To verify | Anthropic, OpenAI, Google, etc. acceptable use |
| AI output disclaimer | Recommended | "AI advice is not a substitute for professional advice" |

---

## 4. Marketplace & Consumer Protection

| Requirement | Status | Notes |
|-------------|--------|-------|
| Marketplace Terms of Service | Needed | Terms governing buyer-seller transactions |
| Dispute resolution process | Implemented | Escalation workflow exists in code |
| Provider verification process | To document | How providers are vetted |
| Consumer Rights Act 2015 (UK) | To assess | Applies to digital content |
| Consumer Contracts Regulations 2013 | To assess | 14-day cooling-off period |
| Platform liability limitations | Needed | Documented in ToS |

---

## 5. Company & Employment

| Requirement | Status | Notes |
|-------------|--------|-------|
| Companies House filings current | To verify | Annual confirmation statement, accounts |
| Employer's liability insurance | Needed when hiring | Legal requirement in UK |
| Professional indemnity insurance | Recommended | For AI advice platform |
| Directors' and officers' insurance | Recommended | Standard for startup directors |

---

## 6. Security Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| Security audit conducted | Done (Feb 2026) | See docs/security/ and ISMS documentation |
| Row-Level Security (RLS) | Implemented | Multi-tenant isolation |
| Authentication security | Implemented | JWT, HTTP-only cookies, CSRF protection |
| Rate limiting | Implemented | Per-user, per-IP on AI endpoints |
| Input validation | Implemented | Zod schemas |
| CSP headers | Implemented | Strict Content-Security-Policy |
| Penetration testing | Recommended | Not yet conducted |
| SOC 2 Type II | Future | When enterprise customers require it |
| ISO 27001 | In Progress | ISMS documentation underway (see FractionalForge-ISMS repository) |

---

## 7. Action Items (Priority Order)

1. **ICO Registration** — Register with UK Information Commissioner's Office
2. **Sub-processor register** — Document all third-party services processing user data
3. **DSAR process** — Create documented process for data subject requests
4. **Cookie consent** — Verify and implement cookie consent mechanism
5. **AI disclaimer** — Add "not a substitute for professional advice" to specialist UI
6. **Marketplace ToS** — Separate terms governing marketplace transactions
7. **Escrow compliance** — Verify FCA position on marketplace escrow
8. **DPA template** — Prepare Data Processing Agreement for enterprise customers
9. **Data breach process** — Document 72-hour notification procedure
10. **Insurance review** — Professional indemnity and cyber insurance quotes
