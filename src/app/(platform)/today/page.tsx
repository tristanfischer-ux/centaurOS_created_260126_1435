import { redirect } from "next/navigation"

// Redirect /today to /home - Today functionality is now part of the Home page
export default async function TodayPage() {
    redirect("/home")
}
