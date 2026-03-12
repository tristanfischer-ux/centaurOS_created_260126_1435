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
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { role } = await params;
  const query = await searchParams;
  const redirectParam = typeof query.redirect === 'string' ? query.redirect : undefined;
  const redirectSuffix = redirectParam ? `&redirect=${encodeURIComponent(redirectParam)}` : '';
  redirect(`/join?role=${encodeURIComponent(role.toLowerCase())}${redirectSuffix}`);
}
