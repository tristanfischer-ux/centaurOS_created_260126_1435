/**
 * @file Dossier pipeline server-side queries (service-role reads).
 *
 * @description All pipeline tables are RLS-deny-all; every read goes through
 * the admin client here, with access control in code: the customer path is
 * keyed by the unguessable access_token, the studio path is behind the
 * platform-admin gate in the /studio layout.
 *
 * @security Never import from client components. Signed URLs are short-lived.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin/access'
import {
  BRIEFS_BUCKET,
  PROJECT_DOSSIERS_BUCKET,
  type DossierProject,
  type DossierProjectEvent,
  type DossierProjectFile,
} from './types'

/**
 * SECURITY (council #1, 2026-08-15): the /studio admin gate must live NEXT TO
 * THE DATA, not only in the layout — a Next.js App Router layout is not an
 * authorization boundary (page and layout segments render independently, so a
 * crafted RSC request can obtain the page payload without the layout check).
 * Every studio-only read below calls this first. Throws if not an admin.
 * The token-keyed customer read (getProjectByToken) is deliberately NOT gated
 * — the unguessable token IS its credential.
 */
async function assertStudioAdmin(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (!(await isAdmin(user.id))) throw new Error('Admin access required')
}

export interface ProjectView {
  project: DossierProject
  events: DossierProjectEvent[]
  files: DossierProjectFile[]
  /** Present only when status is ready/delivered and a dossier file exists. */
  dossierDownloadUrl: string | null
}

/** Customer status page: look a project up by its unguessable token. */
export async function getProjectByToken(token: string): Promise<ProjectView | null> {
  if (!token || token.length < 32 || token.length > 128) return null
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('dossier_projects')
    .select('*')
    .eq('access_token', token)
    .maybeSingle()
  if (!project) return null

  return buildView(project as DossierProject)
}

/** Studio detail: look a project up by id. Admin-gated at the data layer. */
export async function getProjectById(id: string): Promise<ProjectView | null> {
  await assertStudioAdmin()
  const admin = createAdminClient()
  const { data: project } = await admin
    .from('dossier_projects')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!project) return null
  return buildView(project as DossierProject)
}

/** Studio board: all projects, newest first. Admin-gated at the data layer. */
export async function listProjects(): Promise<DossierProject[]> {
  await assertStudioAdmin()
  const admin = createAdminClient()
  const { data } = await admin
    .from('dossier_projects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  return (data ?? []) as DossierProject[]
}

async function buildView(project: DossierProject): Promise<ProjectView> {
  const admin = createAdminClient()

  const [{ data: events }, { data: files }] = await Promise.all([
    admin
      .from('dossier_project_events')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true }),
    admin
      .from('dossier_project_files')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true }),
  ])

  let dossierDownloadUrl: string | null = null
  if (project.status === 'ready' || project.status === 'delivered') {
    const dossier = (files ?? []).filter((f) => f.kind === 'dossier').at(-1)
    if (dossier) {
      const { data: signed } = await admin.storage
        .from(PROJECT_DOSSIERS_BUCKET)
        .createSignedUrl(dossier.storage_path, 60 * 60, {
          download: dossier.original_name ?? 'design-dossier.xlsx',
        })
      dossierDownloadUrl = signed?.signedUrl ?? null
    }
  }

  return {
    project,
    events: (events ?? []) as DossierProjectEvent[],
    files: (files ?? []) as DossierProjectFile[],
    dossierDownloadUrl,
  }
}

/** Studio: short-lived signed URL for an inbound brief attachment. Admin-gated. */
export async function signedBriefUrl(file: DossierProjectFile): Promise<string | null> {
  await assertStudioAdmin()
  const admin = createAdminClient()
  const { data } = await admin.storage
    .from(BRIEFS_BUCKET)
    .createSignedUrl(file.storage_path, 60 * 10, {
      download: file.original_name ?? 'brief-attachment',
    })
  return data?.signedUrl ?? null
}
