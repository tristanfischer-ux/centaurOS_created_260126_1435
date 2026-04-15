import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    seed_monthly: process.env.STRIPE_PRICE_SEED_MONTHLY || 'NOT SET',
    seed_annual: process.env.STRIPE_PRICE_SEED_ANNUAL || 'NOT SET', 
    starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ? 'SET' : 'NOT SET',
    stripe_key: process.env.STRIPE_SECRET_KEY ? 'SET (starts with ' + process.env.STRIPE_SECRET_KEY?.substring(0, 7) + ')' : 'NOT SET',
    app_domain: process.env.NEXT_PUBLIC_APP_DOMAIN || 'NOT SET',
  })
}
