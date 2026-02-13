import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

/**
 * @file og/profile/route.tsx
 *
 * @description Generates dynamic Open Graph images for public expert profiles.
 * When shared on LinkedIn, Slack, Twitter, or email, the link preview shows a
 * beautiful branded card with the expert's name, headline, rating, and skills.
 *
 * @security No auth required (public OG images). Rate limited by Next.js edge runtime.
 */

export const runtime = 'edge'

export async function GET(req: NextRequest): Promise<Response> {
    const { searchParams } = req.nextUrl

    // Extract profile data from query params
    const name = searchParams.get('name') || 'Expert'
    const headline = searchParams.get('headline') || 'Fractional Executive'
    const rating = searchParams.get('rating') || ''
    const reviews = searchParams.get('reviews') || '0'
    const skills = searchParams.get('skills') || ''
    const location = searchParams.get('location') || ''
    const verified = searchParams.get('verified') === 'true'
    const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

    const skillList = skills ? skills.split(',').slice(0, 4) : []

    return new ImageResponse(
        (
            <div
                style={{
                    width: '1200px',
                    height: '630px',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#ffffff',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
            >
                {/* Top accent bar */}
                <div
                    style={{
                        width: '100%',
                        height: '6px',
                        background: 'linear-gradient(90deg, #ff4500, #3b82f6)',
                    }}
                />

                {/* Main content */}
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        padding: '60px',
                        gap: '48px',
                    }}
                >
                    {/* Left: Avatar */}
                    <div
                        style={{
                            width: '180px',
                            height: '180px',
                            borderRadius: '24px',
                            background: 'linear-gradient(135deg, #ff4500, #ff6b35)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '64px',
                            fontWeight: 700,
                            flexShrink: 0,
                        }}
                    >
                        {initials}
                    </div>

                    {/* Right: Info */}
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            gap: '16px',
                        }}
                    >
                        {/* Name + Verified */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '48px', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                                {name}
                            </span>
                            {verified && (
                                <div
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '16px',
                                        backgroundColor: '#22c55e',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontSize: '18px',
                                    }}
                                >
                                    ✓
                                </div>
                            )}
                        </div>

                        {/* Headline */}
                        <span style={{ fontSize: '24px', color: '#64748b', lineHeight: 1.3 }}>
                            {headline}
                        </span>

                        {/* Rating + Location row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            {rating && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '24px', color: '#f59e0b' }}>★</span>
                                    <span style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>
                                        {rating}
                                    </span>
                                    <span style={{ fontSize: '18px', color: '#94a3b8' }}>
                                        ({reviews} reviews)
                                    </span>
                                </div>
                            )}
                            {location && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '20px', color: '#94a3b8' }}>📍</span>
                                    <span style={{ fontSize: '20px', color: '#64748b' }}>{location}</span>
                                </div>
                            )}
                        </div>

                        {/* Skills */}
                        {skillList.length > 0 && (
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {skillList.map((skill) => (
                                    <div
                                        key={skill}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            backgroundColor: '#fff7ed',
                                            color: '#ea580c',
                                            fontSize: '16px',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {skill.trim()}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer: Powered by ForgeOS */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '24px 60px',
                        borderTop: '1px solid #e2e8f0',
                        backgroundColor: '#fafafa',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                backgroundColor: '#ff4500',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '18px',
                                fontWeight: 800,
                            }}
                        >
                            F
                        </div>
                        <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                            ForgeOS
                        </span>
                    </div>
                    <span style={{ fontSize: '18px', color: '#64748b' }}>
                        Find experts like this → forgeos.com
                    </span>
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
        }
    )
}
