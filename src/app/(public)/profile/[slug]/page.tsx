import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getPublicProfile, trackProfileView } from '@/actions/public-profile'
import { PublicProfileView } from '@/components/profile/PublicProfileView'
import { Skeleton } from '@/components/ui/skeleton'

interface PageProps {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ source?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params
    const { profile } = await getPublicProfile(slug)
    
    if (!profile) {
        return {
            title: 'Profile Not Found | CentaurOS',
        }
    }
    
    const name = profile.user_name || 'Executive'
    const description = profile.headline || profile.bio?.slice(0, 160) || `View ${name}'s profile on CentaurOS`
    
    return {
        title: `${name} | CentaurOS`,
        description,
        openGraph: {
            title: `${name} - ${profile.headline || 'Fractional Executive'}`,
            description,
            type: 'profile',
            images: profile.user_avatar ? [profile.user_avatar] : [],
        },
        twitter: {
            card: 'summary_large_image',
            title: `${name} - ${profile.headline || 'Fractional Executive'}`,
            description,
        },
    }
}

function ProfileSkeleton() {
    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <div className="flex flex-col md:flex-row gap-8">
                <div className="md:w-1/3">
                    <Skeleton className="w-32 h-32 rounded-full mx-auto" />
                    <Skeleton className="h-8 w-48 mx-auto mt-4" />
                    <Skeleton className="h-4 w-64 mx-auto mt-2" />
                </div>
                <div className="md:w-2/3 space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-3/4" />
                </div>
            </div>
        </div>
    )
}

async function ProfileContent({ slug, source }: { slug: string; source?: string }) {
    const { profile, error } = await getPublicProfile(slug)
    
    if (error || !profile) {
        notFound()
    }
    
    // Track the view (fire and forget)
    const validSource = source as 'marketplace' | 'search' | 'direct' | 'rfq' | 'referral' | undefined
    trackProfileView(slug, validSource || 'direct')
    
    return <PublicProfileView profile={profile} />
}

export default async function PublicProfilePage({ params, searchParams }: PageProps) {
    const { slug } = await params
    const { source } = await searchParams
    
    return (
        <div className="min-h-screen bg-background">
            <Suspense fallback={<ProfileSkeleton />}>
                <ProfileContent slug={slug} source={source} />
            </Suspense>
        </div>
    )
}
