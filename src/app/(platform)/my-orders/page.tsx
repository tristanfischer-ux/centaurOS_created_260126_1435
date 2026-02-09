import { redirect } from 'next/navigation'

/**
 * Redirect page for legacy /my-orders route.
 * Ensures bookmarks and old links continue to work.
 */
export default function MyOrdersRedirect() {
    redirect('/marketplace-orders')
}
