'use client'

import { createContext, useContext, ReactNode } from 'react'
import { usePresence, type UserPresence, type PresenceStatus } from '@/hooks/usePresence'

interface PresenceContextType {
  myPresence: UserPresence | null
  teamPresence: UserPresence[]
  isConnected: boolean
  goOnline: (currentTaskId?: string) => Promise<UserPresence | null>
  goAway: () => Promise<UserPresence | null>
  goFocus: (message?: string) => Promise<UserPresence | null>
  goOffline: () => Promise<UserPresence | null>
  setWorkingOn: (taskId: string | null) => Promise<UserPresence | null>
  recordActivity: () => void
  getPresenceForUser: (userId: string) => UserPresence | undefined
  refreshTeamPresence: () => Promise<void>
}

const PresenceContext = createContext<PresenceContextType | null>(null)

export function usePresenceContext() {
  const context = useContext(PresenceContext)
  if (!context) {
    // Return a safe default for SSR or when provider is not mounted
    return {
      myPresence: null,
      teamPresence: [],
      isConnected: false,
      goOnline: async () => null,
      goAway: async () => null,
      goFocus: async () => null,
      goOffline: async () => null,
      setWorkingOn: async () => null,
      recordActivity: () => {},
      getPresenceForUser: () => undefined,
      refreshTeamPresence: async () => {}
    }
  }
  return context
}

interface PresenceProviderProps {
  children: ReactNode
}

export function PresenceProvider({ children }: PresenceProviderProps) {
  const presence = usePresence({
    heartbeatInterval: 30000, // 30 seconds
    awayTimeout: 300000 // 5 minutes
  })

  return (
    <PresenceContext.Provider value={presence}>
      {children}
    </PresenceContext.Provider>
  )
}

// Helper hook to get status for a specific user
export function useUserPresence(userId: string): {
  status: PresenceStatus
  presence: UserPresence | undefined
} {
  const { getPresenceForUser } = usePresenceContext()
  const presence = getPresenceForUser(userId)
  
  return {
    status: presence?.status || 'offline',
    presence
  }
}
