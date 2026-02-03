import { redirect } from "next/navigation"

// Redirect /dashboard to /timeline - the Gantt view is the primary workspace
export default async function DashboardPage() {
    redirect("/timeline")
}
