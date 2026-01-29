import { getPendingApplications } from "@/actions/admin"
import { ApplicationsView } from "./applications-view"

export default async function ApplicationsPage() {
    // Fetch all applications server-side
    const { data: applications, error } = await getPendingApplications()
    
    if (error) {
        return (
            <div className="text-center py-12">
                <p className="text-red-600">{error}</p>
            </div>
        )
    }
    
    return <ApplicationsView initialApplications={applications} />
}
