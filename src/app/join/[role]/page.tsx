import { redirect } from "next/navigation";

/**
 * Role-specific join page — redirects to the unified /join page.
 *
 * @description Existing marketing links point to /join/founder,
 * /join/executive, /join/apprentice, etc. This page preserves those
 * URLs by redirecting to the unified signup page with the role
 * pre-selected via query parameter.
 */
export default async function JoinRolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  redirect(`/join?role=${encodeURIComponent(role.toLowerCase())}`);
}
