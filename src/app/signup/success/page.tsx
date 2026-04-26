import { Suspense } from "react"
import { SuccessContent } from "./success-content"

/**
 * Success page after signup or application submission.
 *
 * @description Server component that resolves search params and delegates
 * to the client-side SuccessContent which handles session detection,
 * auto-redirect for already-authenticated users, and polling for email
 * verification completion.
 */
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; role?: string }>;
}) {
  const params = await searchParams
  const type = params.type || "signup"
  const role = params.role || "general"

  return (
    <Suspense fallback={null}>
      <SuccessContent type={type} role={role} />
    </Suspense>
  )
}
