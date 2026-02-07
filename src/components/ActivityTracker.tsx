'use client'

/**
 * @file ActivityTracker.tsx
 * 
 * @description Thin client component wrapper for the useActivityTracker hook.
 * Renders nothing — just activates tracking in the platform layout.
 */

import { useActivityTracker } from '@/hooks/useActivityTracker'

export function ActivityTracker() {
  useActivityTracker()
  return null
}
