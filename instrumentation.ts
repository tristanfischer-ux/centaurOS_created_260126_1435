/**
 * @file instrumentation.ts
 *
 * @description Next.js instrumentation hook for initializing Sentry on the server
 * and running the schema migration preflight check.
 *
 * This file is automatically loaded by Next.js on server startup.
 *
 * INTENT: The schema preflight check runs here so that any cold start against a
 * database with an unapplied migration fails fast with a clear error message,
 * rather than serving traffic that silently produces empty or wrong data.
 *
 * If the preflight throws, Vercel marks the serverless function as unhealthy
 * and routes traffic away from this instance. The error appears in Vercel logs
 * and in Sentry with the exact migration version and columns missing, so the
 * fix (npx supabase db push --linked) is immediately clear.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Schema migration preflight — runs on every cold start in the Node.js
    // runtime. Throws if the database schema is out of date, preventing this
    // instance from serving traffic with missing columns.
    //
    // The preflight is skipped automatically when Supabase env vars are absent
    // (e.g. during local development without a linked Supabase instance, or
    // during static generation builds where no database is required).
    //
    // DECISION: imported dynamically so the module is only loaded in the Node
    // runtime and never bundled into the edge runtime. The admin client uses
    // Node-only modules that would crash in an edge context.
    try {
      const { assertSchemaPreflight } = await import("./src/lib/schema-preflight");
      await assertSchemaPreflight();
    } catch (e) {
      // Re-throw so Vercel sees the failure. Sentry will also capture it via
      // the onRequestError hook below.
      throw e;
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (
  err: { digest: string } & Error,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string };
  },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "middleware";
    renderSource:
      | "react-server-components"
      | "react-server-components-payload"
      | "server-rendering";
    revalidateReason: "on-demand" | "stale" | undefined;
    renderType: "dynamic" | "dynamic-resume";
  }
) => {
  const Sentry = await import("@sentry/nextjs");
  
  Sentry.captureException(err, {
    extra: {
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    },
  });
};
