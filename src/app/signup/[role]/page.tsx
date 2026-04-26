import { redirect } from "next/navigation";

/**
 * Role-specific signup page — redirects to the unified /signup page.
 *
 * @description Existing marketing links point to /signup/founder,
 * /signup/executive, /signup/apprentice, etc. (and historically /join/...).
 * This page preserves those URLs by redirecting to the unified signup page
 * with the role pre-selected via query parameter.
 */
export default async function SignupRolePage({
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
  redirect(`/signup?role=${encodeURIComponent(role.toLowerCase())}${redirectSuffix}`);
}
