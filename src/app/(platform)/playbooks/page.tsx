import { redirect } from 'next/navigation'

/**
 * @description Redirect: Playbooks content now lives on the Objectives page
 * as "Other ideas for you to be getting on with". Preserves old bookmarks.
 */
export default function PlaybooksRedirect(): never {
  redirect('/new-objectives')
}
