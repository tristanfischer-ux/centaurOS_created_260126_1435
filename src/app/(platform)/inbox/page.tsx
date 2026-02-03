import { redirect } from "next/navigation"

// Redirect /inbox to /home - Inbox functionality is now part of the Home page
export default async function InboxPage() {
    redirect("/home")
}
