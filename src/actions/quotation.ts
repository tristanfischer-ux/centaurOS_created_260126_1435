'use server'

/**
 * Quotation upload (studio) and customer save (token).
 *
 * Kind is 'other' — the files table check constraint does not yet name
 * quotation. original_name is the discriminator (quotation-source.json).
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin/access'
import {
  PROJECT_DOSSIERS_BUCKET,
  type DossierProject,
} from '@/lib/dossier-pipeline/types'

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

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file'
}

async function putOther(
  project: DossierProject,
  file: File,
  actor: string,
  originalName: string,
): Promise<void> {
  const admin = createAdminClient()
  const storagePath = `${project.id}/${Date.now()}-${safeFileName(originalName)}`
  const { error: uploadError } = await admin.storage
    .from(PROJECT_DOSSIERS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (uploadError) throw new Error('Upload failed — try again')
  const { error: fileErr } = await admin.from('dossier_project_files').insert({
    project_id: project.id,
    kind: 'other',
    storage_path: storagePath,
    original_name: originalName,
    uploaded_by: actor,
  })
  if (fileErr) {
    await admin.storage.from(PROJECT_DOSSIERS_BUCKET).remove([storagePath])
    throw new Error('Stored the file but could not record it — please retry.')
  }
}

export async function uploadQuotation(formData: FormData): Promise<void> {
  const { email: actor } = await requireStudioAdmin()
  const projectId = String(formData.get('projectId') ?? '')
  const file = formData.get('quotation')
  if (!projectId || !(file instanceof File) || file.size === 0) {
    throw new Error('Choose a quotation-source.json or Quotation.docx')
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Quotation file over 20 MB')
  }
  const admin = createAdminClient()
  const { data: project } = await admin
    .from('dossier_projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) throw new Error('Project not found')
  const p = project as DossierProject
  const lower = file.name.toLowerCase()
  const original = lower.endsWith('.docx') ? file.name : 'quotation-source.json'
  if (!lower.endsWith('.json') && !lower.endsWith('.docx')) {
    throw new Error('Upload quotation-source.json or Quotation.docx')
  }
  if (lower.endsWith('.json')) {
    const text = await file.text()
    JSON.parse(text)
    const wrapped = new File([text], 'quotation-source.json', { type: 'application/json' })
    await putOther(p, wrapped, actor, 'quotation-source.json')
  } else {
    await putOther(p, file, actor, original)
  }
  revalidatePath(`/studio/${p.id}`)
  revalidatePath(`/project/${p.access_token}`)
}

export async function saveCustomerQuote(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  const raw = String(formData.get('source') ?? '')
  if (!token || token.length < 32 || !raw) throw new Error('Missing quote')
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('Quote JSON was not valid')
  }
  if (parsed.schema !== 'anvil-quotation-source/v1') {
    throw new Error('Not an Anvil quotation source')
  }
  const admin = createAdminClient()
  const { data: project } = await admin
    .from('dossier_projects')
    .select('*')
    .eq('access_token', token)
    .maybeSingle()
  if (!project) throw new Error('Project not found')
  const p = project as DossierProject
  if (!['ready', 'delivered', 'in_review'].includes(p.status)) {
    throw new Error('The quotation is not open for edits yet')
  }
  const quote = (parsed.quote && typeof parsed.quote === 'object' ? parsed.quote : {}) as Record<
    string,
    unknown
  >
  const rev = String(quote.revision || 'A')
  const next = rev === 'A' ? 'B' : rev === 'B' ? 'C' : `${rev}+`
  quote.revision = next
  parsed.quote = quote
  parsed.edited_on = new Date().toISOString()
  parsed.edited_by = 'customer'
  const body = JSON.stringify(parsed, null, 2)
  const file = new File([body], 'quotation-source.json', { type: 'application/json' })
  await putOther(p, file, `customer:${p.customer_email}`, 'quotation-source.json')
  revalidatePath(`/project/${p.access_token}`)
  revalidatePath(`/studio/${p.id}`)
}
