/**
 * @file Dossier pipeline shared types + status model (§6 Phase-1 MVP)
 *
 * @description The concierge brief-intake state machine:
 * submitted → validated → in_progress → in_review → ready → delivered,
 * with side states needs_info / on_hold / declined. The customer sees a
 * simplified 5-step tracker; the /studio board sees every state.
 */

export const DOSSIER_STATUSES = [
  'submitted',
  'validated',
  'in_progress',
  'in_review',
  'ready',
  'delivered',
  'needs_info',
  'on_hold',
  'declined',
] as const

export type DossierStatus = (typeof DOSSIER_STATUSES)[number]

/** The main-line pipeline, in order (side states excluded). */
export const PIPELINE_ORDER: DossierStatus[] = [
  'submitted',
  'validated',
  'in_progress',
  'in_review',
  'ready',
  'delivered',
]

/** Customer-facing 5-step tracker labels (ready + delivered share step 5). */
export const CUSTOMER_STEPS: { key: DossierStatus; label: string }[] = [
  { key: 'submitted', label: 'Received' },
  { key: 'validated', label: 'Validated' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'in_review', label: 'In engineering review' },
  { key: 'ready', label: 'Ready' },
]

/** Full labels for the /studio board. */
export const STATUS_LABELS: Record<DossierStatus, string> = {
  submitted: 'Received',
  validated: 'Validated',
  in_progress: 'In progress',
  in_review: 'In engineering review',
  ready: 'Ready',
  delivered: 'Delivered',
  needs_info: 'Needs info',
  on_hold: 'On hold',
  declined: 'Declined',
}

/** How far along the customer tracker a status sits (0-based; -1 = side state). */
export function customerStepIndex(status: DossierStatus): number {
  if (status === 'delivered') return CUSTOMER_STEPS.length - 1
  return CUSTOMER_STEPS.findIndex((s) => s.key === status)
}

export interface DossierProject {
  id: string
  created_at: string
  customer_name: string
  customer_email: string
  company: string | null
  sector: string | null
  brief_text: string
  status: DossierStatus
  status_updated_at: string
  nda_requested: boolean
  nda_status: 'requested' | 'sent' | 'signed' | null
  access_token: string
  assigned_to: string | null
  internal_notes: string | null
}

export interface DossierProjectEvent {
  id: string
  project_id: string
  from_status: DossierStatus | null
  to_status: DossierStatus
  note: string | null
  actor: string
  created_at: string
}

export interface DossierProjectFile {
  id: string
  project_id: string
  kind: 'brief_attachment' | 'dossier' | 'other'
  storage_path: string
  original_name: string | null
  uploaded_by: string
  created_at: string
}

/** Inbound briefs bucket (private). */
export const BRIEFS_BUCKET = 'briefs'
/** Outbound customer dossiers bucket (private — NOT the public marketing 'dossiers' bucket). */
export const PROJECT_DOSSIERS_BUCKET = 'project-dossiers'
