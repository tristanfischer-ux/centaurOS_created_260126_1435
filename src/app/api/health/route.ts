import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Health check endpoint
 * SECURITY: Does not expose database details or error messages
 * Only returns basic status for load balancers and monitoring
 */
export async function GET() {
  const startTime = Date.now()
  
  try {
    // Basic health check - verify the application is running
    // NOTE: Database check removed to prevent information disclosure
    // Use a separate authenticated endpoint for detailed diagnostics
    
    const responseTime = Date.now() - startTime
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      version: process.env.npm_package_version || '1.0.0'
    })
  } catch {
    const responseTime = Date.now() - startTime
    
    // SECURITY: Return generic error without details
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`
    }, { status: 503 })
  }
}
