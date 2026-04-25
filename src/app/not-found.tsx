/**
 * @file not-found.tsx
 *
 * @description Branded 404 (not-found) page for ForgeOS.
 * Server component using EmptyState pattern with navigation options.
 * Applies design system tokens and ForgeOS branding.
 */

import Link from "next/link"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { Home, ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Page Not Found",
  description: "The page you're looking for doesn't exist.",
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <EmptyState
          icon={
            <div className="h-16 w-16 rounded-full bg-international-orange/10 flex items-center justify-center">
              <span className="text-4xl font-bold text-international-orange">
                404
              </span>
            </div>
          }
          title="Page not found"
          description="The page you're looking for doesn't exist or has been moved. Don't worry, we can help you get back on track."
          action={
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild>
                <Link href="/">
                  <Home className="h-4 w-4 mr-2" />
                  Back to Fractional Forge
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/login">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go to Login
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    </div>
  )
}
