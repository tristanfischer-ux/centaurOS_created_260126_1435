/**
 * @file outreach.ts
 *
 * @description Application-level types for the cold outreach pipeline.
 * Derived from the database schema (outreach_campaigns, outreach_contacts,
 * outreach_emails, outreach_knowledge_base) with status-to-badge mapping
 * constants for consistent UI rendering.
 *
 * @related
 * - DB schema: supabase/migrations/20260207100000_outreach_pipeline.sql
 * - Server actions: src/actions/outreach.ts
 * - Campaign list: src/app/(platform)/outreach/outreach-hub.tsx
 */

import type { StatusBadgeProps } from "@/components/ui/status-badge"

// ─── Campaign ────────────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "archived"

export interface Campaign {
    id: string
    foundry_id: string
    created_by: string | null
    name: string
    status: string
    product_context: string | null
    icp_description: string | null
    value_props: string[]
    case_studies: string[]
    tone: string
    sequence_length: number
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
    /** Computed: total contacts in this campaign */
    contact_count?: number
    /** Computed: contacts with status "sequenced" or later */
    sequenced_count?: number
}

export type CampaignTone = "professional" | "casual" | "executive" | "technical"

// ─── Contact ─────────────────────────────────────────────────────────────────

export type ContactStatus =
    | "new"
    | "researched"
    | "scored"
    | "approved"
    | "sequenced"
    | "contacted"
    | "replied"
    | "bounced"
    | "opted_out"

export interface Contact {
    id: string
    foundry_id: string
    campaign_id: string | null
    created_by: string | null
    first_name: string
    last_name: string
    email: string | null
    linkedin_url: string | null
    job_title: string | null
    company_name: string
    company_domain: string | null
    industry: string | null
    company_size: string | null
    funding_stage: string | null
    tech_stack: string[]
    signals: string[]
    research_brief: string | null
    pain_points: string[]
    score: number | null
    score_reasoning: string | null
    recommended_angle: string | null
    status: string
    created_at: string
    updated_at: string
}

// ─── Email ───────────────────────────────────────────────────────────────────

export type EmailStatus =
    | "draft"
    | "approved"
    | "scheduled"
    | "sent"
    | "opened"
    | "replied"
    | "bounced"
    | "opted_out"

export type EmailChannel = "email" | "linkedin" | "phone"

export interface OutreachEmail {
    id: string
    foundry_id: string
    contact_id: string
    campaign_id: string
    created_by: string | null
    sequence_position: number
    sequence_label: string | null
    subject: string
    subject_variants: string[]
    body: string
    send_delay_days: number
    channel: string
    personalization_data: Record<string, unknown>
    qa_report: Record<string, unknown> | null
    qa_passed: boolean | null
    status: string
    scheduled_at: string | null
    sent_at: string | null
    opened_at: string | null
    replied_at: string | null
    created_at: string
    updated_at: string
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────

export type KBContentType = "text" | "url" | "pdf_extract"
export type KBCategory = "product" | "case_study" | "value_prop" | "competitor_intel" | "icp_definition"

export interface OutreachKBEntry {
    id: string
    foundry_id: string
    created_by: string | null
    title: string
    content: string
    content_type: string
    category: string
    tags: string[]
    created_at: string
    updated_at: string
}

// ─── Grouped emails (for display) ────────────────────────────────────────────

export interface ContactWithEmails {
    contact: Contact
    emails: OutreachEmail[]
}

// ─── Status-to-badge mapping constants ───────────────────────────────────────

export const CAMPAIGN_STATUS_MAP: Record<string, { label: string; variant: StatusBadgeProps["status"] }> = {
    draft: { label: "Draft", variant: "pending" },
    active: { label: "Active", variant: "active" },
    paused: { label: "Paused", variant: "warning" },
    completed: { label: "Completed", variant: "success" },
    archived: { label: "Archived", variant: "pending" },
}

export const CONTACT_STATUS_MAP: Record<string, { label: string; variant: StatusBadgeProps["status"] }> = {
    new: { label: "New", variant: "pending" },
    researched: { label: "Researched", variant: "info" },
    scored: { label: "Scored", variant: "info" },
    approved: { label: "Approved", variant: "active" },
    sequenced: { label: "Sequenced", variant: "active" },
    contacted: { label: "Contacted", variant: "warning" },
    replied: { label: "Replied", variant: "success" },
    bounced: { label: "Bounced", variant: "error" },
    opted_out: { label: "Opted Out", variant: "error" },
}

export const EMAIL_STATUS_MAP: Record<string, { label: string; variant: StatusBadgeProps["status"] }> = {
    draft: { label: "Draft", variant: "pending" },
    approved: { label: "Approved", variant: "active" },
    scheduled: { label: "Scheduled", variant: "info" },
    sent: { label: "Sent", variant: "warning" },
    opened: { label: "Opened", variant: "info" },
    replied: { label: "Replied", variant: "success" },
    bounced: { label: "Bounced", variant: "error" },
    opted_out: { label: "Opted Out", variant: "error" },
}

export const TONE_OPTIONS: { value: CampaignTone; label: string; description: string }[] = [
    { value: "professional", label: "Professional", description: "Clear, authoritative, business-appropriate" },
    { value: "casual", label: "Casual", description: "Warm, conversational, approachable" },
    { value: "executive", label: "Executive", description: "Concise, high-level, outcome-focused" },
    { value: "technical", label: "Technical", description: "Detailed, specific, peer-to-peer" },
]

/** Sequence position labels */
export const SEQUENCE_LABELS: Record<number, string> = {
    1: "Opener",
    2: "Value-Add",
    3: "Case Study",
    4: "Breakup",
    5: "Re-engage",
}
