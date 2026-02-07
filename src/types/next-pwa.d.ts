/**
 * Type declarations for next-pwa which doesn't ship its own types.
 * Without this, noImplicitAny: true causes a build error on import.
 */
declare module 'next-pwa' {
  import type { NextConfig } from 'next'
  
  interface PWAConfig {
    dest: string
    register?: boolean
    skipWaiting?: boolean
    disable?: boolean
    [key: string]: unknown
  }

  export default function withPWA(config: PWAConfig): (nextConfig: NextConfig) => NextConfig
}
