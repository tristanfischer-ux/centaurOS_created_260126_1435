import { redirect } from "next/navigation"

// Redirect /dashboard to /today - the new daily focus view
export default async function DashboardPage() {
    redirect("/today")
}
