'use client'

import { MessagingSidebar } from './MessagingSidebar'

interface MessagingSidebarWrapperProps {
  userId: string
}

export function MessagingSidebarWrapper({ userId }: MessagingSidebarWrapperProps) {
  return (
    <MessagingSidebar 
      userId={userId} 
      className="hidden lg:flex h-full" 
      defaultCollapsed={true}
    />
  )
}
