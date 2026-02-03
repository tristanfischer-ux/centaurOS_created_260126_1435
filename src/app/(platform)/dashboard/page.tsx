import { redirect } from "next/navigation"

// Redirect /dashboard to /home - the unified home view
export default async function DashboardPage() {
    redirect("/home")
}
