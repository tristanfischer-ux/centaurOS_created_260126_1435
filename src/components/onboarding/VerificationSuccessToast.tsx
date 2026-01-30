'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

/**
 * Shows a success toast when user arrives after email verification
 */
export function VerificationSuccessToast() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const verified = searchParams.get('verified')
    
    if (verified === 'true') {
      // Show success toast
      toast.success('Email verified successfully! Welcome to CentaurOS.', {
        duration: 5000,
        description: 'Your account is now fully activated.',
      })
      
      // Remove the query param without triggering a reload
      const url = new URL(window.location.href)
      url.searchParams.delete('verified')
      router.replace(url.pathname, { scroll: false })
    }
  }, [searchParams, router])

  return null
}
