import type { MetadataRoute } from 'next'
import { getDirectoryExpertSlugs, getDirectoryRoles, getDirectoryLocations } from '@/actions/directory'
import { DIRECTORY_ROLE_CATEGORIES, locationToSlug } from '@/lib/directory/types'
import type { DirectoryRoleSlug } from '@/lib/directory/types'

/**
 * Generates a dynamic sitemap for search engine indexing.
 *
 * @description Includes:
 * 1. Static marketing pages (/, /experts)
 * 2. Role category pages (/experts/fractional-cmo, etc.)
 * 3. Long-tail role + location pages (/experts/fractional-cmo/london)
 * 4. Individual expert profile pages (/expert/[slug])
 *
 * @security Only public pages included. No authenticated routes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'
    const now = new Date()

    // Static pages
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: appUrl,
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${appUrl}/experts`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.9,
        },
    ]

    // Role category pages (known set)
    const rolePages: MetadataRoute.Sitemap = Object.keys(DIRECTORY_ROLE_CATEGORIES).map(
        (roleSlug) => ({
            url: `${appUrl}/experts/${roleSlug}`,
            lastModified: now,
            changeFrequency: 'daily' as const,
            priority: 0.8,
        })
    )

    // Dynamic: individual expert profiles
    let expertPages: MetadataRoute.Sitemap = []
    try {
        const slugs = await getDirectoryExpertSlugs()
        expertPages = slugs.map((slug) => ({
            url: `${appUrl}/expert/${slug}`,
            lastModified: now,
            changeFrequency: 'weekly' as const,
            priority: 0.7,
        }))
    } catch (error) {
        console.error('[Sitemap] Failed to fetch expert slugs:', error)
    }

    // Dynamic: long-tail role + location pages
    let locationPages: MetadataRoute.Sitemap = []
    try {
        const locations = await getDirectoryLocations()
        const roleKeys = Object.keys(DIRECTORY_ROLE_CATEGORIES) as DirectoryRoleSlug[]

        locationPages = roleKeys.flatMap((roleSlug) =>
            locations.map((loc) => ({
                url: `${appUrl}/experts/${roleSlug}/${locationToSlug(loc.location_name)}`,
                lastModified: now,
                changeFrequency: 'weekly' as const,
                priority: 0.6,
            }))
        )
    } catch (error) {
        console.error('[Sitemap] Failed to fetch locations:', error)
    }

    return [...staticPages, ...rolePages, ...expertPages, ...locationPages]
}
