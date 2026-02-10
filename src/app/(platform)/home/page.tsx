import { redirect } from 'next/navigation'

/**
 * HomePage — Redirects to My Profile.
 *
 * @description The /home route previously showed a standalone company switcher.
 * Company switching now lives on the My Profile page, so this route
 * simply redirects there.
 */
export default function HomePage() {
  redirect('/my-profile')
}
