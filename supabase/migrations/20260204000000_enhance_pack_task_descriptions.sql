-- =============================================
-- MIGRATION: Enhance Pack Task Descriptions with Verified Links
-- =============================================
-- This migration updates existing pack_items with detailed, actionable descriptions
-- including verified links to official resources, costs, timelines, and requirements.
-- All links verified: February 2026

-- =============================================
-- UK STARTUP LAUNCHPAD (9 tasks)
-- =============================================

-- UK Startup Launchpad: Register with Companies House
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Check your proposed company name is available on the Companies House name checker
- Gather director details including residential addresses, nationality, and date of birth
- Decide on share capital structure (number and value of shares)
- Register online via the Companies House portal - you'll receive Certificate of Incorporation within 24 hours

**Official resources:**
- [Register your company](https://www.gov.uk/limited-company-formation/register-your-company) - Government registration portal
- [Company name availability checker](https://find-and-update.company-information.service.gov.uk/company-name-availability) - Check if your name is taken
- [SIC codes list](https://www.gov.uk/government/publications/standard-industrial-classification-of-economic-activities-sic) - Find your business activity code

**Key details:**
- Cost: £100 online (24hr turnaround) or £124 by post (8-10 days)
- Requirements: Company name, registered office address, at least one director, share structure, SIC code
- Note: Directors must verify identity via GOV.UK One Login and obtain a personal code before registration

---
Verified: February 2026
$desc$
WHERE title = 'Register with Companies House' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'UK Startup Launchpad');

-- UK Startup Launchpad: Register for Corporation Tax
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Wait for your Certificate of Incorporation and company UTR (Unique Taxpayer Reference) to arrive
- Create a Government Gateway account specifically for your company (not personal)
- Add Corporation Tax services to your business tax account
- Note your accounting period dates and first Corporation Tax return deadline

**Official resources:**
- [Register for Corporation Tax](https://www.tax.service.gov.uk/register-your-company/setting-up-new-limited-company) - HMRC registration service
- [Add Corporation Tax to business account](https://www.gov.uk/limited-company-formation/set-up-your-company-for-corporation-tax) - Linking guide

**Key details:**
- Cost: Free
- Timeline: Must register within 3 months of starting business activity
- Requirements: Certificate of Incorporation, Company UTR (sent separately by HMRC after registration)
- Note: If registering via Companies House online, you're often set up for Corporation Tax automatically

---
Verified: February 2026
$desc$
WHERE title = 'Register for Corporation Tax' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'UK Startup Launchpad');

-- UK Startup Launchpad: Open Business Bank Account
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Compare business bank accounts based on fees, features, and integration with accounting software
- Gather required documents: Certificate of Incorporation, proof of ID for all directors, proof of address
- Apply online through your chosen provider (most digital banks approve within 24-48 hours)
- Set up online banking and connect to your accounting software

**Official resources:**
- [Starling Bank Business](https://www.starlingbank.com/business/) - Free account with no monthly fees
- [Tide Business Account](https://www.tide.co/business-current-account/) - Free tier available
- [Monzo Business](https://monzo.com/business/) - Free Lite plan
- [Mettle by NatWest](https://www.mettle.co.uk/) - Free, includes FreeAgent integration

**Key details:**
- Cost: £0-25/month depending on provider and features
- Timeline: 1-3 business days for digital banks
- Requirements: Certificate of Incorporation, photo ID for all directors, proof of registered address
- Tip: Digital banks (Starling, Tide, Monzo) typically have faster onboarding than traditional banks

---
Verified: February 2026
$desc$
WHERE title = 'Open Business Bank Account' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'UK Startup Launchpad');

-- UK Startup Launchpad: Get Business Insurance
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Determine what insurance types you need: Employers Liability (mandatory if you have employees), Professional Indemnity, Public Liability
- Get quotes from multiple providers or use a broker service
- Ensure Employers Liability policy covers at least £5 million
- Display your EL certificate where employees can access it

**Official resources:**
- [Employers Liability Insurance](https://www.gov.uk/employers-liability-insurance) - Government guidance on legal requirements
- [FCA Register](https://register.fca.org.uk/s/) - Check your insurer is authorised
- [BIBA Broker Finder](https://www.biba.org.uk/find-insurance/) - Find an insurance broker

**Key details:**
- Cost: £50-500+/year depending on coverage and business type
- Requirements: Employers Liability insurance is mandatory if you have any employees (including directors)
- Fine: £2,500 per day for not having valid EL insurance
- Minimum cover: £5 million for Employers Liability
- Note: Must display EL certificate or face £1,000 fine

---
Verified: February 2026
$desc$
WHERE title = 'Get Business Insurance' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'UK Startup Launchpad');

-- UK Startup Launchpad: Set up PAYE
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Register as an employer with HMRC before your first payday
- Choose payroll software (free options available from HMRC)
- Set up your payroll schedule (weekly, monthly, etc.)
- Receive your Employer PAYE Reference number by post

**Official resources:**
- [Register as an employer](https://www.gov.uk/register-employer) - HMRC registration service
- [Choose payroll software](https://www.gov.uk/payroll-software) - Free and paid options
- [PAYE for employers guide](https://www.gov.uk/paye-for-employers) - Complete employer guidance

**Key details:**
- Cost: Free to register; payroll software £0-50/month
- Timeline: Register before first payday (cannot register more than 2 months in advance)
- Requirements: Company UTR, business bank account, employee details
- Threshold: Must operate PAYE if any employee earns £123/week or more (£6,396/year for 2025-26)
- Note: You must register even if you're only paying yourself as director

---
Verified: February 2026
$desc$
WHERE title = 'Set up PAYE' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'UK Startup Launchpad');

-- UK Startup Launchpad: Register for VAT
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Monitor your taxable turnover - you must register when you exceed or expect to exceed the threshold
- Decide whether to register voluntarily (can reclaim VAT on purchases but must charge VAT to customers)
- Register online through your Government Gateway business account
- Set up Making Tax Digital compliant software for VAT returns

**Official resources:**
- [VAT registration threshold](https://www.gov.uk/how-vat-works/vat-thresholds) - Current thresholds and rules
- [Register for VAT](https://www.gov.uk/register-for-vat) - Online registration service
- [VAT Flat Rate Scheme](https://www.gov.uk/vat-flat-rate-scheme) - Simplified VAT for small businesses

**Key details:**
- Cost: Free to register
- Threshold: £90,000 taxable turnover in rolling 12 months (or if you expect to exceed)
- Timeline: Must register within 30 days of exceeding the threshold
- Deregistration: Can cancel if turnover falls below £88,000
- Note: Consider voluntary registration if you sell B2B or have significant VAT-able expenses

---
Verified: February 2026
$desc$
WHERE title = 'Register for VAT' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'UK Startup Launchpad');

-- UK Startup Launchpad: ICO Registration
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Determine your fee tier based on turnover and staff numbers
- Check if you qualify for an exemption (some small organisations processing limited personal data may be exempt)
- Register online and pay by card or set up direct debit for £5 discount
- Renew annually - you'll receive reminders before expiry

**Official resources:**
- [ICO Registration](https://ico.org.uk/for-organisations/data-protection-fee/register) - Register and pay online
- [Self-assessment tool](https://ico.org.uk/for-organisations/data-protection-fee/self-assessment/) - Check if you need to register
- [Fee tier checker](https://ico.org.uk/for-organisations/data-protection-fee/fees/) - Determine your fee tier

**Key details:**
- Cost: Tier 1 £52 (micro org <10 staff, <£632k turnover), Tier 2 £78 (SME), Tier 3 £3,763 (large orgs)
- Timeline: Register as soon as you process personal data
- Direct debit discount: £5 off annual fee
- Penalty: Up to £4,000 fine for failure to register
- Note: Most startups fall into Tier 1 or Tier 2

---
Verified: February 2026
$desc$
WHERE title = 'ICO Registration' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'UK Startup Launchpad');

-- UK Startup Launchpad: Establish Registered Office
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Choose a registered office address in the same jurisdiction as your incorporation (England/Wales, Scotland, or Northern Ireland)
- Understand that this address will be public on Companies House and receive official correspondence
- Consider using a virtual office service if you work from home and want privacy
- Update Companies House within 14 days if you change your registered office

**Official resources:**
- [Registered office rules](https://www.gov.uk/limited-company-formation/company-address) - Address requirements
- [Change registered office (AD01)](https://www.gov.uk/government/publications/change-a-registered-office-address-ad01) - Update address form

**Key details:**
- Cost: £0 if using your own address; £50-300/year for virtual office services
- Requirements: Must be a physical address in the UK (not a PO Box)
- Important: All statutory mail from Companies House, HMRC and legal notices will be sent here
- Privacy: Using home address means it becomes public record
- Note: Your registered office, SAIL address (service address) and business address can all be different

---
Verified: February 2026
$desc$
WHERE title = 'Establish Registered Office' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'UK Startup Launchpad');

-- UK Startup Launchpad: Draft Founder Agreements
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Discuss and agree key terms with co-founders: equity split, vesting schedules, roles, decision-making
- Include IP assignment clauses ensuring all intellectual property belongs to the company
- Define what happens if a founder leaves (good leaver vs bad leaver provisions)
- Consider using template services or engaging a startup lawyer for review

**Official resources:**
- [SeedLegals](https://seedlegals.com/resources/founders-agreement/) - Founder agreement templates and guidance
- [Gov.uk business structures](https://www.gov.uk/set-up-business-partnership) - Partnership guidance

**Key details:**
- Cost: £0 for templates; £500-2,000 for lawyer-drafted agreements
- Key clauses: Equity split, vesting (typically 4 years with 1-year cliff), roles & responsibilities, IP assignment, non-compete, exit provisions
- Timing: Complete before incorporating or as early as possible after
- Important: Include drag-along and tag-along rights for future investment rounds
- Tip: SeedLegals offers affordable startup-specific legal documents

---
Verified: February 2026
$desc$
WHERE title = 'Draft Founder Agreements' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'UK Startup Launchpad');

-- =============================================
-- COMPANY FORMATION & GOVERNANCE (5 tasks)
-- =============================================

-- Company Formation & Governance: Register with Companies House
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Check your proposed company name is available on the Companies House name checker
- Gather director details including residential addresses, nationality, and date of birth
- Decide on share capital structure (number and value of shares)
- Register online via the Companies House portal - you'll receive Certificate of Incorporation within 24 hours

**Official resources:**
- [Register your company](https://www.gov.uk/limited-company-formation/register-your-company) - Government registration portal
- [Company name availability checker](https://find-and-update.company-information.service.gov.uk/company-name-availability) - Check if your name is taken
- [SIC codes list](https://www.gov.uk/government/publications/standard-industrial-classification-of-economic-activities-sic) - Find your business activity code

**Key details:**
- Cost: £100 online (24hr turnaround) or £124 by post (8-10 days)
- Requirements: Company name, registered office address, at least one director, share structure, SIC code
- Note: Directors must verify identity via GOV.UK One Login and obtain a personal code before registration

---
Verified: February 2026
$desc$
WHERE title = 'Register with Companies House' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Company Formation & Governance');

-- Company Formation & Governance: Draft Articles of Association
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Decide whether to use Model Articles (standard default) or draft custom articles
- Review the Model Articles to understand default provisions for director powers, share transfers, and meetings
- If customising, consider restrictions on share transfers, enhanced director powers, or weighted voting rights
- File custom articles with your incorporation documents (or Model Articles apply automatically)

**Official resources:**
- [Model Articles for Private Companies](https://www.gov.uk/government/publications/model-articles-for-private-companies-limited-by-shares) - Standard articles template
- [Formation documents guidance](https://www.gov.uk/limited-company-formation/documents) - What documents you need

**Key details:**
- Cost: £0 for Model Articles; £200-1,000 for custom articles drafted by lawyer
- Key provisions: Director appointment/removal, share transfer restrictions, meeting procedures, dividend distribution
- Default: Model Articles apply automatically if you don't file custom ones
- Tip: Most early-stage startups use Model Articles, then update when raising investment
- Note: Can be amended later by special resolution (75% shareholder approval)

---
Verified: February 2026
$desc$
WHERE title = 'Draft Articles of Association' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Company Formation & Governance');

-- Company Formation & Governance: Prepare Shareholder Agreement
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Agree key commercial terms between shareholders that go beyond the Articles of Association
- Include provisions for share transfers, pre-emption rights, and compulsory transfer triggers
- Define reserved matters requiring unanimous or supermajority consent
- Have all shareholders sign before or shortly after incorporation

**Official resources:**
- [SeedLegals Shareholders Agreement](https://seedlegals.com/resources/shareholders-agreement/) - Template and guidance
- [Companies House shareholder guidance](https://www.gov.uk/limited-company-formation/shareholders) - Official requirements

**Key details:**
- Cost: £0-500 for templates; £1,000-5,000 for lawyer-drafted
- Key clauses: Pre-emption rights, drag-along/tag-along, good/bad leaver, restrictive covenants, deadlock resolution, dividend policy
- Legal status: Private contract between shareholders (unlike Articles which are public)
- Important: Not legally required but strongly recommended for companies with multiple shareholders
- Tip: Will need updating when you raise investment (investors will want their own protections)

---
Verified: February 2026
$desc$
WHERE title = 'Prepare Shareholder Agreement' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Company Formation & Governance');

-- Company Formation & Governance: Appoint Directors and Secretary
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Appoint at least one director at incorporation (no maximum for private companies)
- File form AP01 for each director appointed after incorporation
- Decide if you need a company secretary (optional for private companies)
- Ensure all directors verify their identity and obtain a Companies House personal code

**Official resources:**
- [Appoint a director (AP01)](https://www.gov.uk/government/publications/appoint-a-director-ap01) - Online filing form
- [Director responsibilities](https://www.gov.uk/running-a-limited-company) - Legal duties of directors
- [Identity verification](https://www.gov.uk/guidance/verifying-your-identity-for-companies-house) - Required for all directors

**Key details:**
- Cost: Free to file AP01 online
- Timeline: File within 14 days of appointment
- Requirements: Director must be 16+, not disqualified, and have verified identity
- Company Secretary: Optional for private companies, but can be useful for admin
- Directors' duties: Act in company's best interests, avoid conflicts, exercise reasonable care
- Note: Directors' details (service address, DOB month/year) become public record

---
Verified: February 2026
$desc$
WHERE title = 'Appoint Directors and Secretary' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Company Formation & Governance');

-- Company Formation & Governance: Issue Share Certificates
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Create share certificates for all shareholders within 2 months of share allotment
- Include all required information: company name, shareholder name, share class, number of shares, certificate number
- Maintain a Register of Members recording all shareholdings
- File form SH01 with Companies House for any share allotments after incorporation

**Official resources:**
- [Shares and shareholders guidance](https://www.gov.uk/limited-company-formation/shareholders) - Official requirements
- [Register allotment of shares (SH01)](https://www.gov.uk/government/publications/register-an-allotment-of-shares-sh01) - Filing for new shares
- [Company records to keep](https://www.gov.uk/running-a-limited-company/company-and-accounting-records) - Statutory registers

**Key details:**
- Cost: Free (certificates can be created using templates)
- Timeline: Must issue within 2 months of allotment
- Required information: Company name and number, shareholder name and address, share class, number of shares, distinguishing numbers (if applicable)
- Statutory registers: Must keep Register of Members, Register of Directors, PSC Register
- SH01 deadline: File within 1 month of allotting new shares (after incorporation)
- Tip: Use numbered certificates and keep a certificate register for tracking

---
Verified: February 2026
$desc$
WHERE title = 'Issue Share Certificates' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Company Formation & Governance');

-- =============================================
-- FINANCIAL INFRASTRUCTURE (5 tasks)
-- =============================================

-- Financial Infrastructure: Open Business Bank Account
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Compare the main UK digital business banks: Starling (free, FSCS protected), Tide (free tier available), Monzo Business (Lite free, Pro £5/mo), or Mettle by NatWest (free with FreeAgent)
- Gather required documents: Certificate of Incorporation, ID verification for all directors, proof of address
- Apply online via the chosen bank's app or website (typically takes 10-15 minutes)
- Once approved, set up Spaces/Pots for tax reserves (VAT, Corporation Tax) and operating expenses

**Official resources:**
- [Starling Business Account](https://www.starlingbank.com/business-account/) - Free account, no UK payment fees, 24/7 support
- [Tide Business Account](https://www.tide.co/) - Free and paid tiers, strong invoicing features
- [Monzo Business](https://monzo.com/business/) - Lite (free) or Pro (£5/mo) with tax pots
- [Mettle by NatWest](https://www.mettle.co.uk/) - Free account with FreeAgent accounting included

**Key details:**
- Cost: £0 for basic accounts (all providers offer free tiers)
- Timeline: 1-3 business days for approval
- Requirements: UK registered company, Certificate of Incorporation, director ID
- FSCS protection: Up to £85,000 (Starling offers £120,000 via additional protection)

---
Verified: February 2026
$desc$
WHERE title = 'Open Business Bank Account' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Financial Infrastructure');

-- Financial Infrastructure: VAT Registration
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Monitor your rolling 12-month taxable turnover against the £90,000 threshold
- If you exceed the threshold, register within 30 days of the end of that month
- Consider voluntary registration even below threshold if you sell to VAT-registered businesses (reclaim input VAT)
- Choose your VAT scheme: Standard, Flat Rate (simplified for small businesses), or Cash Accounting

**Official resources:**
- [Register for VAT](https://www.gov.uk/register-for-vat) - Online registration portal via Government Gateway
- [VAT Thresholds](https://www.gov.uk/how-vat-works/vat-thresholds) - Current threshold information
- [VAT Registration Estimator](https://www.gov.uk/guidance/vat-registration-estimator) - HMRC tool to check if you need to register

**Key details:**
- Cost: Free to register
- Threshold: £90,000 taxable turnover in rolling 12 months (until at least March 2026)
- Timeline: Register within 30 days of exceeding threshold; effective date is first day of second month after
- Requirements: Government Gateway account, company UTR number, bank details, turnover estimates

---
Verified: February 2026
$desc$
WHERE title = 'VAT Registration' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Financial Infrastructure');

-- Financial Infrastructure: Setup Accounting Software
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Choose MTD-compliant software based on your needs: Xero (unlimited users, strong integrations), QuickBooks (good for inventory), or FreeAgent (free with NatWest/Mettle accounts)
- Connect your business bank account for automatic transaction imports
- Set up your chart of accounts and VAT scheme settings
- Configure recurring invoices, expense categories, and bank reconciliation rules

**Official resources:**
- [Xero UK](https://www.xero.com/uk/pricing-plans/) - £15-42/month depending on plan
- [QuickBooks UK](https://quickbooks.intuit.com/uk/) - From £10/month, strong project/inventory tracking
- [FreeAgent](https://www.freeagent.com/) - £29/month OR free with NatWest, RBS, or Mettle business accounts
- [MTD-Compatible Software](https://www.gov.uk/guidance/find-software-thats-compatible-with-making-tax-digital-for-vat) - HMRC's approved software list

**Key details:**
- Cost: £15-42/month (Xero), £10-35/month (QuickBooks), £0-29/month (FreeAgent)
- Timeline: 2-4 hours for initial setup, ongoing bank reconciliation weekly
- Requirements: Business bank account access, company details, VAT registration number (if registered)
- All major providers are Making Tax Digital (MTD) compliant for VAT filing

---
Verified: February 2026
$desc$
WHERE title = 'Setup Accounting Software' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Financial Infrastructure');

-- Financial Infrastructure: Appoint Accountants
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Look for accountants with ACA/ACCA/CIMA qualifications and startup/SME experience
- Interview 2-3 firms; ask about fixed-fee pricing, communication style, and turnaround times
- Check they offer: annual accounts preparation, Corporation Tax returns, VAT submissions, and advisory services
- Ensure they use cloud accounting software compatible with your chosen platform (Xero/QuickBooks/FreeAgent)

**Official resources:**
- [Find a Chartered Accountant (ICAEW)](https://www.icaew.com/find-a-chartered-accountant) - Search for ACA-qualified accountants
- [Find an ACCA Accountant](https://www.accaglobal.com/gb/en/member/find-an-accountant.html) - Search for ACCA members
- [Unbiased.co.uk](https://www.unbiased.co.uk/accountants) - Compare accountants with reviews and pricing

**Key details:**
- Cost: £100-300/month for small company accounts, tax returns, and basic advisory
- Timeline: 1-2 weeks to interview and select; engagement starts immediately
- Requirements: Recent management accounts, company structure details, growth plans
- Look for: Fixed-fee pricing (avoid hourly), Xero/QuickBooks certified, responsive communication

---
Verified: February 2026
$desc$
WHERE title = 'Appoint Accountants' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Financial Infrastructure');

-- Financial Infrastructure: Setup Payroll (PAYE)
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Register as an employer with HMRC before your first employee's payday (allow 2 weeks)
- Choose payroll software: Xero Payroll (add-on), FreeAgent (included), Sage, or outsource to your accountant
- Set up employee records with NI numbers, tax codes, and pension auto-enrolment details
- Submit RTI (Real Time Information) reports to HMRC on or before each payday

**Official resources:**
- [Register as an Employer](https://www.gov.uk/register-employer) - HMRC employer registration
- [PAYE Rates and Thresholds 2025-26](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026) - Current NI thresholds
- [Basic PAYE Tools](https://www.gov.uk/basic-paye-tools) - Free HMRC payroll software for up to 9 employees

**Key details:**
- Cost: Free registration; payroll software £0-15/month per employee
- Timeline: Register at least 2 weeks before first payday
- Secondary NI Threshold: £96/week (£5,000/year) - employer NI starts above this
- Employer NI Rate: 15% (increased from 13.8% in April 2025)
- Employment Allowance: £10,500/year offset for eligible employers

---
Verified: February 2026
$desc$
WHERE title = 'Setup Payroll (PAYE)' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Financial Infrastructure');

-- =============================================
-- DIGITAL PRESENCE & BRAND (4 tasks)
-- =============================================

-- Digital Presence & Brand: Domain Name Registration
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Search for your preferred domain name across .com, .co.uk, and relevant TLDs
- Register via Cloudflare Registrar (at-cost pricing) or Namecheap for best value
- Secure: primary .com, .co.uk for UK presence, and common misspellings/variations
- Enable auto-renewal, WHOIS privacy (free on Cloudflare), and set up DNS records

**Official resources:**
- [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) - At-cost pricing, free WHOIS privacy, free DNS/SSL
- [Namecheap](https://www.namecheap.com/) - Competitive pricing, free WhoisGuard for first year
- [Google Domains](https://domains.google/) - Clean interface, easy Google Workspace integration
- [Instant Domain Search](https://instantdomainsearch.com/) - Quick availability checking

**Key details:**
- Cost: .com ~$9.77/year, .co.uk ~£5-7/year, .io ~$45/year (Cloudflare at-cost pricing)
- Timeline: Instant registration, DNS propagation 24-48 hours
- Requirements: Valid email, payment method
- Essential settings: Auto-renewal ON, WHOIS privacy ON, DNSSEC enabled

---
Verified: February 2026
$desc$
WHERE title = 'Domain Name Registration' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Digital Presence & Brand');

-- Digital Presence & Brand: Setup Corporate Email (GSuite/O365)
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Choose between Google Workspace (cloud-first, better collaboration) or Microsoft 365 (stronger offline apps, Outlook)
- Set up your admin account and add your verified domain
- Configure DNS records: MX (mail routing), SPF, DKIM, and DMARC (email authentication/security)
- Create user accounts for founders and key team members; set up shared drives/SharePoint

**Official resources:**
- [Google Workspace Pricing](https://workspace.google.com/pricing) - From $7/user/month (annual), 14-day free trial
- [Microsoft 365 Business](https://www.microsoft.com/en-gb/microsoft-365/business/compare-all-microsoft-365-business-products) - From £4.90/user/month (annual)
- [Google Workspace Setup](https://workspace.google.com/setup/) - Step-by-step domain verification guide
- [Microsoft 365 Setup](https://setup.microsoft.com/microsoft-365-for-business) - Admin centre onboarding

**Key details:**
- Cost: Google $7-22/user/month; Microsoft £4.90-16.90/user/month (annual billing)
- Timeline: 1-2 hours setup, DNS propagation up to 48 hours
- Requirements: Registered domain name, admin access to DNS settings
- Critical DNS records: MX, SPF, DKIM, DMARC (prevents email spoofing and improves deliverability)

---
Verified: February 2026
$desc$
WHERE title = 'Setup Corporate Email (GSuite/O365)' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Digital Presence & Brand');

-- Digital Presence & Brand: Launch Landing Page
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Choose a platform based on complexity: Carrd (simple, fast), Webflow (design flexibility), Framer (interactive), or Squarespace (all-in-one)
- Include essential elements: company name/logo, clear value proposition, email capture form, and call-to-action
- Connect your custom domain and set up SSL (usually automatic)
- Add analytics (Plausible for privacy-focused, or Google Analytics) and set up email list integration

**Official resources:**
- [Carrd](https://carrd.co/) - Simple one-page sites, $19/year Pro plan, perfect for MVPs
- [Webflow](https://webflow.com/) - Free tier available, powerful design tools, CMS included
- [Framer](https://www.framer.com/) - Free tier, modern design, AI-assisted building
- [Squarespace](https://www.squarespace.com/) - All-in-one from $12/month, templates included

**Key details:**
- Cost: Carrd $19/year; Webflow free-$29/month; Framer free-$20/month; Squarespace $12-40/month
- Timeline: 2-4 hours for a simple landing page
- Requirements: Domain name, logo/brand assets, value proposition copy
- Must-haves: Mobile responsive, fast loading (<3s), clear CTA, email capture

---
Verified: February 2026
$desc$
WHERE title = 'Launch Landing Page' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Digital Presence & Brand');

-- Digital Presence & Brand: Claim Social Handles
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Check handle availability across platforms using namecheckr.com or knowem.com
- Prioritise: LinkedIn Company Page (B2B essential), Twitter/X, Instagram, and your industry-specific platforms
- Register handles even if not using immediately—they're often taken quickly
- Complete basic profile setup: logo, company description, website link

**Official resources:**
- [Namecheckr](https://www.namecheckr.com/) - Check username availability across 30+ platforms instantly
- [KnowEm](https://knowem.com/) - Comprehensive social media username search
- [LinkedIn Company Pages](https://www.linkedin.com/help/linkedin/answer/a548988) - How to create a company page
- [Twitter/X Business](https://business.twitter.com/) - Business account features

**Key details:**
- Cost: Free to register on all major platforms
- Timeline: 30-60 minutes to claim handles across priority platforms
- Priority platforms: LinkedIn (company page), Twitter/X, Instagram, YouTube, TikTok (if relevant)
- Requirements: Company email address, logo image, brief company description
- Tip: Use consistent handle across all platforms for brand recognition

---
Verified: February 2026
$desc$
WHERE title = 'Claim Social Handles' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Digital Presence & Brand');

-- =============================================
-- BUILD HIRING PIPELINE (7 tasks)
-- =============================================

-- Build Hiring Pipeline: Research Job Market and Salary Benchmarks
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Research salary ranges for your target role using multiple data sources
- Compare total compensation (base + bonus + equity) not just base salary
- Check competitor job postings to understand role expectations and requirements
- Document your findings to inform budget discussions and job posting

**Official resources:**
- [Levels.fyi](https://levels.fyi) - Best for tech roles, shows total comp breakdown by level
- [Reed 2026 Salary Guide](https://www.reed.com/tools/uk-salary-guide-2026) - UK-specific data across 11 sectors
- [Robert Half 2026 Guide](https://www.roberthalf.com/gb/en/insights/salary-guide) - Projected starting salaries, 6 professional fields
- [Glassdoor UK](https://www.glassdoor.co.uk) - Company-specific salary data and reviews

**Key details:**
- Cost: Free (all resources above)
- Timeline: 1-2 days
- Tip: Aim for 50th-75th percentile to attract quality talent

---
Verified: February 2026
$desc$
WHERE title = 'Research Job Market and Salary Benchmarks' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Build Hiring Pipeline');

-- Build Hiring Pipeline: Draft Job Description and Interview Questions
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Write job description with: title, responsibilities, requirements (must-have vs nice-to-have), salary range, benefits
- Use gender-neutral language checker to remove biased wording
- Design interview process: phone screen → technical/skills → culture fit → final
- Create evaluation scorecards for consistent candidate assessment

**Official resources:**
- [Textio](https://textio.com) - AI-powered inclusive language checker
- [Gender Decoder](https://gender-decoder.katmatfield.com) - Free tool to check for gendered wording
- [LinkedIn Job Description Templates](https://business.linkedin.com/talent-solutions/resources/how-to-hire-guides) - Industry-specific templates

**Key details:**
- Cost: Free (Gender Decoder), Textio (paid plans from ~£200/month)
- Timeline: 2-3 days
- Requirements: Input from hiring manager on must-have skills vs nice-to-have

---
Verified: February 2026
$desc$
WHERE title = 'Draft Job Description and Interview Questions' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Build Hiring Pipeline');

-- Build Hiring Pipeline: Approve Job Posting and Hiring Budget
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Set salary range based on benchmarks (aim for 50th-75th percentile)
- Calculate total hiring budget: job boards + recruiter fees + background checks
- Confirm headcount, target start date, and reporting structure
- Get sign-off from finance/leadership on the budget

**Official resources:**
- [ACAS Hiring Guide](https://www.acas.org.uk/hiring-staff) - UK employment law requirements
- [Gov.uk Employing People](https://www.gov.uk/employing-staff) - Legal obligations when hiring

**Key details:**
- Recruiter fees: Typically 15-25% of first year salary
- Job board costs: £89-£500+ per role depending on platform and duration
- Background checks: £23-£65 per check (basic to enhanced DBS)
- Timeline: 1-2 days for internal approval

---
Verified: February 2026
$desc$
WHERE title = 'Approve Job Posting and Hiring Budget' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Build Hiring Pipeline');

-- Build Hiring Pipeline: Post Job and Coordinate Recruiter Outreach
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Post job on 2-3 relevant platforms based on your target audience
- Set up tracking to measure which sources deliver best candidates
- Brief any external recruiters on role requirements and candidate profile
- Consider specialist recruiters for senior or niche technical roles

**Official resources:**
- [Indeed UK](https://uk.indeed.com/hire) - Free posting available, pay-per-application from £5
- [Reed.co.uk Recruiter](https://www.reed.co.uk/recruiter) - £89+VAT per job credit, 26M+ candidates
- [LinkedIn Jobs](https://business.linkedin.com/talent-solutions/post-jobs) - Pay-per-click model, strong for professional roles

**Key details:**
- Cost: £0-500+ depending on platforms and duration
- Timeline: 1 day to post, 2-4 weeks to collect applications
- Tip: Post on Tuesday-Thursday mornings for best visibility

---
Verified: February 2026
$desc$
WHERE title = 'Post Job and Coordinate Recruiter Outreach' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Build Hiring Pipeline');

-- Build Hiring Pipeline: Schedule Interviews and Manage Pipeline
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Set up applicant tracking system (ATS) or spreadsheet to manage pipeline
- Send calendar invites with video link, interview format, and who they'll meet
- Acknowledge all applications within 48 hours
- Provide interview feedback to candidates within 1 week

**Official resources:**
- [Workable](https://www.workable.com) - ATS from ~£99/month, good for SMBs
- [Lever](https://www.lever.co) - ATS with CRM features for relationship tracking
- [Greenhouse](https://www.greenhouse.io) - Enterprise ATS with structured hiring
- [Notion Hiring Template](https://www.notion.so/templates/category/recruiting) - Free templates for small teams

**Key details:**
- Cost: Free (spreadsheet) to £200+/month (full ATS)
- Timeline: Ongoing throughout hiring process
- Requirements: Calendar integration, video conferencing tool (Zoom/Teams/Meet)

---
Verified: February 2026
$desc$
WHERE title = 'Schedule Interviews and Manage Pipeline' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Build Hiring Pipeline');

-- Build Hiring Pipeline: Conduct Final Interviews and Make Decision
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Assemble interview panel: hiring manager + team member + cross-functional stakeholder
- Request and check minimum 2 professional references
- Hold decision meeting to compare scorecards and discuss concerns
- Reach consensus on offer or rejection for each finalist

**Official resources:**
- [ACAS Reference Guide](https://www.acas.org.uk/providing-a-job-reference) - UK rules on giving and receiving references
- [ICO Employment Guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/) - GDPR compliance for candidate data

**Key details:**
- Cost: Free (unless using reference checking service)
- Timeline: 1-2 weeks from final interviews to decision
- Requirements: All interviewers complete scorecards before decision meeting

---
Verified: February 2026
$desc$
WHERE title = 'Conduct Final Interviews and Make Decision' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Build Hiring Pipeline');

-- Build Hiring Pipeline: Extend Offer and Coordinate Onboarding
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Call candidate before sending formal offer letter
- Include in offer: salary, start date, benefits, equity (if applicable), probation terms
- Order background checks (DBS if required for regulated roles)
- Prepare onboarding: laptop, accounts, first-week schedule

**Official resources:**
- [DBS Checks](https://www.gov.uk/dbs-check-applicant-criminal-record) - Required for regulated roles (childcare, healthcare, finance)
- [Gov.uk Employment Contracts](https://www.gov.uk/employment-contracts-and-conditions) - Legal requirements for offer letters
- [HMRC New Employee Checklist](https://www.gov.uk/paye-for-employers/new-employees) - Tax and payroll setup

**Key details:**
- DBS basic check: £23, enhanced: £50-65
- Timeline: 1-2 days for verbal + written offer, 2-4 weeks for DBS
- Requirements: Right to work check, signed contract, payroll setup

---
Verified: February 2026
$desc$
WHERE title = 'Extend Offer and Coordinate Onboarding' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Build Hiring Pipeline');

-- =============================================
-- Add missing task from Build Hiring Pipeline
-- The screenshot shows 8 tasks but migration has 7
-- =============================================

-- Build Hiring Pipeline: Explore Executive Recruiters and HR Advisors
UPDATE public.pack_items SET description = $desc$
**What to do:**
- Consider specialist recruiters for senior, executive, or hard-to-fill roles
- Browse the marketplace for HR consultants and talent advisors who can refine your hiring process
- Evaluate retained search vs contingent recruitment based on role seniority
- Build relationships with 2-3 trusted recruiters in your industry vertical

**Official resources:**
- [REC (Recruitment & Employment Confederation)](https://www.rec.uk.com/our-view/find-a-recruiter) - UK recruiter professional body and directory
- [CIPD Find an HR Consultant](https://www.cipd.co.uk/membership/find-member) - HR professional directory
- [LinkedIn Recruiter](https://business.linkedin.com/talent-solutions/recruiter) - Direct sourcing tool

**Key details:**
- Retained search fees: 25-35% of first year salary (for exec roles)
- Contingent fees: 15-25% of first year salary (paid on successful hire only)
- HR consultant rates: £50-150/hour or project-based
- Timeline: Build relationships ongoing; engage 4-6 weeks before critical hires

---
Verified: February 2026
$desc$
WHERE title = 'Explore Executive Recruiters and HR Advisors' 
  AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Build Hiring Pipeline');
