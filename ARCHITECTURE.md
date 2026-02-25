# ForgeOS — How It Works (Comprehensive System Audit)

## What ForgeOS Is

ForgeOS is a multi-tenant SaaS platform built for hardware startup founders. It combines **AI specialist agents**, a **CAD/manufacturing workspace**, a **B2B marketplace**, and **operational tools** into a single operating system for running a physical-product company. The brand is **Fractional Forge** (company) / **ForgeOS** (product).

The core thesis: a founder shouldn't need to hire a full C-suite on day one. Instead, 13 AI specialists — each modeled after a world-class executive archetype — provide on-demand expertise across strategy, engineering, finance, legal, manufacturing, supply chain, sales, marketing, HR, and product.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4 |
| Backend | Next.js Server Actions + API Routes |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Auth | Supabase Auth (JWT in HTTP-only cookies) |
| Payments | Stripe + Stripe Connect (escrow, payouts) |
| AI | Anthropic Claude, OpenAI GPT-4o, Google Gemini, Qwen 3.5, MiniMax M2.5, Ollama (local) |
| 3D/CAD | Modal.com (CadQuery execution), Three.js (viewer) |
| Email | Resend |
| Bot | Telegram Bot API |
| Calendar | Google Calendar API (OAuth) |
| Hosting | Vercel (standalone Next.js) |
| Monitoring | Sentry |

---

## 1. Authentication & Multi-Tenancy

**How users get in:**
- Signup via `/join` (role-based: Executive or Apprentice) or invite link `/invite/[token]`
- Supabase Auth handles email verification + OAuth
- JWT stored in HTTP-only cookies (XSS/CSRF safe)
- Middleware checks auth on every platform route → redirects to `/login` if unauthenticated

**Multi-tenancy ("Foundries"):**
- Every company workspace is a **Foundry** — the core isolation unit
- Every data table has a `foundry_id` column
- All queries filter by the user's active `foundry_id` at both application and RLS level
- Users can belong to multiple foundries → `/workspace-picker` lets them switch
- Suppliers get routed to `/supplier-portal` based on `account_type`

**Roles:** Executive, Founder, Apprentice, AI_Agent — each with different permission scopes.

---

## 2. The 13 AI Specialists (Core Feature)

This is the heart of ForgeOS. Each specialist is a fully characterized AI persona with:

| Specialist | Role | Inspired By | Model Tier |
|-----------|------|-------------|------------|
| **Sage** | Strategy Lead | Jeff Bezos | Claude (high-stakes) |
| **Max** | CTO | Elon Musk + Jensen Huang | Claude |
| **Jian** | VP Engineering | Andy Grove | Qwen (frontier MoE) |
| **Priya** | Product Lead | Steve Jobs | Claude |
| **Fang** | VP Manufacturing | Taiichi Ohno | Qwen |
| **Chase** | VP Supply Chain | Tim Cook | Qwen |
| **Cal** | Chief of Staff | Sheryl Sandberg | MiniMax (high-volume) |
| **Finn** | Finance Lead | Charlie Munger | Claude |
| **Fiona** | Fundraising Advisor | Ben Horowitz | MiniMax |
| **Harper** | People/HR | Patty McCord | MiniMax |
| **Leo** | Legal Counsel | David Boies | Claude |
| **Mia** | Growth Marketer | Seth Godin | MiniMax |
| **Sal** | Sales Lead | Marc Benioff | MiniMax |

**How a specialist conversation works:**

```
User sends a "brief" to a specialist (e.g., asks Finn about cash runway)
    ↓
System compiles personality prompt:
  - Archetype behavior, backstory, voice patterns, writing style
  - Strong opinions they'll defend
  - Relationship dynamics with other specialists
    ↓
Adds context layers:
  - Company context (from foundry profile: industry, stage, purpose)
  - Conversation history (multi-turn memory threads)
  - Cross-specialist context (what other specialists know)
  - Domain knowledge
    ↓
Selects AI provider based on model tier with failover:
  - Claude tier: Anthropic → OpenAI → Google
  - Qwen tier: Qwen → MiniMax → OpenAI
  - MiniMax tier: MiniMax → Qwen → OpenAI
    ↓
Streams response to UI (text chunks + optional thinking output)
    ↓
Post-response: captures decision journals + follow-up suggestions
```

**Speculative Dual-Stream** (some specialists): A fast model (GPT-4o mini) responds instantly while a deep model (Claude Opus) works in parallel. The UI shows the fast response while waiting for the deeper one.

**Access points:**
- **Advisor Panel** — right-side slide panel on every page
- **Floating FAB** — mobile floating action button
- **Command Palette** (Cmd+K) — quick specialist access
- **Dedicated /agents page** — full specialist roster + workflow builder
- **Telegram Bot** — specialist access via Telegram

**Prompt Library:** 18 curated prompt categories per specialist with templates, suggested inputs, and chain recommendations ("after this, talk to X specialist next").

---

## 3. The Forge (CAD Lab / Manufacturing Workspace)

The Forge is the manufacturing-specific workspace at `/the-forge/cad-lab/`.

**Stages:**
1. **Concept** — User describes a product idea → system runs background research → generates system overview illustration → decomposes into modules → progressively reveals blueprint images
2. **Build** (`/cad-lab/build`) — 3D model generation via CadQuery on Modal.com. Anthropic Claude generates the CadQuery Python code, Modal executes it, Three.js renders the result
3. **Analysis** (`/cad-lab/analysis`) — FEA/stress analysis tools, quality scorecards, validation rules, risk registers
4. **Review** (`/cad-lab/review`) — Peer review interface with specialist review panels
5. **Procurement** (`/cad-lab/procurement`) — Auto-generates RFQs from CAD models, broadcasts to suppliers
6. **Mashup** (`/cad-lab/mashup`) — Component combination tool
7. **Templates** (`/cad-lab/templates`) — Reusable design templates

**Where the data comes from:**
- **3D geometry**: CadQuery code generated by Claude → executed on Modal.com → STL returned
- **Blueprint images**: Google Gemini generates visual blueprints
- **Component data**: Internal `component_catalogue`, `component_compatibility`, `component_pricing` tables
- **Reference models**: `reference_models` table for template matching
- **Manufacturing knowledge**: `manufacturing_techniques` library in `src/lib/`
- **Cost estimates**: `cad-lab-cost-constants.ts` + AI analysis
- **Supplier matching**: Cross-referenced with marketplace listings

---

## 4. Marketplace

A B2B marketplace for services, products, people, and AI tools.

**Categories:** People, Products, Services, AI, Finance

**How matching works:**
- **Forge Match** (`/api/marketplace/forge-match`) — GPT-4o matches member skills against marketplace listings, returns compatibility scores + reasoning
- **Talent Match** (`/api/marketplace/talent-match`) — Scores People listings against a natural language query
- **AI Search** (`/api/marketplace/ai-search`) — Natural language search with relevance scoring
- **Compare** (`/api/marketplace/compare`) — Side-by-side comparison of multiple listings

**Commerce flow:**
```
Buyer browses/searches marketplace
    ↓
RFQ created (Request for Quote) → broadcast to suppliers
    ↓
Suppliers respond with quotes (rfq_responses table)
    ↓
Buyer awards RFQ → Order created
    ↓
Stripe payment → funds held in escrow (escrow_transactions)
    ↓
Delivery milestones tracked (order_milestones)
    ↓
Completion → escrow released to provider via Stripe Connect
    ↓
If dispute → escalation workflow (open → review → mediation → arbitration → resolved)
```

**Provider tools:** Portfolio management, certification badges, ratings/reviews, discovery call booking, retainer agreements.

---

## 5. Work Management

**Tasks:**
- Full CRUD with multi-status workflow: Pending → Accepted → In Progress → Peer Review → Executive Approval → Completed
- Multi-assignee support, dependencies, file attachments
- Google Calendar sync (bidirectional)
- Audit trail via `task_history` table
- Views: Focus, Board (Kanban), List, Timeline (Gantt)

**Objectives (OKRs):**
- Hierarchical (parent/child objectives)
- Linked to tasks
- Playbook templates (`objective_packs`) for quick setup
- Progress tracking with team pulse metrics

**Strategic Planning:**
- Visual canvas with DAG (directed acyclic graph) dependencies
- Gantt-style timeline view
- Strategy dashboard

---

## 6. Communication

**Messaging:**
- Direct messages, task-scoped threads, objective-scoped threads
- File attachments (Supabase Storage, signed URLs)
- Emoji reactions, message starring, templates
- Real-time streaming

**Telegram Bot:**
- Specialist conversations via Telegram
- Idea capture, decision logging
- Notification dispatch

**Email:**
- Resend for transactional email (reports, notifications, invites)
- Inbound email processing via webhook

---

## 7. Finance & Payments

**Stripe Integration:**
- Payment intents for orders
- Escrow system (hold → partial release → full release → refund)
- Stripe Connect for provider payouts
- Webhook processing for async payment events

**Financial Tools:**
- Project-level budgeting
- Expense tracking
- Revenue/cost visualization (Money Map)
- Financial forecasting
- Funding round tracking
- Invoice management
- Platform fee configuration

---

## 8. Intelligence & Analytics

**Background Sweeps (Cron Jobs):**
- Morning briefs, daily pulse, health analysis, opportunity detection
- Specialists analyze foundry data overnight → generate briefings for executives
- HITL (Human-in-the-Loop) review gates before execution

**Analytics:**
- Activity event tracking (every user action)
- Platform metrics (daily/monthly aggregates)
- Provider/buyer/category stats
- Search analytics
- Profile view tracking

**X-Ray:**
- Product analysis feature using Gemini/Claude APIs
- Scans and analyzes product data

---

## 9. External Integrations

| Integration | What It Does | How |
|------------|-------------|-----|
| **Google Calendar** | Syncs tasks ↔ calendar events, availability checking | OAuth 2.0, webhooks for push notifications |
| **Google Drive** | File picker, document access | OAuth 2.0 |
| **Google Sheets** | Two-way data sync | OAuth 2.0 |
| **Stripe** | Payments, escrow, provider payouts | API key + webhooks |
| **Telegram** | Bot commands, specialist access, notifications | Bot token + webhooks |
| **Resend** | Email delivery | API key + inbound webhooks |
| **Modal.com** | CadQuery 3D code execution | HTTP endpoint |
| **Thingiverse** | CAD model search/discovery | Public API |

---

## 10. Key Data Flow Patterns

**Server Action Pattern (primary):**
```
UI Component → Server Action ('use server') → Supabase query (with foundry_id) → RLS check → Data returned → revalidatePath() → UI re-renders
```

**AI Execution Pattern:**
```
User brief → Context compilation (personality + company + history + domain) → Provider selection with failover → Streaming response → Decision journal capture → Memory storage
```

**Webhook Pattern:**
```
External event (Stripe/Google/Telegram) → API route handler → Signature verification → Database update → Notification dispatch → revalidatePath()
```

---

## 11. Security Architecture

1. **Auth**: JWT in HTTP-only cookies, SameSite=Lax
2. **Authorization**: Role-based (Executive/Founder/Apprentice/AI_Agent)
3. **Multi-tenancy**: `foundry_id` isolation at app + RLS level
4. **Rate Limiting**: Per-user, per-IP on all AI endpoints (5-10 req/min)
5. **Input Validation**: Zod schemas on all server actions
6. **CSP Headers**: Strict Content-Security-Policy, HSTS, X-Frame-Options
7. **AI Cost Caps**: Per-user + per-foundry usage tracking and spending limits
8. **Audit Trail**: Activity events, admin audit log, security audit log, task history

---

## 12. Database Scale

- **120+ core tables** covering auth, work management, marketplace, CAD, agents, payments, analytics, knowledge, communication
- **20+ enums** for type safety
- **100+ migrations** tracking schema evolution
- **Key tables**: profiles, foundries, tasks, objectives, marketplace_listings, orders, cad_lab_projects, agent_memory_threads, messages, conversations

---

## The One-Paragraph Answer

> ForgeOS is a Next.js/Supabase platform where hardware startup founders get an AI-powered C-suite. 13 AI specialists — each with a distinct personality, expertise area, and real-world executive archetype — provide on-demand strategic, technical, financial, and operational guidance via streaming chat. The Forge workspace lets founders go from product concept to 3D CAD model to manufacturer RFQ using Claude for code generation and Modal.com for execution. A built-in B2B marketplace connects founders with vetted service providers, with Stripe-powered escrow protecting both sides. Everything runs in isolated "Foundries" (workspaces), with Google Calendar sync, Telegram bot access, background intelligence sweeps, and a full work management system (tasks, OKRs, Gantt charts) tying it all together.
