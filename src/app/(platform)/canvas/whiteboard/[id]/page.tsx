import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { WhiteboardEditor } from '../whiteboard-editor'
import type { WhiteboardRow } from '@/actions/whiteboards'

export const dynamic = 'force-dynamic'

/**
 * @description Whiteboard editor page. Loads a specific whiteboard
 * and renders the Excalidraw canvas for freeform brainstorming.
 *
 * @security Verifies user auth and foundry membership before rendering.
 */
export default async function WhiteboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // AUTH: Verify user session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // AUTH: Resolve foundry context
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, foundry_id')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) {
    redirect('/login')
  }

  // Fetch whiteboard with foundry isolation
  const { data: whiteboard, error } = await supabase
    .from('whiteboards')
    .select('*')
    .eq('id', id)
    .eq('foundry_id', profile.foundry_id)
    .single()

  if (error || !whiteboard) {
    console.error('[Whiteboard] Not found or access denied:', { id, error: error?.message })
    notFound()
  }

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 -mb-32 lg:-mb-8">
      <WhiteboardEditor whiteboard={whiteboard as WhiteboardRow} />
    </div>
  )
}
