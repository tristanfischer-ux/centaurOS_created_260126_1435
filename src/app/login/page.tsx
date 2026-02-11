/**
 * @file page.tsx — Login page (server wrapper for dynamic rendering)
 *
 * @description Forces dynamic rendering to avoid webpack prerender errors
 * with server action references. The actual UI is in the client LoginView.
 */

import { Suspense } from 'react'
import { LoginView } from './login-view'

export const dynamic = 'force-dynamic'

export default function LoginPage(): React.ReactNode {
    return (
        <Suspense fallback={null}>
            <LoginView />
        </Suspense>
    )
}
