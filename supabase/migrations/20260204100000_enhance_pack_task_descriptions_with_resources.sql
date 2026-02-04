-- =============================================
-- MIGRATION: Enhance Pack Task Descriptions with Verified Resources
-- =============================================
-- This migration updates 60 task descriptions across 7 packs with:
-- - Clear action items
-- - Official resource links
-- - Key details (cost/timeline/requirements)
-- All resources verified February 2026

-- =============================================
-- PACK 1: Onboard New Employee (6 tasks)
-- =============================================

-- Task 1.1: Research Onboarding Best Practices
UPDATE public.pack_items
SET description = '**What to do:**
- Review ACAS induction guidance for UK legal requirements and best practices
- Study SHRM onboarding templates for structured process design
- Identify compliance requirements (right-to-work, health & safety, NI/tax)
- Document industry-specific onboarding considerations for your sector

**Official resources:**
- [ACAS Induction Guide](https://www.acas.org.uk/acas-guide-to-staff-induction) - Comprehensive UK induction guidance
- [ACAS Induction Checklist Template](https://www.acas.org.uk/template-checklist-for-induction-of-new-staff) - Downloadable checklist template
- [SHRM New Hire Preparation](https://www.shrm.org/topics-tools/tools/forms/checklist-new-hire-preparation) - Pre-arrival setup checklist
- [SHRM Developing Onboarding Practices](https://www.shrm.org/topics-tools/tools/forms/checklist-developing-onboarding-new-hire-practices) - Building effective onboarding systems

**Key details:**
- Timeline: 2-3 hours research
- No legal requirement for induction in UK, but reduces turnover by 25%
- Workers must be paid for all induction time from day one

---
Verified: February 2026'
WHERE title = 'Research Onboarding Best Practices'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Onboard New Employee' LIMIT 1);

-- Task 1.2: Draft Onboarding Checklist and Welcome Packet
UPDATE public.pack_items
SET description = '**What to do:**
- Create pre-arrival checklist (send offer letter, request bank/NI details, prepare equipment)
- Design first-day schedule (welcome meeting, team introductions, essential setup)
- Prepare welcome packet (staff handbook, org chart, office guide, contact list)
- Set up 30/60/90 day milestone checkpoints

**Official resources:**
- [SHRM New Hire Paperwork Checklist](https://www.shrm.org/topics-tools/tools/forms/checklist-new-hire-paperwork) - Required documentation checklist
- [SHRM New Hire Orientation Checklist](https://www.shrm.org/topics-tools/tools/forms/checklist-new-hire-orientation) - Orientation day procedures
- [ACAS Planning Induction](https://www.acas.org.uk/inductions/planning-an-induction-programme) - Tailoring induction to individuals

**Key details:**
- Include reasonable adjustment considerations for accessibility
- Send welcome packet 3-5 days before start date
- Consider assigning a buddy/mentor for first-week support

---
Verified: February 2026'
WHERE title = 'Draft Onboarding Checklist and Welcome Packet'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Onboard New Employee' LIMIT 1);

-- Task 1.3: Approve Onboarding Plan and Budget
UPDATE public.pack_items
SET description = '**What to do:**
- Review onboarding checklist for completeness and compliance
- Approve equipment budget (laptop, monitor, peripherals, software licenses)
- Sign off on training schedule and any external training costs
- Confirm timeline aligns with team availability and business needs

**Official resources:**
- [ACAS Inductions Overview](https://www.acas.org.uk/inductions) - Understanding induction requirements
- [SHRM Developing Onboarding Practices](https://www.shrm.org/topics-tools/tools/forms/checklist-developing-onboarding-new-hire-practices) - Building scalable onboarding

**Key details:**
- Typical equipment budget: £1,500-3,000 per employee
- Decision timeline: 1-2 days for review and approval
- Consider probation period alignment with onboarding milestones

---
Verified: February 2026'
WHERE title = 'Approve Onboarding Plan and Budget'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Onboard New Employee' LIMIT 1);

-- Task 1.4: Schedule Orientation Sessions and IT Setup
UPDATE public.pack_items
SET description = '**What to do:**
- Book meeting rooms for orientation sessions (or set up video calls for remote)
- Schedule calendar invites for team introductions and key stakeholder meetings
- Submit IT access requests (email, Slack, internal systems, dev environments)
- Coordinate with facilities for building access/security pass

**Official resources:**
- [ACAS Planning Induction](https://www.acas.org.uk/inductions/planning-an-induction-programme) - Scheduling and logistics guidance
- [SHRM New Hire Orientation](https://www.shrm.org/topics-tools/tools/forms/checklist-new-hire-orientation) - Orientation procedures

**Key details:**
- Allow 3-5 business days for IT provisioning
- Schedule orientation for mornings when energy is highest
- Book shorter sessions (30-45 min) to avoid information overload

---
Verified: February 2026'
WHERE title = 'Schedule Orientation Sessions and IT Setup'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Onboard New Employee' LIMIT 1);

-- Task 1.5: Prepare Workspace and Equipment
UPDATE public.pack_items
SET description = '**What to do:**
- Set up physical desk with monitor, keyboard, mouse, and office supplies
- Configure laptop with required software, email, and development tools
- Create accounts for Slack, project management tools, and internal systems
- Prepare welcome swag (company merch, notebook, stationery)

**Official resources:**
- [ACAS Inductions](https://www.acas.org.uk/inductions) - First day essentials guidance
- [SHRM New Hire Preparation](https://www.shrm.org/topics-tools/tools/forms/checklist-new-hire-preparation) - Equipment and workspace checklist

**Key details:**
- Test all equipment before first day
- Include any ergonomic requirements from offer discussions
- Ensure remote workers receive equipment 2-3 days early for setup

---
Verified: February 2026'
WHERE title = 'Prepare Workspace and Equipment'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Onboard New Employee' LIMIT 1);

-- Task 1.6: Conduct First-Day Orientation
UPDATE public.pack_items
SET description = '**What to do:**
- Welcome new hire and complete any remaining paperwork
- Provide office tour and introduce to immediate team members
- Review company values, culture, and expectations
- Set up first-week goals and schedule check-in meetings

**Official resources:**
- [ACAS Guide to Staff Induction](https://www.acas.org.uk/acas-guide-to-staff-induction) - First day best practices
- [SHRM New Hire Orientation Checklist](https://www.shrm.org/topics-tools/tools/forms/checklist-new-hire-orientation) - Day one activities

**Key details:**
- Don''t overwhelm with too much information on day one
- Schedule lunch with team members for informal bonding
- Provide clear point of contact for questions during first week

---
Verified: February 2026'
WHERE title = 'Conduct First-Day Orientation'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Onboard New Employee' LIMIT 1);

-- =============================================
-- PACK 2: Conduct Annual Performance Reviews (7 tasks)
-- =============================================

-- Task 2.1: Research Performance Review Frameworks
UPDATE public.pack_items
SET description = '**What to do:**
- Study continuous performance management vs annual review approaches
- Review rating scale options (3-point, 4-point, 5-point) and their trade-offs
- Analyze 360-degree feedback methodologies and implementation requirements
- Research calibration best practices to ensure consistency across teams

**Official resources:**
- [Lattice Performance Review Templates](https://lattice.com/articles/11-performance-review-templates) - 11 downloadable templates
- [Lattice Performance Question Bank](https://lattice.com/templates/performance-review-question-bank) - Sample questions by competency
- [Culture Amp Performance Management Guide](https://www.cultureamp.com/blog/performance-management-best-practices) - 8 essential best practices
- [15Five Continuous Performance Management](https://www.15five.com/blog/what-is-continuous-performance-management) - Moving beyond annual reviews

**Key details:**
- Companies with excellent performance management use formalized, structured processes
- Employees receiving daily feedback are 3.6x more likely to be motivated
- Separate developmental conversations from performance rating discussions

---
Verified: February 2026'
WHERE title = 'Research Performance Review Frameworks'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Conduct Annual Performance Reviews' LIMIT 1);

-- Task 2.2: Draft Review Templates and Guidelines
UPDATE public.pack_items
SET description = '**What to do:**
- Create self-assessment template with reflection prompts on goals and growth
- Design manager review form covering performance, competencies, and development
- Draft peer feedback questionnaire for 360-degree input
- Write calibration guidelines with rating definitions and examples

**Official resources:**
- [Lattice 360 Review Template](https://lattice.com/articles/11-performance-review-templates) - Combines feedback from multiple sources
- [Lattice 90-Day Review Template](https://lattice.com/articles/11-performance-review-templates) - New hire evaluation framework
- [Culture Amp Manager Guide](https://support.cultureamp.com/en/articles/10423065-manager-s-guide-to-performance-reviews) - Manager responsibilities and process
- [Culture Amp Rating Guide](https://support.cultureamp.com/en/articles/7048426-guide-to-rating-performance-reviews) - Consistent rating application

**Key details:**
- Focus questions on behaviors and impact rather than personality
- Include both backward-looking assessment and forward-looking goals
- Provide rating anchor examples to ensure consistent interpretation

---
Verified: February 2026'
WHERE title = 'Draft Review Templates and Guidelines'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Conduct Annual Performance Reviews' LIMIT 1);

-- Task 2.3: Approve Review Process and Timeline
UPDATE public.pack_items
SET description = '**What to do:**
- Approve review framework, rating scale, and calibration approach
- Set timeline for self-assessments, peer feedback, and manager reviews
- Decide on compensation impact (merit increases, bonus eligibility)
- Confirm communication plan to announce review cycle to organization

**Official resources:**
- [Culture Amp Unified Performance Cycle](https://support.cultureamp.com/en/articles/10398426-launch-a-unified-performance-review-cycle) - Launching review cycles
- [Culture Amp Best Practices](https://www.cultureamp.com/blog/performance-management-best-practices) - Planning and alignment

**Key details:**
- Plan review cycle 4-6 weeks before deadline
- Allow 1-2 weeks for self-assessments and peer feedback
- Schedule calibration sessions before final feedback delivery

---
Verified: February 2026'
WHERE title = 'Approve Review Process and Timeline'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Conduct Annual Performance Reviews' LIMIT 1);

-- Task 2.4: Schedule Review Meetings and Send Reminders
UPDATE public.pack_items
SET description = '**What to do:**
- Schedule 1:1 review meetings between managers and direct reports
- Send launch announcement explaining process, timeline, and expectations
- Set up automated reminders for self-assessment and peer feedback deadlines
- Create calendar blocks for managers to complete written reviews

**Official resources:**
- [15Five Core Platform Overview](https://success.15five.com/hc/en-us/articles/21354702192155-Core-Platform-Overview) - Check-ins and 1:1 features
- [15Five Feedback Tools](https://www.15five.com/products/perform/feedback) - Request and track feedback

**Key details:**
- Allow 45-60 minutes for review conversations
- Send reminders at 1 week and 2 days before deadlines
- Stagger meeting schedules to avoid manager bottleneck

---
Verified: February 2026'
WHERE title = 'Schedule Review Meetings and Send Reminders'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Conduct Annual Performance Reviews' LIMIT 1);

-- Task 2.5: Collect and Organize Review Documents
UPDATE public.pack_items
SET description = '**What to do:**
- Gather completed self-assessments from all employees
- Compile peer feedback responses and anonymize where appropriate
- Organize goal achievement data and project contribution metrics
- Prepare calibration materials with preliminary ratings by team

**Official resources:**
- [15Five Perform Platform](https://www.15five.com/products/perform/) - Performance management tools
- [Culture Amp Manager Guide](https://support.cultureamp.com/en/articles/10423065-manager-s-guide-to-performance-reviews) - Collecting and reviewing feedback

**Key details:**
- Track completion rates and follow up with missing submissions
- Flag any concerning feedback patterns for HR review
- Ensure confidentiality of peer feedback during compilation

---
Verified: February 2026'
WHERE title = 'Collect and Organize Review Documents'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Conduct Annual Performance Reviews' LIMIT 1);

-- Task 2.6: Facilitate Calibration Sessions
UPDATE public.pack_items
SET description = '**What to do:**
- Lead cross-functional calibration meetings to ensure rating consistency
- Review rating distribution and address potential bias or inflation
- Discuss borderline cases and reach consensus on final ratings
- Document calibration decisions and rationale for audit trail

**Official resources:**
- [Culture Amp Performance Cycle Guide](https://support.cultureamp.com/en/articles/10398426-launch-a-unified-performance-review-cycle) - Running calibration sessions
- [Lattice Continuous Performance Model](https://lattice.com/articles/how-lattice-built-its-continuous-performance-model-using-lattice) - Reducing bias through ongoing feedback

**Key details:**
- Include HR representative in calibration sessions
- Use concrete examples to justify rating adjustments
- Calibration typically requires 2-4 hours per department

---
Verified: February 2026'
WHERE title = 'Facilitate Calibration Sessions'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Conduct Annual Performance Reviews' LIMIT 1);

-- Task 2.7: Deliver Feedback and Create Development Plans
UPDATE public.pack_items
SET description = '**What to do:**
- Conduct face-to-face review conversations with each team member
- Share calibrated ratings and specific behavioral feedback
- Collaboratively create development plan with goals and milestones
- Set next quarter objectives aligned with career growth aspirations

**Official resources:**
- [15Five Best-Self Reviews](https://www.15five.com/products/perform/) - Growth-focused review approach
- [Culture Amp Rating Scale Guide](https://www.cultureamp.com/blog/best-rating-scale-performance-reviews) - Explaining ratings effectively
- [Lattice Performance Review Questions](https://lattice.com/articles/hrs-guide-to-performance-review-questions) - Conversation frameworks

**Key details:**
- Focus conversation on growth, not just evaluation
- Document development plan in writing with clear timelines
- Schedule follow-up check-in within 30 days

---
Verified: February 2026'
WHERE title = 'Deliver Feedback and Create Development Plans'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Conduct Annual Performance Reviews' LIMIT 1);

-- =============================================
-- PACK 3: Fundraising Preparation (10 tasks)
-- =============================================

-- Task 3.1: Research Target Investors
UPDATE public.pack_items
SET description = '**What to do:**
- Build list of 50+ investors matching your stage, sector, and geography
- Research portfolio companies to identify thesis fit and potential conflicts
- Prioritize by warmth (existing relationships, mutual connections)
- Create CRM tracker with contact info, thesis notes, and outreach status

**Official resources:**
- [Y Combinator Startup Library](https://www.ycombinator.com/library) - Fundraising guides and investor insights
- [YC Series A Pitch Guide](https://www.ycombinator.com/library/8d-how-to-build-a-great-series-a-pitch-and-deck) - Understanding investor expectations
- [DocSend Fundraising Guide](https://www.docsend.com/solutions/startup-fundraising/) - Track investor engagement

**Key details:**
- Target 50-100 investors for seed, 30-50 for Series A
- Prioritize warm intros over cold outreach (3x higher response rate)
- Include angel investors and strategic investors, not just VCs

---
Verified: February 2026'
WHERE title = 'Research Target Investors'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- Task 3.2: Draft Pitch Deck Narrative
UPDATE public.pack_items
SET description = '**What to do:**
- Structure deck: Problem → Solution → Traction → Market → Team → Ask
- Write one clear sentence explaining what your company does
- Build compelling story arc that flows naturally through each slide
- Include specific metrics, not vague claims ("$50K MRR" not "growing fast")

**Official resources:**
- [YC Seed Deck Template](https://www.ycombinator.com/blog/intro-to-the-yc-seed-deck) - Official YC deck structure
- [YC How to Build Seed Round Pitch Deck](https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck) - Content guidance
- [Sequoia Pitch Deck Template](https://pitchdeckcoach.com/sequoia-capital-pitch-deck) - Industry-standard 10-slide format
- [Sequoia Template (Google Slides)](https://docs.google.com/presentation/d/1wpZHPW58WFuCMma4DuxRLv3tXVp5J2GpTKfxGexLQvU/edit) - Downloadable template

**Key details:**
- Keep deck to 10-15 slides maximum
- Focus on clarity over design—legible from back of room
- Lead with your strongest traction or insight

---
Verified: February 2026'
WHERE title = 'Draft Pitch Deck Narrative'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- Task 3.3: Review and Refine Pitch Deck
UPDATE public.pack_items
SET description = '**What to do:**
- Test deck with trusted advisors and gather specific feedback
- Refine story flow—each slide should naturally lead to the next
- Verify all metrics are accurate and defensible
- Practice delivering pitch in under 3 minutes

**Official resources:**
- [YC How to Design Better Pitch Deck](https://www.ycombinator.com/library/4T-how-to-design-a-better-pitch-deck) - Visual design best practices
- [Sequoia Pitch Deck Guide](https://easyvc.ai/blog/sequoia-capital-pitch-deck-template/) - Slide structure and tips

**Key details:**
- Get feedback from at least 3 people who don''t know your business
- Record yourself presenting and watch for filler words
- Prepare answers for the 10 hardest questions investors will ask

---
Verified: February 2026'
WHERE title = 'Review and Refine Pitch Deck'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- Task 3.4: Organize Data Room
UPDATE public.pack_items
SET description = '**What to do:**
- Set up secure data room platform with folder structure
- Upload financial statements, cap table, and key contracts
- Add team bios, customer references, and metrics dashboard
- Configure access controls, NDA requirements, and tracking

**Official resources:**
- [DocSend Data Room Guide](https://www.docsend.com/blog/4-types-of-documents-founders-must-have-in-their-fundraising-data-room-and-a-few-additional-tips/) - Essential documents list
- [DocSend Virtual Data Rooms](https://www.youtube.com/watch?v=QhSmaK85_Y0) - Setup walkthrough video
- [DocSend Platform](https://www.docsend.com/) - Secure document sharing with analytics

**Key details:**
- DocSend offers free tier for startups
- Include: P&L, balance sheet, 3-year projections, cap table, key contracts
- Enable watermarking and download tracking for sensitive documents

---
Verified: February 2026'
WHERE title = 'Organize Data Room'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- Task 3.5: Draft Financial Model
UPDATE public.pack_items
SET description = '**What to do:**
- Build 3-year revenue model (5 years for seed+) with monthly detail for year 1
- Document all assumptions clearly with sources where possible
- Include unit economics (CAC, LTV, payback period, gross margin)
- Create sensitivity analysis showing upside/downside scenarios

**Official resources:**
- [Y Combinator Startup Library](https://www.ycombinator.com/library) - Financial modeling resources
- [DocSend Emerging Funds Data Room](https://www.docsend.com/blog/documents-to-include-in-your-emerging-funds-data-room/) - Financial document requirements

**Key details:**
- Pre-seed: 3 years; Seed: 3-5 years; Series A: 5 years
- Show path to profitability or next funding milestone
- Include hiring plan tied to revenue growth

---
Verified: February 2026'
WHERE title = 'Draft Financial Model'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- Task 3.6: Review Financial Projections
UPDATE public.pack_items
SET description = '**What to do:**
- Validate revenue assumptions against comparable companies
- Ensure projections are ambitious but defensible
- Check math and formula accuracy in all scenarios
- Approve model for sharing in data room

**Official resources:**
- [YC Series A Pitch Guide](https://www.ycombinator.com/library/8d-how-to-build-a-great-series-a-pitch-and-deck) - Traction and financial expectations
- [DocSend Fundraising Platform](https://www.docsend.com/solutions/startup-fundraising/) - Analytics on investor engagement

**Key details:**
- Investors will stress-test every assumption
- Be prepared to defend growth rates with bottom-up analysis
- Common red flag: hockey stick growth with no clear driver

---
Verified: February 2026'
WHERE title = 'Review Financial Projections'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- Task 3.7: Create Investor FAQ Document
UPDATE public.pack_items
SET description = '**What to do:**
- Compile 20-30 frequently asked investor questions
- Write clear, concise answers with supporting data
- Cover: market size, competition, risks, path to profitability, use of funds
- Include questions you hope they don''t ask (and prepare answers anyway)

**Official resources:**
- [YC Seed Round Pitch Deck Guide](https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck) - Common investor questions
- [Sequoia Pitch Deck Framework](https://pitchdeckcoach.com/sequoia-capital-pitch-deck) - Proactively answering investor questions

**Key details:**
- Practice answering without reading from the document
- Update FAQ based on questions from actual meetings
- Keep answers to 2-3 sentences—details go in appendix

---
Verified: February 2026'
WHERE title = 'Create Investor FAQ Document'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- Task 3.8: Schedule Investor Meetings
UPDATE public.pack_items
SET description = '**What to do:**
- Request warm introductions through advisors, angels, and portfolio founders
- Send teaser email with one-liner and key metric before formal intro
- Batch meetings within 2-3 week window to create urgency
- Send calendar invites with pitch deck link and agenda

**Official resources:**
- [DocSend Fundraising Platform](https://www.docsend.com/solutions/startup-fundraising/) - Track deck engagement before meetings
- [YC Series A Guide](https://www.ycombinator.com/library/8d-how-to-build-a-great-series-a-pitch-and-deck) - Meeting preparation

**Key details:**
- Warm intros convert 3x better than cold outreach
- Send deck 24 hours before meeting for review
- Aim for 10-15 first meetings in first 2 weeks

---
Verified: February 2026'
WHERE title = 'Schedule Investor Meetings'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- Task 3.9: Conduct Investor Meetings
UPDATE public.pack_items
SET description = '**What to do:**
- Deliver pitch confidently in under 3 minutes, leaving time for discussion
- Listen actively and take notes on concerns and interests
- Ask investors about their decision process and timeline
- Follow up within 24 hours with answers to any outstanding questions

**Official resources:**
- [YC How to Build Great Series A Pitch](https://www.ycombinator.com/library/8d-how-to-build-a-great-series-a-pitch-and-deck) - Pitch delivery best practices
- [YC How to Design Better Pitch Deck](https://www.ycombinator.com/library/4T-how-to-design-a-better-pitch-deck) - Making slides legible and memorable

**Key details:**
- Meetings are conversations, not presentations
- End every meeting with clear next steps
- Track all investor feedback to improve pitch

---
Verified: February 2026'
WHERE title = 'Conduct Investor Meetings'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- Task 3.10: Review and Negotiate Term Sheet
UPDATE public.pack_items
SET description = '**What to do:**
- Analyze key terms: valuation, liquidation preference, board seats, pro-rata
- Identify deal-breakers vs. negotiable terms
- Consult with experienced startup lawyer before signing
- Negotiate terms that protect founder interests while closing the deal

**Official resources:**
- [Term Sheet Startup Guide](https://www.biztechlawyers.com/legal-articles/term-sheets-explained-startup-guide-to-understanding-and-negotiating-key-terms) - Understanding key terms
- [How to Negotiate Term Sheet](https://seedlegals.com/us/resources/negotiating-your-term-sheet/) - Founder negotiation strategies
- [Andreessen Horowitz Term Sheet Guide](https://www.businessinsider.com/entrepreneurship-guide-venture-capital-term-sheets-startups-2019-5) - Sample term sheet from top VC

**Key details:**
- Term sheets are typically non-binding but set expectations
- Hire a lawyer specializing in venture capital before signing
- Key terms: valuation, board composition, liquidation preference, anti-dilution

---
Verified: February 2026'
WHERE title = 'Review and Negotiate Term Sheet'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Fundraising Preparation' LIMIT 1);

-- =============================================
-- PACK 4: Product Launch (10 tasks)
-- =============================================

-- Task 4.1: Define Launch Goals and Success Metrics
UPDATE public.pack_items
SET description = '**What to do:**
- Set specific, measurable launch goals (signups, revenue, press mentions)
- Define KPIs to track: conversion rate, activation rate, retention
- Establish baseline metrics and target improvements
- Create dashboard to monitor progress in real-time

**Official resources:**
- [Product Hunt Launch Guide](https://www.producthunt.com/launch) - Official launch planning guide
- [Product Hunt Launch Timeline](https://www.producthunt.com/stories/launch-timeline) - Success timeline framework
- [Indie Hackers Launch Checklist](https://www.indiehackers.com/post/how-to-bring-a-product-to-market-a-product-launch-checklist-36-steps-939ea077ab) - 36-step launch checklist

**Key details:**
- Set goals you can achieve, not just hope for
- Expect 200-350 upvotes to reach Product Hunt top 5 in 2026
- Focus on conversion, not just traffic

---
Verified: February 2026'
WHERE title = 'Define Launch Goals and Success Metrics'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- Task 4.2: Create Beta Testing Plan
UPDATE public.pack_items
SET description = '**What to do:**
- Define beta program structure: closed vs open, duration, cohort size
- Set success criteria and feedback collection methods
- Create beta agreement and set participant expectations
- Design feedback mechanisms (surveys, interviews, in-app feedback)

**Official resources:**
- [Product Hunt How to Launch](https://blog.producthunt.com/how-to-launch-on-product-hunt-7c1843e06399) - Beta testing before launch
- [Indie Hackers Marketing Playbook](https://www.indiehackers.com/post/a-marketing-playbook-for-indie-hackers-3284b26fed) - Test and iterate strategies

**Key details:**
- Start beta 4-6 weeks before public launch
- Ideal beta cohort: 20-100 users depending on product complexity
- Focus on finding bugs AND validating value proposition

---
Verified: February 2026'
WHERE title = 'Create Beta Testing Plan'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- Task 4.3: Recruit Beta Testers
UPDATE public.pack_items
SET description = '**What to do:**
- Identify target beta users from existing waitlist, network, or communities
- Send personalized invitations explaining the beta opportunity
- Set up private communication channel (Slack, Discord, or email group)
- Onboard testers with clear instructions and support contacts

**Official resources:**
- [Product Hunt Launch Guide](https://www.producthunt.com/launch) - Building community before launch
- [Indie Hackers Community Strategy](https://awesome-directories.com/blog/indie-hackers-launch-strategy-guide-2025/) - 23% conversion rate strategies

**Key details:**
- Personal outreach converts better than mass emails
- Offer incentives: early access, lifetime discount, or swag
- Track tester engagement and follow up with inactive users

---
Verified: February 2026'
WHERE title = 'Recruit Beta Testers'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- Task 4.4: Draft Product Documentation
UPDATE public.pack_items
SET description = '**What to do:**
- Write quick-start guide for new users (5-minute time-to-value)
- Create comprehensive user documentation with search functionality
- Develop API documentation if applicable (with code examples)
- Build FAQ section based on beta tester questions

**Official resources:**
- [Product Hunt How to Post](https://help.producthunt.com/en/articles/479557-how-to-post-a-product) - Required product information
- [Notion Team Wiki Template](https://www.notion.com/help/guides/team-wiki) - Documentation structure

**Key details:**
- Include screenshots and video walkthroughs
- Organize docs by user journey, not feature list
- Update docs based on support ticket patterns

---
Verified: February 2026'
WHERE title = 'Draft Product Documentation'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- Task 4.5: Create Launch Marketing Content
UPDATE public.pack_items
SET description = '**What to do:**
- Write compelling landing page copy with clear value proposition
- Create email sequence: pre-launch teaser, launch day, follow-up
- Prepare social media posts for Twitter, LinkedIn, and relevant platforms
- Design Product Hunt assets (thumbnail, gallery images, tagline)

**Official resources:**
- [Product Hunt Launch Guide](https://www.producthunt.com/launch) - Asset requirements and best practices
- [Indie Hackers Email Launch Sequence](https://www.indiehackers.com/post/whats-new-an-email-sequence-for-your-product-hunt-launch-0d22a01cfa) - 3-email sequence template
- [Product Hunt 2026 Launch Playbook](https://blog.innmind.com/how-to-launch-on-product-hunt-in-2026/) - Current best practices

**Key details:**
- Product Hunt requires: 240x240 thumbnail, 1270x760 gallery images
- Schedule emails by subscriber timezone for better open rates
- Include clear CTA in every piece of content

---
Verified: February 2026'
WHERE title = 'Create Launch Marketing Content'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- Task 4.6: Build Media and Influencer List
UPDATE public.pack_items
SET description = '**What to do:**
- Research relevant tech journalists, bloggers, and newsletter authors
- Identify influencers in your niche with engaged audiences
- Draft personalized pitch templates for each segment
- Build relationship before asking for coverage (follow, engage, share)

**Official resources:**
- [Product Hunt Launch Timeline](https://www.producthunt.com/stories/launch-timeline) - Building community 60 days out
- [Indie Hackers Marketing Playbook](https://www.indiehackers.com/post/a-marketing-playbook-for-indie-hackers-3284b26fed) - Network and collaborate strategies

**Key details:**
- Start outreach 2-4 weeks before launch
- Offer exclusive early access or unique angle for coverage
- Provide ready-to-use assets (screenshots, founder quotes, data)

---
Verified: February 2026'
WHERE title = 'Build Media and Influencer List'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- Task 4.7: Review Marketing Materials
UPDATE public.pack_items
SET description = '**What to do:**
- Review all external communications for accuracy and tone consistency
- Verify legal compliance (claims, testimonials, disclaimers)
- Test all links, forms, and tracking pixels
- Approve final versions for publishing

**Official resources:**
- [Product Hunt How to Post](https://help.producthunt.com/en/articles/479557-how-to-post-a-product) - Content guidelines and requirements
- [Indie Hackers Launch Checklist](https://www.indiehackers.com/post/how-to-bring-a-product-to-market-a-product-launch-checklist-36-steps-939ea077ab) - Pre-launch verification

**Key details:**
- Have someone outside the company review for clarity
- Check all images render correctly on mobile
- Verify analytics tracking is working before launch

---
Verified: February 2026'
WHERE title = 'Review Marketing Materials'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- Task 4.8: Coordinate Launch Day Logistics
UPDATE public.pack_items
SET description = '**What to do:**
- Create detailed launch day schedule with owner for each task
- Schedule social posts and email sends in advance
- Prepare support team with FAQs and escalation procedures
- Test all systems under expected load

**Official resources:**
- [Product Hunt 2026 Launch Playbook](https://blog.innmind.com/how-to-launch-on-product-hunt-in-2026/) - Launch at 12:01 AM PT
- [Product Hunt Launch Timeline](https://www.producthunt.com/stories/launch-timeline) - 30-day countdown checklist

**Key details:**
- Launch Tuesday-Thursday (avoid Monday, Friday, holidays)
- Schedule outreach in timed waves to avoid spam patterns
- Have backup plan for technical issues

---
Verified: February 2026'
WHERE title = 'Coordinate Launch Day Logistics'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- Task 4.9: Execute Launch Day
UPDATE public.pack_items
SET description = '**What to do:**
- Publish Product Hunt listing at 12:01 AM PT
- Monitor systems and respond quickly to any issues
- Engage authentically on social media and Product Hunt comments
- Track metrics in real-time and adjust tactics as needed

**Official resources:**
- [Product Hunt Launch Guide](https://www.producthunt.com/launch) - Launch day best practices
- [Product Hunt 2026 Playbook](https://blog.innmind.com/how-to-launch-on-product-hunt-in-2026/) - Focus on comments, not just upvotes

**Key details:**
- Respond to every Product Hunt comment within 30 minutes
- Focus on generating genuine engagement, not gaming upvotes
- Capture spike in traffic with compelling CTAs

---
Verified: February 2026'
WHERE title = 'Execute Launch Day'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- Task 4.10: Post-Launch Analysis
UPDATE public.pack_items
SET description = '**What to do:**
- Compile metrics report comparing results to goals
- Gather qualitative feedback from users and team
- Identify what worked well and what to improve
- Create 30-day conversion plan to maximize launch momentum

**Official resources:**
- [Product Hunt 2026 Playbook](https://blog.innmind.com/how-to-launch-on-product-hunt-in-2026/) - Post-launch monetization critical period
- [Indie Hackers Conversion Strategy](https://awesome-directories.com/blog/indie-hackers-launch-strategy-guide-2025/) - Sustained engagement beats one-time launch

**Key details:**
- The 30 days after launch are critical for conversion
- Successful launches require post-launch conversion sprint
- Document learnings for future launches

---
Verified: February 2026'
WHERE title = 'Post-Launch Analysis'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Product Launch' LIMIT 1);

-- =============================================
-- PACK 5: Customer Discovery (9 tasks)
-- =============================================

-- Task 5.1: Define Research Objectives
UPDATE public.pack_items
SET description = '**What to do:**
- Clarify what you need to learn: problem validation, solution fit, or pricing
- Define hypotheses to test with specific pass/fail criteria
- Identify what decisions will be made based on findings
- Scope research to answer 2-3 critical questions, not everything

**Official resources:**
- [The Mom Test](https://www.momtestbook.com/) - How to talk to customers without getting lied to
- [Jobs-to-be-Done Framework](https://jobs-to-be-done.com/jobs-to-be-done-a-framework-for-customer-needs-c883cbf61c90) - Customer needs framework
- [JTBD Playbook](https://strategyn.com/jobs-to-be-done/jobs-to-be-done-playbook/what-is-jobs-to-be-done/) - Understanding customer jobs

**Key details:**
- Focused research yields actionable insights
- "What job is the customer trying to get done?" is the core question
- Avoid trying to validate your solution—seek to understand the problem

---
Verified: February 2026'
WHERE title = 'Define Research Objectives'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1);

-- Task 5.2: Create Interview Discussion Guide
UPDATE public.pack_items
SET description = '**What to do:**
- Draft open-ended questions focusing on past behavior, not future predictions
- Follow The Mom Test rules: ask about their life, not your idea
- Include probing questions to dig deeper on interesting responses
- Structure guide with warm-up, core questions, and wrap-up sections

**Official resources:**
- [The Mom Test Book](https://www.momtestbook.com/) - Complete customer interview methodology
- [The Mom Test Summary](https://www.shortform.com/blog/the-mom-test-book/) - Key principles overview
- [Mom Test 3 Rules](https://www.shortform.com/blog/what-is-the-mom-test/) - Core interviewing rules
- [JTBD Interview Guide](https://jobs-to-be-done.com/jobs-to-be-done-interviews-79623d99b3e5) - JTBD interview methodology

**Key details:**
- Ask "Tell me about the last time you..." not "Would you use..."
- Good questions: specific, past-tense, about behavior
- Bad questions: hypothetical, leading, about opinions

---
Verified: February 2026'
WHERE title = 'Create Interview Discussion Guide'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1);

-- Task 5.3: Identify Target Interview Segments
UPDATE public.pack_items
SET description = '**What to do:**
- Define 2-4 customer segments to interview for diverse perspectives
- Create screening criteria to identify qualified participants
- Prioritize segments most critical to validate your hypotheses
- Ensure diversity within segments (company size, role, geography)

**Official resources:**
- [Jobs-to-be-Done Framework](https://www.hotjar.com/product-management-glossary/jobs-to-be-done/) - Identifying outcomes and segments
- [JTBD Interview Guide](https://jobs-to-be-done.com/jobs-to-be-done-interviews-79623d99b3e5) - Focusing on customer jobs

**Key details:**
- Include power users AND churned/non-users
- 5-8 interviews per segment typically reveals patterns
- Don''t just interview people who love you

---
Verified: February 2026'
WHERE title = 'Identify Target Interview Segments'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1);

-- Task 5.4: Recruit Interview Participants
UPDATE public.pack_items
SET description = '**What to do:**
- Recruit 15-20 participants across defined segments
- Use multiple channels: network, cold outreach, paid recruitment
- Offer appropriate incentives ($50-150 for B2B, $20-50 for consumer)
- Schedule interviews with buffer time for notes between sessions

**Official resources:**
- [User Interviews Platform](https://www.userinterviews.com/) - Recruit qualified research participants
- [User Interviews Recruit](https://www.userinterviews.com/recruit) - Access to 6M+ panelists
- [User Interviews Panel Quality](https://www.userinterviews.com/meet-our-panel) - <0.3% fraud rate, 7.3% no-show rate

**Key details:**
- User Interviews offers same-day matching for most segments
- Expect 10-20% no-show rate for scheduled interviews
- Over-recruit by 25% to account for cancellations

---
Verified: February 2026'
WHERE title = 'Recruit Interview Participants'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1);

-- Task 5.5: Conduct Customer Interviews
UPDATE public.pack_items
SET description = '**What to do:**
- Lead discovery conversations following discussion guide structure
- Practice active listening—let them talk 80% of the time
- Probe deeper on surprising or emotional responses
- Avoid revealing your solution until the end (if at all)

**Official resources:**
- [The Mom Test](https://www.momtestbook.com/) - "How to talk to customers & learn if your business is a good idea when everyone is lying to you"
- [The Mom Test Udemy Course](https://www.momtestbook.com/) - Practical customer development training
- [JTBD Interview Methods](https://jobs-to-be-done.com/jobs-to-be-done-interviews-79623d99b3e5) - Getting results from JTBD interviews

**Key details:**
- Record interviews (with permission) for accurate notes
- Take minimal notes during—be fully present
- Look for strong emotions as signals of real pain

---
Verified: February 2026'
WHERE title = 'Conduct Customer Interviews'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1);

-- Task 5.6: Transcribe and Organize Notes
UPDATE public.pack_items
SET description = '**What to do:**
- Transcribe key quotes and insights from each interview
- Tag insights by theme, segment, and research question
- Organize in shared repository (Notion, Dovetail, spreadsheet)
- Highlight surprising findings and strong emotional responses

**Official resources:**
- [User Interviews Features](https://www.userinterviews.com/features) - End-to-end research tools
- [Notion Team Wiki](https://www.notion.com/help/guides/team-wiki) - Organizing research findings

**Key details:**
- Transcribe within 24 hours while context is fresh
- Verbatim quotes are more powerful than summaries
- Note body language and tone, not just words

---
Verified: February 2026'
WHERE title = 'Transcribe and Organize Notes'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1);

-- Task 5.7: Synthesize Interview Findings
UPDATE public.pack_items
SET description = '**What to do:**
- Analyze patterns across all interviews by theme
- Identify consistent pain points vs. one-off complaints
- Map findings to Jobs-to-be-Done framework
- Prioritize insights by frequency and intensity

**Official resources:**
- [JTBD Framework](https://jobs-to-be-done.com/jobs-to-be-done-a-framework-for-customer-needs-c883cbf61c90) - Structuring customer needs
- [JTBD for Product Teams](https://www.hotjar.com/product-management-glossary/jobs-to-be-done/) - Identifying outcomes from interviews

**Key details:**
- Look for patterns—3+ people saying the same thing matters
- Weight insights by customer segment value
- Note what surprised you vs. confirmed assumptions

---
Verified: February 2026'
WHERE title = 'Synthesize Interview Findings'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1);

-- Task 5.8: Create Customer Discovery Report
UPDATE public.pack_items
SET description = '**What to do:**
- Compile findings into structured report with executive summary
- Include key quotes that bring insights to life
- Present findings organized by research question
- Add clear recommendations with supporting evidence

**Official resources:**
- [JTBD Framework Guide](https://strategyn.com/jobs-to-be-done/jobs-to-be-done-playbook/what-is-jobs-to-be-done/) - Presenting customer job findings
- [The Mom Test](https://www.momtestbook.com/) - Determining if someone will actually buy

**Key details:**
- Lead with actionable insights, not methodology
- Include "what we learned" and "what we still don''t know"
- Make recommendations specific and time-bound

---
Verified: February 2026'
WHERE title = 'Create Customer Discovery Report'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1);

-- Task 5.9: Review Findings and Decide Next Steps
UPDATE public.pack_items
SET description = '**What to do:**
- Present findings to stakeholders and gather reactions
- Evaluate which hypotheses were validated or invalidated
- Make strategic decisions about product direction
- Define next research phase or move to building

**Official resources:**
- [The Mom Test](https://www.momtestbook.com/) - Making decisions based on customer evidence
- [JTBD Framework](https://jobs-to-be-done.com/jobs-to-be-done-a-framework-for-customer-needs-c883cbf61c90) - Aligning team on customer understanding

**Key details:**
- Don''t cherry-pick data—present the full picture
- Be willing to pivot if evidence demands it
- Customer discovery is iterative, not one-time

---
Verified: February 2026'
WHERE title = 'Review Findings and Decide Next Steps'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Customer Discovery' LIMIT 1);

-- =============================================
-- PACK 6: Technical Infrastructure Setup (9 tasks)
-- =============================================

-- Task 6.1: Audit Current Infrastructure
UPDATE public.pack_items
SET description = '**What to do:**
- Document existing infrastructure components and dependencies
- Identify gaps in reliability, security, and observability
- Assess current deployment process and pain points
- Review infrastructure costs and optimization opportunities

**Official resources:**
- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html) - Infrastructure assessment framework
- [AWS Well-Architected Review Process](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-review-process.html) - Conducting architecture reviews
- [AWS Well-Architected Tool](https://docs.aws.amazon.com/wellarchitected/latest/userguide/wa-framework-review.html) - Free assessment tool

**Key details:**
- Review should be constructive, blame-free conversation
- Six pillars: operational excellence, security, reliability, performance, cost, sustainability
- Conduct reviews at key milestones and before go-live

---
Verified: February 2026'
WHERE title = 'Audit Current Infrastructure'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1);

-- Task 6.2: Design CI/CD Pipeline
UPDATE public.pack_items
SET description = '**What to do:**
- Define pipeline stages: lint, test, build, deploy
- Choose CI/CD platform (GitHub Actions, GitLab CI, CircleCI)
- Design environment strategy (dev, staging, production)
- Plan deployment strategy (blue-green, canary, rolling)

**Official resources:**
- [GitHub Actions Documentation](https://docs.github.com/en/actions) - Complete CI/CD platform docs
- [GitHub Actions Quickstart](https://docs.github.com/en/actions/quickstart) - Try core features in minutes
- [GitHub Actions Writing Workflows](https://docs.github.com/en/actions/writing-workflows) - YAML workflow configuration
- [GitHub Starter Workflows](https://github.com/actions/starter-workflows) - Pre-built workflow templates

**Key details:**
- GitHub Actions free tier: 2,000 minutes/month for private repos
- Start simple—add complexity only when needed
- Arm64 runners now available for faster builds

---
Verified: February 2026'
WHERE title = 'Design CI/CD Pipeline'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1);

-- Task 6.3: Review Infrastructure Plan
UPDATE public.pack_items
SET description = '**What to do:**
- Review proposed architecture against requirements
- Approve technology choices and vendor selections
- Confirm budget allocation and ongoing costs
- Sign off on security approach and compliance needs

**Official resources:**
- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html) - Architecture evaluation guide
- [AWS Questions and Best Practices](https://docs.aws.amazon.com/wellarchitected/latest/framework/appendix.html) - Review checklist

**Key details:**
- Involve security early, not as afterthought
- Consider both build and run costs
- Plan for 10x growth without major re-architecture

---
Verified: February 2026'
WHERE title = 'Review Infrastructure Plan'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1);

-- Task 6.4: Implement CI/CD Pipeline
UPDATE public.pack_items
SET description = '**What to do:**
- Create workflow YAML files for CI/CD automation
- Configure test runners and build environments
- Set up deployment automation to staging and production
- Implement branch protection rules and required checks

**Official resources:**
- [GitHub Actions Getting Started](https://docs.github.com/en/actions/get-started) - Initial setup guide
- [GitHub Actions How-tos](https://docs.github.com/en/actions/how-tos) - Common configuration patterns
- [GitHub Starter Workflows](https://github.com/actions/starter-workflows) - CI, deployment, automation templates

**Key details:**
- Start with template workflows and customize
- Run tests in parallel for faster feedback
- Use caching to reduce build times

---
Verified: February 2026'
WHERE title = 'Implement CI/CD Pipeline'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1);

-- Task 6.5: Configure Monitoring and Alerting
UPDATE public.pack_items
SET description = '**What to do:**
- Set up application performance monitoring (APM)
- Configure infrastructure metrics collection
- Create dashboards for key metrics and SLIs
- Define alert thresholds and escalation policies

**Official resources:**
- [Datadog Getting Started](https://docs.datadoghq.com/getting_started/) - Complete setup guide
- [Datadog Agent Setup](https://docs.datadoghq.com/getting_started/agent) - Installing the monitoring agent
- [Datadog Monitors Guide](https://docs.datadoghq.com/getting_started/monitors/) - Setting up alerts
- [Sentry Getting Started](https://docs.sentry.io/product/sentry-basics/) - Error tracking setup

**Key details:**
- Datadog agent auto-collects CPU, memory, disk, network metrics
- Data transmission begins within 2-3 minutes of agent install
- Configure alerts for symptoms (latency, errors) not causes

---
Verified: February 2026'
WHERE title = 'Configure Monitoring and Alerting'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1);

-- Task 6.6: Implement Logging Infrastructure
UPDATE public.pack_items
SET description = '**What to do:**
- Configure centralized log aggregation
- Set up log retention policies and archival
- Implement structured logging format (JSON)
- Create log search and analysis dashboards

**Official resources:**
- [Datadog Getting Started](https://docs.datadoghq.com/getting_started/) - Includes log management setup
- [Datadog Infrastructure Monitoring](https://docs.datadoghq.com/error_tracking/guides/enable_infra) - Infrastructure logging
- [Sentry Documentation](https://docs.sentry.io/) - Error and log tracking

**Key details:**
- Use structured logging (JSON) for easier querying
- Set appropriate retention: 7 days hot, 30 days warm, 1 year cold
- Include correlation IDs for distributed tracing

---
Verified: February 2026'
WHERE title = 'Implement Logging Infrastructure'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1);

-- Task 6.7: Create Infrastructure Documentation
UPDATE public.pack_items
SET description = '**What to do:**
- Document architecture with diagrams and component descriptions
- Create runbooks for common operational procedures
- Write incident response procedures with escalation paths
- Document access controls and credential management

**Official resources:**
- [Notion Build Company Wiki](https://www.notion.com/help/guides/how-to-build-a-wiki-for-your-company) - Documentation structure
- [Notion Docs-First Culture](https://www.notion.com/help/guides/build-a-docs-first-culture-with-a-beautiful-team-wiki-powered-by-a-database) - Keeping docs current
- [AWS Well-Architected Documentation](https://docs.aws.amazon.com/wellarchitected/latest/userguide/continue-workflow-review.html) - Documenting architecture decisions

**Key details:**
- Keep docs close to code (in repo or linked from README)
- Use database-backed wiki for verification and ownership
- Update docs as part of definition of done

---
Verified: February 2026'
WHERE title = 'Create Infrastructure Documentation'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1);

-- Task 6.8: Security Hardening
UPDATE public.pack_items
SET description = '**What to do:**
- Implement secrets management (environment variables, vault)
- Configure access controls with least-privilege principle
- Set up dependency scanning for vulnerabilities
- Enable security headers and HTTPS enforcement

**Official resources:**
- [Sentry Setup Guide](https://docs.sentry.io/product/onboarding/) - Security monitoring and error tracking
- [Sentry Supported Platforms](https://docs.sentry.io/) - SDKs for all major platforms
- [AWS Well-Architected Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html) - Security best practices

**Key details:**
- Never commit secrets to version control
- Enable MFA for all infrastructure access
- Scan dependencies weekly and patch critical vulnerabilities within 24 hours

---
Verified: February 2026'
WHERE title = 'Security Hardening'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1);

-- Task 6.9: Conduct Infrastructure Review
UPDATE public.pack_items
SET description = '**What to do:**
- Verify all systems are operational and monitored
- Review documentation completeness and accuracy
- Confirm team has access and knows procedures
- Sign off on production readiness

**Official resources:**
- [AWS Well-Architected Review](https://docs.aws.amazon.com/wellarchitected/latest/userguide/wa-framework-review.html) - Formal review process
- [AWS Review Process Guide](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-review-process.html) - Conducting effective reviews

**Key details:**
- Reviews should take hours, not days
- Include developers, ops, and security in review
- Create action list for any gaps identified

---
Verified: February 2026'
WHERE title = 'Conduct Infrastructure Review'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Technical Infrastructure Setup' LIMIT 1);

-- =============================================
-- PACK 7: Team Culture & Rituals (9 tasks)
-- =============================================

-- Task 7.1: Research Company Culture Frameworks
UPDATE public.pack_items
SET description = '**What to do:**
- Study GitLab''s all-remote handbook for async-first culture patterns
- Analyze Netflix culture deck for high-performance team principles
- Review other notable culture docs (Spotify, Buffer, Basecamp)
- Identify elements that align with your company''s stage and values

**Official resources:**
- [GitLab Company Handbook](https://handbook.gitlab.com/) - World''s most comprehensive company handbook
- [GitLab All-Remote Guide](https://handbook.gitlab.com/handbook/company/culture/all-remote/guide/) - Remote work best practices
- [Netflix Culture Memo](https://jobs.netflix.com/culture) - Freedom and responsibility principles
- [Netflix Culture PDF](https://jobs.netflix.com/netflix-culture.pdf) - Complete culture deck

**Key details:**
- GitLab: 1,500+ employees across 65+ countries, fully remote
- Netflix: Dream team, people over process, uncomfortably exciting, always better
- Don''t copy cultures—adapt principles to your context

---
Verified: February 2026'
WHERE title = 'Research Company Culture Frameworks'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1);

-- Task 7.2: Define Company Values
UPDATE public.pack_items
SET description = '**What to do:**
- Articulate 3-5 core values that guide decisions and behavior
- Define what each value means in practice with concrete examples
- Identify behaviors that demonstrate vs. violate each value
- Ensure values differentiate you, not just motherhood statements

**Official resources:**
- [Netflix Culture Memo](https://jobs.netflix.com/culture) - Eight core values: selflessness, judgment, candor, creativity, courage, inclusion, curiosity, resilience
- [GitLab Values](https://handbook.gitlab.com/) - Transparency, collaboration, efficiency, diversity, iteration, results
- [Building Remote Culture](https://handbook.gitlab.com/handbook/company/culture/all-remote/building-culture) - Values reinforcement

**Key details:**
- Values should help make hard decisions, not just feel good
- Test values: "Would we fire a high performer who violates this?"
- Involve early employees in defining values

---
Verified: February 2026'
WHERE title = 'Define Company Values'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1);

-- Task 7.3: Draft Culture Document
UPDATE public.pack_items
SET description = '**What to do:**
- Write comprehensive culture doc explaining values and how we work
- Include examples of values in action and anti-patterns to avoid
- Document expectations for communication, collaboration, and feedback
- Make it authentic—don''t write aspirational fiction

**Official resources:**
- [GitLab Handbook-First Approach](https://handbook.gitlab.com/) - Documentation as culture
- [Netflix Culture Memo](https://jobs.netflix.com/culture) - Clear, direct culture communication
- [Notion Team Wiki Template](https://www.notion.com/templates/team-wiki) - Culture documentation structure

**Key details:**
- Public documentation (like GitLab) forces honesty
- Update culture doc based on real incidents and learnings
- New hires should be able to understand culture from the doc alone

---
Verified: February 2026'
WHERE title = 'Draft Culture Document'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1);

-- Task 7.4: Review and Refine Culture Document
UPDATE public.pack_items
SET description = '**What to do:**
- Gather feedback from team on culture document draft
- Test document with new hire perspective—is it clear?
- Iterate on language to ensure authenticity and clarity
- Approve final version for publication

**Official resources:**
- [GitLab Building Culture](https://handbook.gitlab.com/handbook/company/culture/all-remote/building-culture) - Gathering and incorporating feedback
- [Netflix Culture Deck History](https://about.netflix.com/en/news/sharing-our-latest-culture-memo) - Iterating culture docs over time

**Key details:**
- Netflix updates culture deck through company-wide feedback
- Good culture docs are living documents, not static
- Ask: "Does this match how we actually operate?"

---
Verified: February 2026'
WHERE title = 'Review and Refine Culture Document'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1);

-- Task 7.5: Design Team Rituals
UPDATE public.pack_items
SET description = '**What to do:**
- Define meeting cadence: standups, retrospectives, all-hands, 1:1s
- Create formats and templates for recurring meetings
- Plan social rituals for team bonding (virtual coffee, team lunches)
- Balance synchronous rituals with async-first culture

**Official resources:**
- [GitLab All-Remote Tips](https://handbook.gitlab.com/handbook/company/culture/all-remote/tips) - Building remote team rituals
- [GitLab Remote Culture Guide](https://handbook.gitlab.com/handbook/company/culture/all-remote) - Intentional culture building
- [Notion Build Team Wiki](https://www.notion.com/help/guides/team-wiki) - Documenting rituals

**Key details:**
- GitLab: facilitates informal communication intentionally
- Remote teams need more intentional social time, not less
- Start with fewer rituals and add based on need

---
Verified: February 2026'
WHERE title = 'Design Team Rituals'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1);

-- Task 7.6: Set Up Communication Norms
UPDATE public.pack_items
SET description = '**What to do:**
- Define expectations for Slack/email response times
- Establish guidelines for async vs. sync communication
- Create channel structure and naming conventions
- Document meeting etiquette and recording policies

**Official resources:**
- [GitLab Remote Manifesto](https://handbook.gitlab.com/handbook/company/culture/all-remote/guide/) - Written over verbal, async over sync, public over private
- [GitLab All-Remote Guide](https://handbook.gitlab.com/handbook/company/culture/all-remote) - Communication best practices
- [Notion Company Wiki Guide](https://www.notion.com/help/guides/how-to-build-a-wiki-for-your-company) - Centralizing communication norms

**Key details:**
- GitLab: Results over hours worked, flexible working hours
- Default to public channels for transparency
- Urgent ≠ important—most things can wait for async

---
Verified: February 2026'
WHERE title = 'Set Up Communication Norms'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1);

-- Task 7.7: Create Decision-Making Framework
UPDATE public.pack_items
SET description = '**What to do:**
- Document who makes what types of decisions (RACI or DRI model)
- Define escalation paths for blocked or contentious decisions
- Establish autonomy levels by role and decision type
- Create templates for documenting and communicating decisions

**Official resources:**
- [GitLab Handbook](https://handbook.gitlab.com/) - DRI (Directly Responsible Individual) model
- [Netflix Culture: People Over Process](https://jobs.netflix.com/culture) - Trusting employees with decisions
- [HBR: How Netflix Reinvented HR](https://hbr.org/2014/01/how-netflix-reinvented-hr) - Context over control

**Key details:**
- Netflix: hire great people and give them freedom
- GitLab: handbook-first means decisions are documented
- Clear ownership prevents decisions from stalling

---
Verified: February 2026'
WHERE title = 'Create Decision-Making Framework'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1);

-- Task 7.8: Implement Team Rituals
UPDATE public.pack_items
SET description = '**What to do:**
- Schedule all recurring meetings and events in team calendar
- Create templates and agendas for each ritual
- Train team on new processes and gather initial feedback
- Set up tooling to support rituals (Notion, Slack workflows)

**Official resources:**
- [Notion Team Wiki Guide](https://www.notion.com/help/guides/team-wiki) - Customizable team homepages
- [Notion Wiki Templates](https://www.notion.com/templates/team-wiki) - Free wiki templates
- [GitLab All-Remote Tips](https://handbook.gitlab.com/handbook/company/culture/all-remote/tips) - Remote ritual implementation

**Key details:**
- Start rituals before they feel necessary
- Use shared docs (Google Docs, Notion) instead of whiteboards
- Record all-hands for async viewing

---
Verified: February 2026'
WHERE title = 'Implement Team Rituals'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1);

-- Task 7.9: First Culture Retrospective
UPDATE public.pack_items
SET description = '**What to do:**
- After 4 weeks, gather team feedback on culture and rituals
- Identify what''s working well and what needs adjustment
- Make concrete changes based on feedback
- Schedule recurring culture retrospectives (quarterly)

**Official resources:**
- [GitLab Building Culture](https://handbook.gitlab.com/handbook/company/culture/all-remote/building-culture) - Continuous culture improvement
- [Netflix Culture Evolution](https://about.netflix.com/en/news/sharing-our-latest-culture-memo) - Regular culture updates
- [Wharton: Netflix Culture Building](https://knowledge.wharton.upenn.edu/podcast/knowledge-at-wharton-podcast/how-netflix-built-its-company-culture/) - Iterating on culture

**Key details:**
- Culture is never "done"—it requires ongoing attention
- GitLab: reinforces values through bonuses and promotions
- Be willing to change rituals that aren''t working

---
Verified: February 2026'
WHERE title = 'First Culture Retrospective'
AND pack_id = (SELECT id FROM public.objective_packs WHERE title = 'Team Culture & Rituals' LIMIT 1);

-- =============================================
-- VERIFICATION
-- =============================================
-- Verify updates were applied
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO updated_count
    FROM public.pack_items
    WHERE description LIKE '%**What to do:**%'
    AND description LIKE '%**Official resources:**%'
    AND description LIKE '%Verified: February 2026%';
    
    RAISE NOTICE 'Updated % task descriptions with enhanced format', updated_count;
END $$;
