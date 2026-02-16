import { DirectoryNav } from '@/components/directory/DirectoryNav'
import { DirectoryFooter } from '@/components/directory/DirectoryFooter'

/**
 * Layout for the public expert directory.
 *
 * @description Wraps all /experts/* and /expert/* pages with the public
 * navigation bar and footer. No authentication required.
 *
 * @security This layout is accessible without login. All data displayed
 * comes from SECURITY DEFINER RPC functions that only return public fields.
 */
export default function DirectoryLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <DirectoryNav />
            <main className="flex-1">{children}</main>
            <DirectoryFooter />
        </div>
    )
}
