import { redirect } from 'next/navigation'

/**
 * Dashboard page — currently hidden.
 *
 * @description The dashboard is not part of the v1 release. Any direct
 * navigation or bookmarks to /dashboard are redirected to /updates.
 */
export default function DashboardPage() {
  redirect('/updates')
}
