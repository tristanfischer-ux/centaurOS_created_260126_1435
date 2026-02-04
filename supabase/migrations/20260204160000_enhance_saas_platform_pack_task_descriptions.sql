-- =============================================
-- MIGRATION: Enhance SaaS Platform Pack Task Descriptions
-- =============================================
-- This migration updates 25 task descriptions across 5 SaaS packs with:
-- - Clear action items
-- - Official resource links (verified February 2026)
-- - Key details (cost/timeline/requirements)

-- =============================================
-- PACK 1: Platform Architecture (5 tasks)
-- ID: 88888888-8888-8888-8888-000000000001
-- =============================================

-- Task 1.1: Define System Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Document scale requirements: expected users, concurrent connections, data volume
- Define performance targets: response times (p50, p95, p99), throughput goals
- Establish availability requirements: uptime SLA (99.9%, 99.99%), RPO/RTO
- Identify compliance needs: GDPR, SOC 2, HIPAA based on target customers

**Official resources:**
- [AWS Well-Architected SaaS Lens](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/saas-lens.html) - SaaS-specific architecture guidance
- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html) - Six pillars evaluation framework
- [General Design Principles](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/general-design-principles.html) - No one-size-fits-all architecture

**Key details:**
- Design for 10x your current scale to avoid re-architecture
- SaaS Lens covers: tenant isolation, data partitioning, noisy neighbor, metering
- Include sustainability pillar in requirements (energy efficiency)

---
Verified: February 2026'
WHERE title = 'Define System Requirements'
AND pack_id = '88888888-8888-8888-8888-000000000001';

-- Task 1.2: Design Service Architecture
UPDATE public.pack_items
SET description = '**What to do:**
- Design API layer: REST/GraphQL endpoints, versioning strategy, rate limiting
- Plan service decomposition based on multi-tenant load patterns
- Define communication patterns: sync (HTTP) vs async (queues, events)
- Document service boundaries and inter-service contracts

**Official resources:**
- [AWS SaaS Lens Design Principles](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/general-design-principles.html) - Service decomposition guidance
- [Vercel Deployment Patterns](https://vercel.com/docs/deployments/overview) - Modern deployment strategies
- [Next.js Production Checklist](https://nextjs.org/docs/14/app/building-your-application/deploying/production-checklist) - Production optimization

**Key details:**
- Design for tenant resource isolation from day one
- Instrument tenant metrics for observability and billing
- Consider serverless for variable workloads, containers for predictable loads

---
Verified: February 2026'
WHERE title = 'Design Service Architecture'
AND pack_id = '88888888-8888-8888-8888-000000000001';

-- Task 1.3: Design Database Schema
UPDATE public.pack_items
SET description = '**What to do:**
- Choose multi-tenancy model: silo (separate instances), bridge (separate schemas), or pool (shared tables)
- Implement Row-Level Security (RLS) policies for tenant data isolation
- Design connection pooling strategy based on tenancy model
- Plan for tenant onboarding and data migration patterns

**Official resources:**
- [AWS PostgreSQL Multi-Tenant Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/welcome.html) - Comprehensive implementation guide
- [PostgreSQL Data Access Patterns](https://aws.amazon.com/blogs/database/choose-the-right-postgresql-data-access-pattern-for-your-saas-application/) - Pattern selection criteria
- [Multi-Tenancy Decision Matrix](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/matrix.html) - Compare silo/bridge/pool models

**Key details:**
- Pool model: fastest onboarding, best connection efficiency, requires RLS
- Bridge model: moderate isolation, good for cross-tenant queries
- Silo model: maximum isolation, highest operational overhead
- RLS is essential for pool models to prevent cross-tenant access

---
Verified: February 2026'
WHERE title = 'Design Database Schema'
AND pack_id = '88888888-8888-8888-8888-000000000001';

-- Task 1.4: Plan Scalability Strategy
UPDATE public.pack_items
SET description = '**What to do:**
- Design horizontal scaling approach for compute and storage
- Plan caching strategy: application cache, CDN, database query cache
- Define auto-scaling policies and thresholds
- Create capacity planning model with growth projections

**Official resources:**
- [Vercel Production Checklist](https://vercel.com/docs/production-checklist) - Performance and scaling recommendations
- [Vercel Environments](https://vercel.com/docs/deployments/production-env) - Production environment configuration
- [AWS Well-Architected Pillars](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/the-pillars-of-the-well-architected-framework.html) - Performance efficiency pillar

**Key details:**
- Vercel preview deployments auto-scale for testing
- Use edge functions for latency-sensitive operations
- Design stateless services for easy horizontal scaling
- Plan for noisy neighbor scenarios with resource limits per tenant

---
Verified: February 2026'
WHERE title = 'Plan Scalability Strategy'
AND pack_id = '88888888-8888-8888-8888-000000000001';

-- Task 1.5: Document Architecture
UPDATE public.pack_items
SET description = '**What to do:**
- Create architecture diagrams: system context, container, component views
- Write Architecture Decision Records (ADRs) for key decisions
- Document deployment topology and infrastructure dependencies
- Create runbooks for operational procedures

**Official resources:**
- [AWS Well-Architected Review Process](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-review-process.html) - Architecture review methodology
- [AWS SaaS Lens PDF](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/wellarchitected-saas-lens.pdf) - Complete SaaS architecture reference
- [Vercel Deployment Promotion](https://vercel.com/docs/deployments/promoting-a-deployment) - Deployment workflow documentation

**Key details:**
- Reviews should be constructive, blame-free conversations
- Conduct reviews at key milestones and before production launch
- Use C4 model for consistent diagram notation
- Keep ADRs version-controlled alongside code

---
Verified: February 2026'
WHERE title = 'Document Architecture'
AND pack_id = '88888888-8888-8888-8888-000000000001';

-- =============================================
-- PACK 2: Authentication & Authorization (5 tasks)
-- ID: 88888888-8888-8888-8888-000000000002
-- =============================================

-- Task 2.1: Implement Core Auth
UPDATE public.pack_items
SET description = '**What to do:**
- Implement email/password authentication with secure password hashing
- Add magic link authentication for passwordless login
- Set up secure session management with proper token rotation
- Implement account recovery and password reset flows

**Official resources:**
- [Clerk Next.js Authentication](https://clerk.com/nextjs-authentication) - Modern auth with native RSC support
- [Clerk Authentication Guide 2025](https://clerk.com/articles/complete-authentication-guide-for-nextjs-app-router) - App Router best practices
- [Auth0 RBAC Documentation](https://auth0.com/docs/manage-users/access-control/rbac) - Role-based access patterns

**Key details:**
- Clerk achieves production auth in ~30 minutes vs 2-4 hours for alternatives
- Native React Server Components support reduces client-side JavaScript
- CVE-2025-29927 affected Next.js middleware (11.1.4-15.2.2)—ensure patched
- Support passkeys and Web3 authentication for modern security

---
Verified: February 2026'
WHERE title = 'Implement Core Auth'
AND pack_id = '88888888-8888-8888-8888-000000000002';

-- Task 2.2: Add Social Login
UPDATE public.pack_items
SET description = '**What to do:**
- Integrate Google OAuth for consumer-friendly sign-in
- Add GitHub OAuth for developer-focused products
- Implement account linking for users with multiple auth methods
- Handle edge cases: email conflicts, unverified emails

**Official resources:**
- [Clerk Social Providers](https://clerk.com/nextjs-authentication) - Google, GitHub, Apple, Microsoft support
- [Clerk useAuth Hook](https://clerk.com/docs/nextjs/hooks/use-auth) - Client-side auth state management
- [Auth0 Enable RBAC for APIs](https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis) - API authorization

**Key details:**
- Support multiple social providers (Google, GitHub, Apple, Microsoft)
- Prebuilt UI components: SignIn, SignUp, UserButton with customization
- Store provider tokens securely for API access if needed
- Handle rate limits from OAuth providers gracefully

---
Verified: February 2026'
WHERE title = 'Add Social Login'
AND pack_id = '88888888-8888-8888-8888-000000000002';

-- Task 2.3: Build SSO Support
UPDATE public.pack_items
SET description = '**What to do:**
- Implement SAML 2.0 support for enterprise identity providers
- Add OIDC (OpenID Connect) as alternative federation protocol
- Handle real-world IdP variations: NameID formats, signature requirements
- Create admin UI for customer SSO configuration

**Official resources:**
- [WorkOS Single Sign-On](https://workos.com/docs/sso) - Unified SSO integration
- [WorkOS Multi-Provider Support](https://workos.com/blog/supporting-multiple-identity-providers) - One integration for all IdPs
- [WorkOS How SSO Works](https://workos.com/blog/how-sso-works) - Architecture and implementation guide
- [WorkOS Add SSO to Your App](https://workos.com/blog/adding-sso-to-your-app) - Step-by-step integration

**Key details:**
- WorkOS handles Azure AD, Okta, Ping Identity, ADFS through single API
- Main challenge: handling non-standard IdP implementations, not spec compliance
- SSO is prerequisite for enterprise deals—reduces password fatigue, centralizes security
- Two options: Standalone SSO API or AuthKit (complete auth platform)

---
Verified: February 2026'
WHERE title = 'Build SSO Support'
AND pack_id = '88888888-8888-8888-8888-000000000002';

-- Task 2.4: Implement RBAC
UPDATE public.pack_items
SET description = '**What to do:**
- Define role hierarchy: owner, admin, member, viewer (or custom)
- Implement permission checks at API and UI levels
- Create role assignment and management interfaces
- Support custom roles for enterprise customers

**Official resources:**
- [Auth0 RBAC Documentation](https://auth0.com/docs/manage-users/access-control/rbac) - Core RBAC concepts
- [Auth0 Manage Roles](https://auth0.com/docs/manage-users/access-control/configure-core-rbac/roles) - Role configuration
- [Auth0 Configure Core RBAC](https://auth0.com/docs/manage-users/access-control/configure-core-rbac) - Step-by-step setup
- [Auth0 Authorization Core](https://auth0.com/docs/manage-users/access-control/authorization-core-vs-authorization-extension) - Recommended approach

**Key details:**
- Assign permissions to roles, not individual users—more manageable
- Authorization Core recommended over Extension for new implementations
- Supports Organizations for B2B/SaaS multi-tenant applications
- Scope claim in access tokens reflects intersection of requested and assigned permissions

---
Verified: February 2026'
WHERE title = 'Implement RBAC'
AND pack_id = '88888888-8888-8888-8888-000000000002';

-- Task 2.5: Add Team Management
UPDATE public.pack_items
SET description = '**What to do:**
- Build team/organization data model with membership relationships
- Implement invite flow: email invitation, acceptance, role assignment
- Create team settings UI: member management, role changes, removals
- Support multiple team memberships per user

**Official resources:**
- [Clerk Migration from Auth.js](https://clerk.com/docs/references/nextjs/authjs-migration) - Migration guide with team features
- [WorkOS SSO Guides](https://workos.com/guides/authentication-sso) - Enterprise team authentication
- [Auth0 Organizations](https://auth0.com/docs/manage-users/access-control/authorization-core-vs-authorization-extension) - B2B organization support

**Key details:**
- Design for both single-tenant and multi-tenant team structures
- Implement proper authorization: only admins can invite/remove members
- Handle edge cases: last admin leaving, pending invites expiry
- Support bulk operations for enterprise customer onboarding

---
Verified: February 2026'
WHERE title = 'Add Team Management'
AND pack_id = '88888888-8888-8888-8888-000000000002';

-- =============================================
-- PACK 3: Billing & Subscriptions (5 tasks)
-- ID: 88888888-8888-8888-8888-000000000003
-- =============================================

-- Task 3.1: Define Pricing Model
UPDATE public.pack_items
SET description = '**What to do:**
- Design pricing tiers: free, starter, pro, enterprise (typical SaaS structure)
- Define feature gating: which features available at each tier
- Plan metered components: API calls, storage, users, or custom metrics
- Document upgrade/downgrade rules and proration policy

**Official resources:**
- [Stripe Subscriptions API](https://docs.stripe.com/api/subscriptions) - Core subscription management
- [Stripe Usage-Based Billing](https://docs.stripe.com/billing/subscriptions/usage-based/meters/configure) - Metered billing setup
- [Stripe Create Meters](https://docs.stripe.com/billing/subscriptions/usage-based/meters/create) - Usage tracking configuration

**Key details:**
- Consider both seat-based and usage-based pricing components
- Free tier helps acquisition; paid conversion is the real metric
- Document grandfathering policy for existing customers during price changes
- Plan annual vs monthly pricing (typically 15-20% annual discount)

---
Verified: February 2026'
WHERE title = 'Define Pricing Model'
AND pack_id = '88888888-8888-8888-8888-000000000003';

-- Task 3.2: Integrate Stripe
UPDATE public.pack_items
SET description = '**What to do:**
- Set up Stripe account and configure products/prices
- Implement checkout flow using Stripe Checkout or Elements
- Create webhook handlers for subscription lifecycle events
- Sync subscription status with your database

**Official resources:**
- [Stripe Subscriptions API](https://docs.stripe.com/api/subscriptions) - Complete API reference
- [Stripe Update Subscription](https://docs.stripe.com/api/subscriptions/update) - Modify existing subscriptions
- [Stripe List Subscriptions](https://docs.stripe.com/api/subscriptions/list) - Query subscription data
- [Stripe Retrieve Subscription](https://docs.stripe.com/api/subscriptions/retrieve) - Get subscription details

**Key details:**
- Use Stripe''s idempotent requests for webhook reliability
- Handle metadata for custom attributes and tracking
- Implement proper error handling for payment failures
- Support connected accounts if building a marketplace

---
Verified: February 2026'
WHERE title = 'Integrate Stripe'
AND pack_id = '88888888-8888-8888-8888-000000000003';

-- Task 3.3: Build Subscription Management
UPDATE public.pack_items
SET description = '**What to do:**
- Create upgrade/downgrade flows with clear pricing impact
- Implement proration handling for mid-cycle changes
- Build cancellation flow with optional feedback collection
- Handle subscription pausing and resumption

**Official resources:**
- [Stripe Customer Portal Setup](https://docs.stripe.com/no-code/customer-portal) - No-code portal configuration
- [Stripe Integrating Customer Portal](https://stripe.com/docs/billing/subscriptions/integrating-customer-portal) - Full integration guide
- [Stripe Update Subscription](https://docs.stripe.com/api/subscriptions/update) - Programmatic subscription changes

**Key details:**
- Stripe Customer Portal handles most self-service scenarios
- Portal can be set up entirely through Dashboard without code
- Customize portal features: subscription changes, payment methods, invoices
- Works for SaaS, creators, and e-commerce—linkable without a website

---
Verified: February 2026'
WHERE title = 'Build Subscription Management'
AND pack_id = '88888888-8888-8888-8888-000000000003';

-- Task 3.4: Add Usage Tracking
UPDATE public.pack_items
SET description = '**What to do:**
- Create usage meters for billable events (API calls, storage, tokens, etc.)
- Implement event tracking in your application
- Build usage dashboards for customers to monitor consumption
- Set up usage alerts approaching plan limits

**Official resources:**
- [Stripe Configure Meters](https://docs.stripe.com/billing/subscriptions/usage-based/meters/configure) - Meter setup guide
- [Stripe Record Usage API](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api) - Send usage events
- [Stripe Create Meter](https://docs.stripe.com/billing/subscriptions/usage-based/meters/create) - Meter configuration

**Key details:**
- Meters aggregate events over billing period—define aggregation method
- Record usage via API, Dashboard bulk upload, or S3 batch
- Usage events are processed asynchronously—not immediate in invoices
- Once configured, meter settings cannot be changed (except display name)

---
Verified: February 2026'
WHERE title = 'Add Usage Tracking'
AND pack_id = '88888888-8888-8888-8888-000000000003';

-- Task 3.5: Create Billing Portal
UPDATE public.pack_items
SET description = '**What to do:**
- Configure Stripe Customer Portal with your branding
- Enable self-service subscription management
- Set up invoice history and payment method updates
- Create custom billing UI for features not in Stripe Portal

**Official resources:**
- [Stripe Customer Portal](https://docs.stripe.com/no-code/customer-portal) - Hosted billing portal
- [Stripe Portal Integration](https://stripe.com/docs/billing/subscriptions/integrating-customer-portal) - Customization options
- [Stripe Subscriptions API](https://docs.stripe.com/api/subscriptions) - Build custom features

**Key details:**
- Customer Portal is hosted—minimal development required
- Customers can update payment methods, view invoices, change plans
- Portal requires redirect flow—consider embedding for seamless UX
- Build custom UI only for features Stripe Portal doesn''t support

---
Verified: February 2026'
WHERE title = 'Create Billing Portal'
AND pack_id = '88888888-8888-8888-8888-000000000003';

-- =============================================
-- PACK 4: Deployment & DevOps (5 tasks)
-- ID: 88888888-8888-8888-8888-000000000004
-- =============================================

-- Task 4.1: Set Up CI Pipeline
UPDATE public.pack_items
SET description = '**What to do:**
- Create workflow YAML for automated testing on every commit
- Configure linting, type checking, and unit test stages
- Set up test coverage reporting and quality gates
- Implement matrix builds for testing across environments

**Official resources:**
- [GitHub Actions Documentation](https://docs.github.com/en/actions) - Complete CI/CD platform
- [GitHub Actions Quickstart](https://docs.github.com/en/actions/quickstart) - Try features in minutes
- [GitHub Actions Writing Workflows](https://docs.github.com/en/actions/writing-workflows) - YAML configuration
- [GitHub Starter Workflows](https://github.com/actions/starter-workflows) - Pre-built templates

**Key details:**
- Free tier: 2,000 minutes/month for private repos
- Use matrix builds to test across Node versions and operating systems
- Arm64 runners available for faster builds
- Implement caching to reduce build times significantly

---
Verified: February 2026'
WHERE title = 'Set Up CI Pipeline'
AND pack_id = '88888888-8888-8888-8888-000000000004';

-- Task 4.2: Implement CD Pipeline
UPDATE public.pack_items
SET description = '**What to do:**
- Configure automated deployments to staging on merge to main
- Set up production deployment with approval gates
- Implement deployment strategies: blue-green, canary, or rolling
- Create rollback procedures for failed deployments

**Official resources:**
- [Vercel Deployments Overview](https://vercel.com/docs/deployments/overview) - Git integration, CLI, webhooks, API
- [Vercel Environments](https://vercel.com/docs/deployments/production-env) - Dev, Preview, Production setup
- [Vercel Deployment Promotion](https://vercel.com/docs/deployments/promoting-a-deployment) - Instant rollback, preview promotion
- [GitHub Actions Security](https://docs.github.com/en/actions/security-guides) - Secure deployment practices

**Key details:**
- Vercel auto-creates preview deployments for every PR
- Custom environments (staging, QA) available on Pro/Enterprise plans
- Instant rollback without rebuilding—revert to previous production
- Use OpenID Connect for cloud deployments instead of static credentials

---
Verified: February 2026'
WHERE title = 'Implement CD Pipeline'
AND pack_id = '88888888-8888-8888-8888-000000000004';

-- Task 4.3: Configure Infrastructure
UPDATE public.pack_items
SET description = '**What to do:**
- Define infrastructure as code using Terraform or Pulumi
- Configure environments: development, staging, production
- Set up secrets management and environment variables
- Implement state management and drift detection

**Official resources:**
- [Terraform Documentation](https://developer.hashicorp.com/terraform/docs) - Complete IaC platform
- [Terraform Language Reference](https://developer.hashicorp.com/terraform/language) - HCL configuration
- [Pulumi Reference Documentation](https://www.pulumi.com/docs/reference/) - Multi-language IaC
- [Pulumi vs Terraform](https://www.pulumi.com/docs/iac/concepts/vs/terraform/) - Comparison guide

**Key details:**
- Terraform: HCL domain-specific language, lower barrier to entry
- Pulumi: Python, TypeScript, Go—full IDE support, secrets encrypted by default
- Both support all major cloud providers (AWS, GCP, Azure)
- Pulumi is fully open source (Apache 2.0); Terraform has BSL license

---
Verified: February 2026'
WHERE title = 'Configure Infrastructure'
AND pack_id = '88888888-8888-8888-8888-000000000004';

-- Task 4.4: Set Up Monitoring
UPDATE public.pack_items
SET description = '**What to do:**
- Implement Application Performance Monitoring (APM)
- Configure infrastructure metrics collection (CPU, memory, disk, network)
- Create dashboards for key business and technical metrics
- Set up alerting with appropriate thresholds and escalation

**Official resources:**
- [Datadog Getting Started](https://docs.datadoghq.com/getting_started/) - Complete setup guide
- [Datadog Agent Setup](https://docs.datadoghq.com/getting_started/agent) - Monitoring agent installation
- [Datadog APM Monitors](https://docs.datadoghq.com/monitors/types/apm) - Application monitoring
- [Datadog Alerts](https://datadoghq.com/core_product/alerts) - Alerting configuration

**Key details:**
- Datadog agent auto-collects infrastructure metrics within 2-3 minutes
- Leader in Gartner Magic Quadrant for Digital Experience Monitoring 2025
- Integrate with LLM Observability for AI features
- Alert on symptoms (latency, errors) not causes for actionable alerts

---
Verified: February 2026'
WHERE title = 'Set Up Monitoring'
AND pack_id = '88888888-8888-8888-8888-000000000004';

-- Task 4.5: Create Runbooks
UPDATE public.pack_items
SET description = '**What to do:**
- Document common operational procedures with step-by-step instructions
- Create incident response procedures with escalation paths
- Define roles: Incident Commander, Scribe, communications lead
- Set up postmortem process and templates

**Official resources:**
- [PagerDuty Incident Response](https://response.pagerduty.com/) - Complete incident management framework
- [PagerDuty Business Response](https://business-response.pagerduty.com/) - Non-technical incident handling
- [PagerDuty Runbook Automation](https://pagerduty.com/platform/automation/runbook) - Automated remediation
- [PagerDuty Incident Response Docs](https://github.com/pagerduty/incident-response-docs) - Open source templates (Apache 2.0)

**Key details:**
- Runbook Automation: SaaS tool for authoring and executing automated workflows
- Covers before, during, and after incident lifecycle
- Include severity levels, role definitions, call etiquette
- Link runbooks to specific services in PagerDuty for quick access

---
Verified: February 2026'
WHERE title = 'Create Runbooks'
AND pack_id = '88888888-8888-8888-8888-000000000004';

-- =============================================
-- PACK 5: Customer Onboarding (5 tasks)
-- ID: 88888888-8888-8888-8888-000000000005
-- =============================================

-- Task 5.1: Design Onboarding Flow
UPDATE public.pack_items
SET description = '**What to do:**
- Map the user journey from signup to first value ("aha moment")
- Identify critical activation milestones and success metrics
- Design progressive disclosure—don''t overwhelm new users
- Plan onboarding paths for different user personas/segments

**Official resources:**
- [Pendo Product Tours](https://pendo.io/tour/guide-users-in-app) - In-app onboarding guidance
- [Appcues Product Tours Guide](https://www.appcues.com/blog/product-tours-walkthroughs-ultimate-guide) - Creating effective tours
- [Product Tour Software Guide 2026](https://userpilot.com/blog/product-tour-software/) - Platform comparison
- [Intercom Product Tours Best Practices](https://www.intercom.com/help/en/articles/3095688-best-practices-for-using-product-tours) - Tour design principles

**Key details:**
- 63% of users consider onboarding before purchasing—reduces churn
- Tours work best for processes completed in one go (a few minutes)
- Guide users toward their "aha moment" where they realize product value
- Target the right users with appropriate content—don''t show everything to everyone

---
Verified: February 2026'
WHERE title = 'Design Onboarding Flow'
AND pack_id = '88888888-8888-8888-8888-000000000005';

-- Task 5.2: Build Setup Wizard
UPDATE public.pack_items
SET description = '**What to do:**
- Create step-by-step setup flow for initial configuration
- Implement progress indicators and skip options
- Add validation and helpful error messages at each step
- Save progress so users can resume if interrupted

**Official resources:**
- [Appcues No-Code Setup](https://www.appcues.com/blog/product-tours-walkthroughs-ultimate-guide) - Building without code
- [Pendo vs Appcues Comparison](https://hopscotch.club/blog/pendo-vs-appcues) - Feature comparison
- [Intercom Best Practices](https://www.intercom.com/help/en/articles/3095688-best-practices-for-using-product-tours) - Wizard design tips

**Key details:**
- Appcues: no-code, quick setup, starts at $299/month
- Pendo: deeper customization and analytics, higher pricing tiers
- Consider Hopscotch at $99/month for budget-conscious teams
- Save state at each step—users abandon long forms

---
Verified: February 2026'
WHERE title = 'Build Setup Wizard'
AND pack_id = '88888888-8888-8888-8888-000000000005';

-- Task 5.3: Add Product Tour
UPDATE public.pack_items
SET description = '**What to do:**
- Create interactive walkthrough of key features
- Implement tooltips and hotspots for contextual guidance
- Build guided flows for common workflows
- Add dismiss and "don''t show again" options

**Official resources:**
- [Pendo In-App Guides](https://pendo.io/tour/guide-users-in-app) - Deep customization and analytics
- [Appcues Product Tours](https://www.appcues.com/blog/product-tours-walkthroughs-ultimate-guide) - User-friendly setup
- [Intercom Product Tours](https://www.intercom.com/help/en/articles/3095688-best-practices-for-using-product-tours) - Best practices guide

**Key details:**
- Pendo offers robust mobile onboarding (iOS/Android)
- Appcues primarily targets desktop experiences
- Tours should explain processes, not just show features
- Provide overview of product areas, not exhaustive feature lists

---
Verified: February 2026'
WHERE title = 'Add Product Tour'
AND pack_id = '88888888-8888-8888-8888-000000000005';

-- Task 5.4: Create Sample Data
UPDATE public.pack_items
SET description = '**What to do:**
- Design realistic sample data that demonstrates product value
- Create templates users can customize rather than build from scratch
- Implement "demo mode" for sandboxed exploration
- Add clear labels distinguishing sample from real data

**Official resources:**
- [Appcues Onboarding Guide](https://www.appcues.com/blog/product-tours-walkthroughs-ultimate-guide) - Demonstrating value quickly
- [Pendo Product Tours](https://pendo.io/tour/guide-users-in-app) - In-app guidance patterns
- [Product Tour Best Practices](https://userpilot.com/blog/product-tour-software/) - Sample data strategies

**Key details:**
- Sample data should show what "success" looks like in your product
- Allow users to delete sample data when ready
- Templates reduce time-to-value significantly
- Consider industry-specific sample data for B2B products

---
Verified: February 2026'
WHERE title = 'Create Sample Data'
AND pack_id = '88888888-8888-8888-8888-000000000005';

-- Task 5.5: Track Onboarding Metrics
UPDATE public.pack_items
SET description = '**What to do:**
- Implement analytics for each onboarding step
- Track completion rates and identify drop-off points
- Measure time-to-value and activation metrics
- Create cohort analysis to compare onboarding changes

**Official resources:**
- [Pendo Analytics](https://pendo.io/tour/guide-users-in-app) - Built-in tracking and analytics
- [Appcues Onboarding Analytics](https://www.appcues.com/blog/product-tours-walkthroughs-ultimate-guide) - Measure and iterate
- [Product Tour Software Comparison](https://userpilot.com/blog/product-tour-software/) - Analytics features by platform

**Key details:**
- Key metrics: completion rate, drop-off rate, time-to-complete
- Effective tours increase activation, adoption, and retention
- Use cohort analysis to measure impact of onboarding changes
- Track both completion AND actual feature adoption post-onboarding

---
Verified: February 2026'
WHERE title = 'Track Onboarding Metrics'
AND pack_id = '88888888-8888-8888-8888-000000000005';

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
    WHERE pack_id IN (
        '88888888-8888-8888-8888-000000000001',
        '88888888-8888-8888-8888-000000000002',
        '88888888-8888-8888-8888-000000000003',
        '88888888-8888-8888-8888-000000000004',
        '88888888-8888-8888-8888-000000000005'
    )
    AND description LIKE '%**What to do:**%'
    AND description LIKE '%**Official resources:**%'
    AND description LIKE '%Verified: February 2026%';
    
    RAISE NOTICE 'Updated % SaaS Platform task descriptions with enhanced format', updated_count;
END $$;
