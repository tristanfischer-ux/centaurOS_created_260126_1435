/**
 * @file route.ts — Self-contained admin management dashboard
 *
 * @description Password-protected HTML dashboard showing user activity,
 * signups, AI usage, feature adoption, and retention. Accessed ONLY via
 * the raw Vercel deployment URL — not exposed on fractionalforge.app.
 *
 * Access: https://centaur-os-created-260126-1435.vercel.app/api/admin/dashboard
 *
 * @security
 * - Password gate via ADMIN_DASHBOARD_PASSWORD env var
 * - Cookie-based session (httpOnly, secure, 24h)
 * - Uses service role client (bypasses RLS)
 * - Not linked from any app navigation
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"
import crypto from "crypto"

const COOKIE_NAME = "admin_dash_token"
const SESSION_HOURS = 24

function getPassword(): string {
  return process.env.ADMIN_DASHBOARD_PASSWORD || "forgeos-admin-2026"
}

function makeToken(password: string): string {
  return crypto.createHash("sha256").update(password + "-forgeos-dash").digest("hex").slice(0, 32)
}

function isAuthed(cookieStore: Awaited<ReturnType<typeof cookies>>): boolean {
  const token = cookieStore.get(COOKIE_NAME)?.value
  return token === makeToken(getPassword())
}

// ── POST: Login ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const password = form.get("password") as string

  if (password === getPassword()) {
    const token = makeToken(password)
    const res = NextResponse.redirect(new URL("/api/admin/dashboard", req.url))
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: SESSION_HOURS * 3600,
      path: "/api/admin/dashboard",
    })
    return res
  }

  return new NextResponse(loginPage("Invalid password"), {
    status: 401,
    headers: { "Content-Type": "text/html" },
  })
}

// ── GET: Dashboard or Login ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()

  // Handle logout
  if (req.nextUrl.searchParams.get("logout") === "1") {
    const res = NextResponse.redirect(new URL("/api/admin/dashboard", req.url))
    res.cookies.delete(COOKIE_NAME)
    return res
  }

  if (!isAuthed(cookieStore)) {
    return new NextResponse(loginPage(), {
      headers: { "Content-Type": "text/html" },
    })
  }

  try {
    const html = await buildDashboard()
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (err) {
    return new NextResponse(`<h1>Dashboard Error</h1><pre>${(err as Error).message}</pre>`, {
      status: 500,
      headers: { "Content-Type": "text/html" },
    })
  }
}

// ── Login Page ─────────────────────────────────────────────────────
function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html><head><title>ForgeOS Admin</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 360px; width: 100%; }
  h1 { font-size: 20px; margin: 0 0 8px; color: #0f172a; }
  p { color: #64748b; font-size: 14px; margin: 0 0 24px; }
  input { display: block; width: 100%; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; margin-bottom: 16px; box-sizing: border-box; }
  button { display: block; width: 100%; padding: 10px; background: #ff4500; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  button:hover { background: #e63e00; }
  .err { color: #ef4444; font-size: 13px; margin-bottom: 12px; }
</style>
</head><body>
<div class="card">
  <h1>ForgeOS Admin Dashboard</h1>
  <p>Enter the admin password to continue.</p>
  ${error ? `<div class="err">${error}</div>` : ""}
  <form method="POST">
    <input type="password" name="password" placeholder="Password" autofocus required>
    <button type="submit">Sign In</button>
  </form>
</div>
</body></html>`
}

// ── Dashboard Builder ──────────────────────────────────────────────
async function buildDashboard(): Promise<string> {
  const supabase = createAdminClient()

  // Parallel data fetches
  const [
    totalUsersRes,
    signupsWeekRes,
    signups30dRes,
    dau30dRes,
    aiMonthRes,
    recentSignupsRes,
    featureUsageRes,
    aiDaily30dRes,
  ] = await Promise.all([
    // Total users
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    // Signups this week
    supabase.from("profiles").select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    // Daily signups last 30 days (RPC may not exist — use profiles query as fallback)
    supabase.from("profiles").select("created_at")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("created_at", { ascending: true }),
    // DAU last 30 days (from activity_events)
    supabase.from("activity_events").select("user_id, created_at")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .limit(10000),
    // AI tasks this month
    supabase.from("ai_usage_log").select("*", { count: "exact", head: true })
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    // Recent signups
    supabase.from("profiles")
      .select("id, full_name, email, role, created_at, foundry_id")
      .order("created_at", { ascending: false })
      .limit(20),
    // Feature usage (top pages last 7d)
    supabase.from("activity_events")
      .select("event_type, event_data")
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .limit(5000),
    // AI usage daily last 30d
    supabase.from("ai_usage_log")
      .select("created_at, estimated_cost_usd")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .limit(10000),
  ])

  const totalUsers = totalUsersRes.count ?? 0
  const signupsWeek = signupsWeekRes.count ?? 0
  const aiMonth = aiMonthRes.count ?? 0
  const recentSignups = recentSignupsRes.data ?? []

  // Compute DAU from activity_events (fallback if RPC doesn't exist)
  let activeUsers7d = 0
  const featureEvents = featureUsageRes.data ?? []
  const userSet = new Set<string>()
  featureEvents.forEach((e: { event_type: string; event_data: Record<string, unknown> | null }) => {
    const userId = (e.event_data as Record<string, string> | null)?.user_id
    if (userId) userSet.add(userId)
  })
  activeUsers7d = userSet.size || 0

  // Compute feature usage counts
  const featureCounts: Record<string, number> = {}
  featureEvents.forEach((e: { event_type: string; event_data: Record<string, unknown> | null }) => {
    const page = (e.event_data as Record<string, string> | null)?.page || e.event_type
    featureCounts[page] = (featureCounts[page] || 0) + 1
  })
  const topFeatures = Object.entries(featureCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)

  // Compute daily AI costs
  const aiDailyData = aiDaily30dRes.data ?? []
  const aiByDay: Record<string, { count: number; cost: number }> = {}
  aiDailyData.forEach((row: { created_at: string; estimated_cost_usd: number | null }) => {
    const day = row.created_at?.slice(0, 10)
    if (!day) return
    if (!aiByDay[day]) aiByDay[day] = { count: 0, cost: 0 }
    aiByDay[day].count++
    aiByDay[day].cost += row.estimated_cost_usd ?? 0
  })

  // Compute daily signups from recentSignups (rough — use all profiles for full count)
  const signupsByDay: Record<string, number> = {}
  recentSignups.forEach((p: { created_at: string }) => {
    const day = p.created_at?.slice(0, 10)
    if (day) signupsByDay[day] = (signupsByDay[day] || 0) + 1
  })

  // SVG bar chart helper
  function barChart(data: Array<{ label: string; value: number }>, color = "#ff4500"): string {
    if (data.length === 0) return "<p style='color:#94a3b8;font-size:13px;'>No data yet</p>"
    const max = Math.max(...data.map(d => d.value), 1)
    const barW = Math.max(8, Math.floor(600 / data.length) - 2)
    const h = 120
    const bars = data.map((d, i) => {
      const barH = Math.max(2, (d.value / max) * (h - 20))
      return `<rect x="${i * (barW + 2)}" y="${h - barH}" width="${barW}" height="${barH}" fill="${color}" rx="2">
        <title>${d.label}: ${d.value}</title></rect>`
    }).join("")
    return `<svg width="${data.length * (barW + 2)}" height="${h}" style="max-width:100%;">${bars}</svg>`
  }

  // Format date for display
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}`
  }

  const now = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })

  return `<!DOCTYPE html>
<html><head><title>ForgeOS Admin Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  h1 { font-size: 24px; margin: 0; }
  .meta { color: #64748b; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .stat-value { font-size: 32px; font-weight: 700; color: #0f172a; }
  .stat-sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  h2 { font-size: 16px; margin: 0 0 12px; color: #334155; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; background: #f8fafc; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
  tr:hover td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
  .badge-founder { background: #fff7ed; color: #ea580c; }
  .badge-exec { background: #fef3c7; color: #d97706; }
  .badge-apprentice { background: #f0fdf4; color: #16a34a; }
  .badge-supplier { background: #eff6ff; color: #2563eb; }
  .section { margin-bottom: 24px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }
  .orange { color: #ff4500; }
  a.logout { color: #64748b; text-decoration: none; font-size: 13px; }
  a.logout:hover { color: #ef4444; }
</style>
</head><body>

<div class="header">
  <div>
    <h1>ForgeOS <span class="orange">Admin</span></h1>
    <div class="meta">Last refreshed: ${now} &middot; Auto-refreshes every 60s</div>
  </div>
  <a class="logout" href="/api/admin/dashboard?logout=1">Log out</a>
</div>

<!-- Key metrics -->
<div class="grid">
  <div class="card">
    <div class="stat-label">Total Users</div>
    <div class="stat-value">${totalUsers}</div>
    <div class="stat-sub">All registered accounts</div>
  </div>
  <div class="card">
    <div class="stat-label">Active (7d)</div>
    <div class="stat-value">${activeUsers7d}</div>
    <div class="stat-sub">Distinct users with activity events</div>
  </div>
  <div class="card">
    <div class="stat-label">Signups (7d)</div>
    <div class="stat-value">${signupsWeek}</div>
    <div class="stat-sub">New registrations this week</div>
  </div>
  <div class="card">
    <div class="stat-label">AI Tasks (month)</div>
    <div class="stat-value">${aiMonth}</div>
    <div class="stat-sub">API calls this calendar month</div>
  </div>
</div>

<!-- Charts row -->
<div class="two-col section">
  <div class="card">
    <h2>Daily AI Usage (30d)</h2>
    ${barChart(
      Object.entries(aiByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([day, d]) => ({ label: day, value: d.count }))
    )}
    <div class="meta" style="margin-top:8px;">
      Total cost: $${Object.values(aiByDay).reduce((s, d) => s + d.cost, 0).toFixed(2)}
    </div>
  </div>
  <div class="card">
    <h2>Feature Usage (7d)</h2>
    <table>
      <thead><tr><th>Page / Event</th><th style="text-align:right;">Count</th></tr></thead>
      <tbody>
        ${topFeatures.slice(0, 15).map(([name, count]) =>
          `<tr><td>${escHtml(name)}</td><td style="text-align:right;font-weight:600;">${count}</td></tr>`
        ).join("")}
      </tbody>
    </table>
  </div>
</div>

<!-- Recent signups -->
<div class="card section">
  <h2>Recent Signups</h2>
  <table>
    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Signed Up</th></tr></thead>
    <tbody>
      ${recentSignups.map((u: { full_name: string; email: string; role: string; created_at: string }) => {
        const badge = u.role === "Founder" ? "badge-founder"
          : u.role === "Executive" ? "badge-exec"
          : u.role === "Apprentice" ? "badge-apprentice"
          : "badge-supplier"
        return `<tr>
          <td><strong>${escHtml(u.full_name || "—")}</strong></td>
          <td>${escHtml(u.email)}</td>
          <td><span class="badge ${badge}">${escHtml(u.role)}</span></td>
          <td>${fmt(u.created_at)}</td>
        </tr>`
      }).join("")}
    </tbody>
  </table>
</div>

</body></html>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
