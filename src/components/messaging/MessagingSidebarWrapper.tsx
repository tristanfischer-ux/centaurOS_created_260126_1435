'use client'

import { usePathname } from 'next/navigation'
import { MessagingSidebar } from './MessagingSidebar'

interface MessagingSidebarWrapperProps {
  userId: string
}

export function MessagingSidebarWrapper({ userId }: MessagingSidebarWrapperProps) {
  const pathname = usePathname()
  
  // Don't render the sidebar on the messages page - it has its own message handling
  if (pathname === '/messages' || pathname?.startsWith('/messages/')) {
    return null
  }
  
  return (
    <MessagingSidebar 
      userId={userId} 
      className="hidden lg:flex h-full" 
      defaultCollapsed={true}
    />
  )
}
