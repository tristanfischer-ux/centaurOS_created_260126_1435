"use server"

/**
 * @file Dossier pipeline server actions (§6 Phase-1 MVP)
 *
 * @description The concierge workflow as code: a founder submits a brief →
 * a dossier_projects row (status 'submitted') + Tristan notified + the
 * customer emailed a private /project/[token] link. Tristan works the project
 * from /studio: validate, download the brief, run Anvil locally, upload the
 * finished Dossier (→ 'ready', customer emailed a download link).
 *
 * @security All tables are RLS-deny-all; this file uses the service-role
 * client with access control in code. Admin actions call requireStudioAdmin()
 * (Supabase Auth + platform-admin check). The public submit action is
 * rate-limited per IP. Buckets are private; downloads are signed URLs only.
 */

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin/access'
import {
  BRIEFS_BUCKET,
  PROJECT_DOSSIERS_BUCKET,
  DOSSIER_STATUSES,
  type DossierStatus,
  type DossierProject,
} from '@/lib/dossier-pipeline/types'

const FROM = 'Fractional Forge <tristan@fractionalforge.app>'
const NOTIFY_TO = 'hello@fractionalforge.app'
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024 // 15 MB
const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/png',
  'image/jpeg',
  'application/zip',
]

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'
}

function sendEmail(opts: { to: string; subject: string; text: string; replyTo?: string }): void {
  // Fire-and-forget with logging: the DB is the source of truth, email
  // failure must never fail the action.
  if (!process.env.RESEND_API_KEY) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  resend.emails
    .send({ from: FROM, to: opts.to, subject: opts.subject, text: opts.text, replyTo: opts.replyTo })
    .catch((err) => console.error('[DossierPipeline] email send failed:', err))
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'attachment'
}

// ---------------------------------------------------------------------------
// PUBLIC: brief submission
// ---------------------------------------------------------------------------

export async function submitDossierBrief(formData: FormData): Promise<{
  success?: true
  token?: string
  error?: string
}> {
  const idea = String(formData.get('idea') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const sector = String(formData.get('sector') ?? '').trim()
  const company = String(formData.get('company') ?? '').trim()
  const ndaRequested = formData.get('nda') === 'on' || formData.get('nda') === 'true'
  const attachment = formData.get('attachment')

  if (!idea || !name || !email) {
    return { error: 'Please add your idea, name and email.' }
  }
  if (idea.length > 8000) {
    return { error: 'That brief is a little long — keep it to a paragraph or a page.' }
  }

  // SECURITY: rate limit per IP (shares the contactForm bucket)
  const headersList = await headers()
  const ip = getClientIP(headersList)
  const { success: rateLimitOk } = await rateLimit('contactForm', ip, { limit: 5, window: 300000 })
  if (!rateLimitOk) {
    return { error: 'Too many submissions just now — please try again in a few minutes.' }
  }

  const admin = createAdminClient()

  const { data: project, error: insertError } = await admin
    .from('dossier_projects')
    .insert({
      customer_name: name,
      customer_email: email,
      company: company || null,
      sector: sector || null,
      brief_text: idea,
      nda_requested: ndaRequested,
    })
    .select('*')
    .single()

  if (insertError || !project) {
    console.error('[DossierPipeline] project insert failed:', insertError)
    return { error: 'Something went wrong saving your brief. Please try again, or email hello@fractionalforge.app.' }
  }

  const p = project as DossierProject

  await admin.from('dossier_project_events').insert({
    project_id: p.id,
    from_status: null,
    to_status: 'submitted',
    actor: 'customer',
    note: ndaRequested ? 'Brief submitted (NDA requested).' : 'Brief submitted.',
  })

  // Optional attachment → private briefs bucket
  let attachmentNote = ''
  if (attachment instanceof File && attachment.size > 0) {
    if (attachment.size > MAX_ATTACHMENT_BYTES) {
      attachmentNote = '\n(Attachment was over 15 MB and was not stored.)'
    } else if (!ALLOWED_ATTACHMENT_TYPES.includes(attachment.type)) {
      attachmentNote = `\n(Attachment type ${attachment.type || 'unknown'} not accepted; not stored.)`
    } else {
      const path = `${p.id}/${Date.now()}-${safeFileName(attachment.name)}`
      const { error: uploadError } = await admin.storage
        .from(BRIEFS_BUCKET)
        .upload(path, attachment, { contentType: attachment.type })
      if (uploadError) {
        console.error('[DossierPipeline] attachment upload failed:', uploadError)
        attachmentNote = '\n(Attachment upload failed — brief text is saved.)'
      } else {
        await admin.from('dossier_project_files').insert({
          project_id: p.id,
          kind: 'brief_attachment',
          storage_path: path,
          original_name: attachment.name,
          uploaded_by: 'customer',
        })
        attachmentNote = `\nAttachment: ${attachment.name}`
      }
    }
  }

  const statusUrl = `${appUrl()}/project/${p.access_token}`

  // Notify Tristan
  sendEmail({
    to: NOTIFY_TO,
    replyTo: email,
    subject: `[Brief] ${name}${company ? ' · ' + company : ''}${sector ? ' · ' + sector : ''}${ndaRequested ? ' · NDA requested' : ''}`,
    text:
      `New Design Dossier brief\n\n` +
      `Name: ${name}\nEmail: ${email}\nCompany / role: ${company || '—'}\nSector: ${sector || '—'}\n` +
      `NDA requested: ${ndaRequested ? 'YES' : 'no'}${attachmentNote}\n\n` +
      `Studio: ${appUrl()}/studio/${p.id}\n\n` +
      `Idea / brief:\n${idea}\n`,
  })

  // Confirm to the customer with their private tracking link
  sendEmail({
    to: email,
    subject: 'Your Design Dossier brief is in — track its progress',
    text:
      `Hi ${name.split(' ')[0] || 'there'},\n\n` +
      `Thanks — your brief is in. Anvil will build your Design Dossier, senior engineers ` +
      `from our partner network will review it, and I'll deliver it within a few business days.\n\n` +
      `Track its progress (private link, don't share it):\n${statusUrl}\n\n` +
      `Your brief is confidential: never used to train any model, and never shared with a ` +
      `manufacturing or investor partner without your explicit consent.` +
      `${ndaRequested ? ' You asked about an NDA — I\'ll come back to you on that first.' : ''}\n\n` +
      `— Tristan Fischer, Founder, Fractional Forge\n`,
  })

  return { success: true, token: p.access_token }
}

// ---------------------------------------------------------------------------
// ADMIN (/studio): guarded actions
// ---------------------------------------------------------------------------

async function requireStudioAdmin(): Promise<{ email: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const ok = await isAdmin(user.id)
  if (!ok) throw new Error('Admin access required')
  return { email: user.email ?? 'admin' }
}

const VALID_TRANSITION_TARGETS: DossierStatus[] = [...DOSSIER_STATUSES]

export async function setProjectStatus(formData: FormData): Promise<void> {
  const { email: actor } = await requireStudioAdmin()
  const projectId = String(formData.get('projectId') ?? '')
  const to = String(formData.get('to') ?? '') as DossierStatus
  const note = String(formData.get('note') ?? '').trim()

  if (!projectId || !VALID_TRANSITION_TARGETS.includes(to)) {
    throw new Error('Invalid transition')
  }

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('dossier_projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) throw new Error('Project not found')
  const p = project as DossierProject

  await admin
    .from('dossier_projects')
    .update({ status: to, status_updated_at: new Date().toISOString() })
    .eq('id', projectId)

  await admin.from('dossier_project_events').insert({
    project_id: projectId,
    from_status: p.status,
    to_status: to,
    actor,
    note: note || null,
  })

  // Customer notifications on every meaningful transition (§6.8 Phase 2).
  const first = p.customer_name.split(' ')[0] || 'there'
  const statusUrl = `${appUrl()}/project/${p.access_token}`
  const signoff = `\n— Tristan Fischer, Founder, Fractional Forge\n`
  const CUSTOMER_EMAILS: Partial<Record<DossierStatus, { subject: string; text: string }>> = {
    validated: {
      subject: 'Your brief is validated — Anvil is up next',
      text:
        `Hi ${first},\n\n` +
        `I've read your brief and it's good to run. Anvil builds the first pass next, ` +
        `then senior engineers from our partner network review it before you see it.\n\n` +
        `Track progress: ${statusUrl}\n` +
        signoff,
    },
    in_review: {
      subject: 'Your Design Dossier is in engineering review',
      text:
        `Hi ${first},\n\n` +
        `Anvil has finished the first pass on your Design Dossier and it's now with ` +
        `senior engineers from our partner network for review. You'll get the download ` +
        `link as soon as it's signed off.\n\n` +
        `Track progress: ${statusUrl}\n` +
        signoff,
    },
    needs_info: {
      subject: 'One thing before your Dossier can run',
      text:
        `Hi ${first},\n\n` +
        `Your brief is in, but I need a detail or two before Anvil can do it justice` +
        `${note ? `:\n\n${note}` : '.'}\n\n` +
        `Just reply to this email with the answer and I'll get it moving.\n\n` +
        `Your project page: ${statusUrl}\n` +
        signoff,
    },
    on_hold: {
      subject: 'Your Dossier project is paused',
      text:
        `Hi ${first},\n\n` +
        `I've paused your project for now` +
        `${note ? ` — ${note}` : ''}. Reply to this email whenever you want to pick it back up.\n\n` +
        `Your project page: ${statusUrl}\n` +
        signoff,
    },
    declined: {
      subject: 'Your brief — not one we can take forward',
      text:
        `Hi ${first},\n\n` +
        `Thank you for sending your brief. I'm sorry — it's not one we can take forward` +
        `${note ? `: ${note}` : ' (usually a question of scope, not quality)'}.\n\n` +
        `If the shape of the project changes, you're welcome to submit again.\n` +
        signoff,
    },
    ready: {
      subject: 'Your Design Dossier is ready',
      text:
        `Hi ${first},\n\n` +
        `Your Design Dossier is ready — reviewed and signed off. Download it from your ` +
        `private project page:\n${statusUrl}\n\n` +
        `Open it in Excel and change an assumption — every number recomputes. ` +
        `If you'd like to walk through it together: https://calendly.com/tristan-fischer-wjlf/30min\n` +
        signoff,
    },
  }
  const mail = CUSTOMER_EMAILS[to]
  if (mail) sendEmail({ to: p.customer_email, subject: mail.subject, text: mail.text })

  revalidatePath('/studio')
  revalidatePath(`/studio/${projectId}`)
  revalidatePath(`/project/${p.access_token}`)
}

export async function uploadDossier(formData: FormData): Promise<void> {
  const { email: actor } = await requireStudioAdmin()
  const projectId = String(formData.get('projectId') ?? '')
  const file = formData.get('dossier')
  if (!projectId || !(file instanceof File) || file.size === 0) {
    throw new Error('Choose a Dossier file to upload')
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('Dossier file over 50 MB — the server-action body limit is 64mb')
  }

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('dossier_projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) throw new Error('Project not found')
  const p = project as DossierProject

  const path = `${p.id}/${Date.now()}-${safeFileName(file.name)}`
  const { error: uploadError } = await admin.storage
    .from(PROJECT_DOSSIERS_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
    })
  if (uploadError) {
    console.error('[DossierPipeline] dossier upload failed:', uploadError)
    throw new Error('Upload failed — try again')
  }

  await admin.from('dossier_project_files').insert({
    project_id: p.id,
    kind: 'dossier',
    storage_path: path,
    original_name: file.name,
    uploaded_by: actor,
  })

  // Auto-advance to ready (§6.5) — reuse the transition path so the event
  // trail and the customer email happen in exactly one place.
  const advance = new FormData()
  advance.set('projectId', p.id)
  advance.set('to', 'ready')
  advance.set('note', `Dossier uploaded: ${file.name}`)
  await setProjectStatus(advance)
}

const NDA_STATUSES = ['requested', 'sent', 'signed'] as const
type NdaStatus = (typeof NDA_STATUSES)[number]

export async function setNdaStatus(formData: FormData): Promise<void> {
  const { email: actor } = await requireStudioAdmin()
  const projectId = String(formData.get('projectId') ?? '')
  const nda = String(formData.get('nda') ?? '') as NdaStatus
  if (!projectId || !NDA_STATUSES.includes(nda)) throw new Error('Invalid NDA status')

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('dossier_projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) throw new Error('Project not found')
  const p = project as DossierProject

  await admin
    .from('dossier_projects')
    .update({ nda_status: nda, nda_requested: true })
    .eq('id', projectId)

  await admin.from('dossier_project_events').insert({
    project_id: projectId,
    from_status: p.status,
    to_status: p.status,
    actor,
    note: `NDA ${nda}`,
  })

  if (nda === 'sent') {
    sendEmail({
      to: p.customer_email,
      subject: 'Your NDA is on its way',
      text:
        `Hi ${p.customer_name.split(' ')[0] || 'there'},\n\n` +
        `As requested, I've sent the NDA to this address (check for a separate email with ` +
        `the document). Nothing moves on your brief beyond intake until it's in place.\n\n` +
        `Your project page: ${appUrl()}/project/${p.access_token}\n\n` +
        `— Tristan Fischer, Founder, Fractional Forge\n`,
    })
  }

  revalidatePath(`/studio/${projectId}`)
  revalidatePath('/studio')
}

export async function saveInternalNotes(formData: FormData): Promise<void> {
  await requireStudioAdmin()
  const projectId = String(formData.get('projectId') ?? '')
  const notes = String(formData.get('notes') ?? '')
  if (!projectId) throw new Error('Missing project')
  const admin = createAdminClient()
  await admin.from('dossier_projects').update({ internal_notes: notes || null }).eq('id', projectId)
  revalidatePath(`/studio/${projectId}`)
}
