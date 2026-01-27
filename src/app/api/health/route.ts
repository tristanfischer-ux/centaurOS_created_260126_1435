import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startTime = Date.now()
  
  try {
    const supabase = await createClient()
    
    // Check database connection
    const { error: dbError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
    
    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`)
    }
    
    const responseTime = Date.now() - startTime
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'connected',
        responseTime: `${responseTime}ms`
      },
      version: process.env.npm_package_version || '1.0.0'
    })
  } catch (error) {
    const responseTime = Date.now() - startTime
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'disconnected',
        responseTime: `${responseTime}ms`
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 })
  }
}
