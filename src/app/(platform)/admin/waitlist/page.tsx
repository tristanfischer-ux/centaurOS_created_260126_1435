import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaitlistTable } from "@/components/admin/waitlist-table";
import { getWaitlistEntries } from "@/actions/waitlist";
import { typography } from "@/lib/design-system";
import { ShieldAlert } from "lucide-react";

/**
 * Admin Waitlist Page
 *
 * @description Platform admin only. View and approve/reject waitlist entries.
 * Access requires PLATFORM_SUPER_ADMIN_EMAIL match.
 */
export default async function AdminWaitlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isCompanyAdmin = profile?.role === "Founder" || profile?.role === "Executive";
  if (!isCompanyAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
        <div className="p-4 rounded-full bg-status-error-light mb-4">
          <ShieldAlert className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          Admin pages are only accessible to Founders and Executives.
        </p>
      </div>
    );
  }

  const { entries, error } = await getWaitlistEntries();

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex flex-col gap-4 pb-4 border-b border-border">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Waitlist</h1>
          </div>
        </div>
        <div className="mt-6 p-4 rounded-lg bg-status-error-light border border-destructive text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Waitlist</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Approve or reject signup requests. Approved users receive an invite email.
          </p>
        </div>
      </div>
      <WaitlistTable initialEntries={entries} />
    </div>
  );
}
