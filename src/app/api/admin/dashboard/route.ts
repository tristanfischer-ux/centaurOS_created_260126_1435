/**
 * @file route.ts — Self-contained admin management dashboard
 *
 * @description Password-protected HTML dashboard showing per-user activity,
 * signups, AI usage, and engagement metrics. Accessed ONLY via Vercel URL.
 *
 * @security Password gate via ADMIN_DASHBOARD_PASSWORD env var
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, getClientIP } from "@/lib/security/rate-limit"
import { cookies } from "next/headers"
import crypto from "crypto"

const COOKIE_NAME = "admin_dash_token"
const SESSION_HOURS = 24
const EXCLUDE_DOMAINS = ["perigee-labs.com", "fractionalforge.app"]

// SECURITY: Rate limit config for admin login — strict to prevent brute-force
const ADMIN_LOGIN_RATE_LIMIT = { limit: 5, window: 15 * 60 * 1000 } // 5 attempts per 15 minutes

function getPassword(): string {
  const pw = process.env.ADMIN_DASHBOARD_PASSWORD
  if (!pw) {
    throw new Error("ADMIN_DASHBOARD_PASSWORD env var is not configured")
  }
  return pw
}

function makeToken(password: string): string {
  return crypto.createHash("sha256").update(password + "-forgeos-dash").digest("hex").slice(0, 32)
}

function isAuthed(cookieStore: Awaited<ReturnType<typeof cookies>>): boolean {
  try {
    return cookieStore.get(COOKIE_NAME)?.value === makeToken(getPassword())
  } catch {
    return false // SECURITY: If password not configured, no one is authed
  }
}

function isExcluded(email: string): boolean {
  return EXCLUDE_DOMAINS.some(d => email.endsWith(`@${d}`))
}

export async function POST(req: NextRequest) {
  // SECURITY: Rate limit login attempts to prevent brute-force
  const ip = getClientIP(req.headers)
  const rl = await rateLimit("adminDashboard", ip, ADMIN_LOGIN_RATE_LIMIT)
  if (!rl.success) {
    return new NextResponse(loginPage("Too many attempts. Try again later."), { status: 429, headers: { "Content-Type": "text/html" } })
  }

  let password: string
  try {
    password = getPassword()
  } catch {
    return new NextResponse("Admin dashboard not configured", { status: 503 })
  }

  const form = await req.formData()
  // SECURITY: Hash both sides before comparing so lengths are always equal (32 bytes).
  // This prevents leaking password length via the timing of a short-circuit length check.
  const submittedStr = form.get("password")
  const expectedHash = crypto.createHash("sha256").update(password).digest()
  const submittedHash = crypto.createHash("sha256").update(typeof submittedStr === "string" ? submittedStr : "").digest()
  if (crypto.timingSafeEqual(expectedHash, submittedHash)) {
    const res = NextResponse.redirect(new URL("/api/admin/dashboard", req.url))
    res.cookies.set(COOKIE_NAME, makeToken(password), {
      httpOnly: true, secure: true, sameSite: "strict",
      maxAge: SESSION_HOURS * 3600, path: "/api/admin/dashboard",
    })
    return res
  }
  return new NextResponse(loginPage("Invalid password"), { status: 401, headers: { "Content-Type": "text/html" } })
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  if (req.nextUrl.searchParams.get("logout") === "1") {
    const res = NextResponse.redirect(new URL("/api/admin/dashboard", req.url))
    res.cookies.delete(COOKIE_NAME)
    return res
  }
  if (!isAuthed(cookieStore)) {
    return new NextResponse(loginPage(), { headers: { "Content-Type": "text/html" } })
  }
  try {
    const userId = req.nextUrl.searchParams.get("user")
    const html = userId ? await buildUserDetail(userId) : await buildDashboard()
    return new NextResponse(html, { headers: { "Content-Type": "text/html", "Cache-Control": "private, no-cache" } })
  } catch (err) {
    // SECURITY: Log full error server-side, show generic message to client
    console.error("[admin/dashboard] Internal error:", err)
    return new NextResponse("<h1>Error</h1><p>An internal error occurred.</p>", { status: 500, headers: { "Content-Type": "text/html" } })
  }
}

function loginPage(error?: string): string {
  return `<!DOCTYPE html><html><head><title>ForgeOS Admin</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#fff;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:360px;width:100%}h1{font-size:20px;margin:0 0 8px}p{color:#64748b;font-size:14px;margin:0 0 24px}input{display:block;width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;margin-bottom:16px;box-sizing:border-box}button{display:block;width:100%;padding:10px;background:#ff4500;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}.err{color:#ef4444;font-size:13px;margin-bottom:12px}</style>
</head><body><div class="card"><h1>ForgeOS Admin</h1><p>Enter password to continue.</p>${error ? `<div class="err">${esc(error)}</div>` : ""}<form method="POST"><input type="password" name="password" placeholder="Password" autofocus required><button>Sign In</button></form></div></body></html>`
}

// ── Main Dashboard ─────────────────────────────────────────────────
async function buildDashboard(): Promise<string> {
  const sb = createAdminClient()

  const [profilesRes, aiMonthRes, aiDailyRes, authUsersRes] = await Promise.all([
    sb.from("profiles").select("id, full_name, email, role, created_at, foundry_id").order("created_at", { ascending: false }),
    sb.from("ai_usage_log").select("*", { count: "exact", head: true })
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    sb.from("ai_usage_log").select("created_at, estimated_cost_usd, user_id, feature")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(10000),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const allProfiles = (profilesRes.data ?? []).filter(p => !isExcluded(p.email))
  const authUsers = (authUsersRes.data?.users ?? []).filter(u => u.email && !isExcluded(u.email))
  const aiMonth = aiMonthRes.count ?? 0
  const aiDaily = (aiDailyRes.data ?? []) as Array<{ created_at: string; estimated_cost_usd: number | null; user_id: string; feature: string }>

  // Build auth lookup: userId → last_sign_in_at
  const authMap = new Map<string, { lastSignIn: string | null; createdAt: string }>()
  authUsers.forEach(u => authMap.set(u.id, { lastSignIn: u.last_sign_in_at ?? null, createdAt: u.created_at }))

  // Build AI usage per user
  const aiPerUser = new Map<string, number>()
  const aiByDay: Record<string, { count: number; cost: number }> = {}
  aiDaily.forEach(row => {
    aiPerUser.set(row.user_id, (aiPerUser.get(row.user_id) || 0) + 1)
    const day = row.created_at?.slice(0, 10)
    if (day) {
      if (!aiByDay[day]) aiByDay[day] = { count: 0, cost: 0 }
      aiByDay[day].count++
      aiByDay[day].cost += row.estimated_cost_usd ?? 0
    }
  })

  // Compute metrics
  const now = Date.now()
  const weekAgo = now - 7 * 86400000
  const signupsWeek = allProfiles.filter(p => new Date(p.created_at).getTime() > weekAgo).length
  const activeUsers7d = authUsers.filter(u => {
    const last = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0
    return last > weekAgo
  }).length
  const totalCost = Object.values(aiByDay).reduce((s, d) => s + d.cost, 0)

  // Per-user table rows
  const userRows = allProfiles.map(p => {
    const auth = authMap.get(p.id)
    const lastSignIn = auth?.lastSignIn ? new Date(auth.lastSignIn) : null
    const daysSinceActive = lastSignIn ? Math.floor((now - lastSignIn.getTime()) / 86400000) : 999
    const aiTasks = aiPerUser.get(p.id) || 0
    const status = daysSinceActive <= 1 ? "active" : daysSinceActive <= 7 ? "recent" : daysSinceActive <= 30 ? "dormant" : "churned"
    return { ...p, lastSignIn, daysSinceActive, aiTasks, status }
  }).sort((a, b) => a.daysSinceActive - b.daysSinceActive)

  const ts = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })

  return `<!DOCTYPE html><html><head><title>ForgeOS Admin</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60">
${CSS}
</head><body>
<div class="header"><div><h1>ForgeOS <span class="orange">Admin</span></h1><div class="meta">Updated: ${ts} &middot; Auto-refreshes 60s &middot; Excluding: ${EXCLUDE_DOMAINS.join(", ")}</div></div><a class="logout" href="?logout=1">Log out</a></div>

<div class="grid">
  ${statCard("Total Users", allProfiles.length, "Excluding test accounts")}
  ${statCard("Active (7d)", activeUsers7d, "Logged in past 7 days")}
  ${statCard("Signups (7d)", signupsWeek, "New this week")}
  ${statCard("AI Tasks (month)", aiMonth, `$${totalCost.toFixed(2)} total cost`)}
</div>

<div class="two-col section">
  <div class="card">
    <h2>Daily AI Usage (30d)</h2>
    ${barChart(Object.entries(aiByDay).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([d, v]) => ({ label: d, value: v.count })))}
    <div class="meta" style="margin-top:8px">Total: ${aiDaily.length} calls &middot; $${totalCost.toFixed(2)}</div>
  </div>
  <div class="card">
    <h2>Signups by Day (30d)</h2>
    ${(() => {
      const byDay: Record<string, number> = {}
      allProfiles.filter(p => new Date(p.created_at).getTime() > now - 30 * 86400000)
        .forEach(p => { const d = p.created_at.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1 })
      return barChart(Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ label: d, value: v })), "#2563eb")
    })()}
  </div>
</div>

<div class="card section">
  <h2>All Users — Per-User Activity</h2>
  <table>
    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Signed Up</th><th>Last Login</th><th>Days Ago</th><th>AI Tasks</th><th>Status</th><th></th></tr></thead>
    <tbody>
      ${userRows.map(u => `<tr>
        <td><strong>${esc(u.full_name || "—")}</strong></td>
        <td>${esc(u.email)}</td>
        <td><span class="badge badge-${u.role?.toLowerCase()}">${esc(u.role)}</span></td>
        <td>${fmt(u.created_at)}</td>
        <td>${u.lastSignIn ? fmt(u.lastSignIn.toISOString()) : "<span style='color:#94a3b8'>Never</span>"}</td>
        <td style="text-align:center">${u.daysSinceActive > 900 ? "—" : u.daysSinceActive + "d"}</td>
        <td style="text-align:center;font-weight:600">${u.aiTasks}</td>
        <td><span class="status status-${u.status}">${u.status}</span></td>
        <td><a href="?user=${u.id}" class="drill">View &rarr;</a></td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>

</body></html>`
}

// ── User Detail Page ───────────────────────────────────────────────
async function buildUserDetail(userId: string): Promise<string> {
  const sb = createAdminClient()

  const [profileRes, aiRes, eventsRes, authRes] = await Promise.all([
    sb.from("profiles").select("*").eq("id", userId).single(),
    sb.from("ai_usage_log").select("created_at, feature, model, estimated_cost_usd")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    sb.from("activity_events").select("event_type, event_data, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    sb.auth.admin.getUserById(userId),
  ])

  const profile = profileRes.data
  const aiLogs = (aiRes.data ?? []) as Array<{ created_at: string; feature: string; model: string; estimated_cost_usd: number | null }>
  const events = (eventsRes.data ?? []) as Array<{ event_type: string; event_data: Record<string, unknown> | null; created_at: string }>
  const authUser = authRes.data?.user

  if (!profile) return `<h1>User not found</h1><a href="/api/admin/dashboard">Back</a>`

  // Group events by day
  const eventsByDay: Record<string, Array<{ time: string; type: string; detail: string }>> = {}
  events.forEach(e => {
    const day = e.created_at.slice(0, 10)
    const time = e.created_at.slice(11, 16)
    const detail = (e.event_data as Record<string, string> | null)?.page || ""
    if (!eventsByDay[day]) eventsByDay[day] = []
    eventsByDay[day].push({ time, type: e.event_type, detail })
  })

  // Group AI by day
  const aiByDay: Record<string, Array<{ time: string; feature: string; model: string; cost: number }>> = {}
  aiLogs.forEach(a => {
    const day = a.created_at.slice(0, 10)
    const time = a.created_at.slice(11, 16)
    if (!aiByDay[day]) aiByDay[day] = []
    aiByDay[day].push({ time, feature: a.feature, model: a.model, cost: a.estimated_cost_usd ?? 0 })
  })

  const allDays = [...new Set([...Object.keys(eventsByDay), ...Object.keys(aiByDay)])].sort().reverse()

  return `<!DOCTYPE html><html><head><title>${esc(profile.full_name || "User")} — ForgeOS Admin</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
${CSS}
</head><body>
<div class="header">
  <div>
    <a href="/api/admin/dashboard" style="color:#64748b;text-decoration:none;font-size:13px">&larr; Back to Dashboard</a>
    <h1>${esc(profile.full_name || "Unknown")}</h1>
    <div class="meta">${esc(profile.email)} &middot; ${esc(profile.role)} &middot; Signed up ${fmt(profile.created_at)} &middot; Last login: ${authUser?.last_sign_in_at ? fmt(authUser.last_sign_in_at) : "Never"}</div>
  </div>
</div>

<div class="grid">
  ${statCard("Total Events", events.length, "Activity events tracked")}
  ${statCard("AI Tasks", aiLogs.length, `$${aiLogs.reduce((s, a) => s + (a.estimated_cost_usd ?? 0), 0).toFixed(2)} total`)}
  ${statCard("Active Days", allDays.length, "Days with any activity")}
  ${statCard("Last Active", allDays[0] || "Never", "")}
</div>

<div class="card section">
  <h2>Daily Activity Timeline</h2>
  ${allDays.length === 0 ? '<p style="color:#94a3b8">No activity recorded yet.</p>' : ""}
  ${allDays.map(day => {
    const dayEvents = eventsByDay[day] || []
    const dayAI = aiByDay[day] || []
    return `<div style="margin-bottom:20px;border-left:3px solid #ff4500;padding-left:16px">
      <h3 style="margin:0 0 8px;font-size:14px;color:#0f172a">${day} <span style="color:#94a3b8;font-weight:400">(${dayEvents.length} events, ${dayAI.length} AI calls)</span></h3>
      ${dayEvents.length > 0 ? `<table style="margin-bottom:8px">
        <thead><tr><th>Time</th><th>Event</th><th>Page / Detail</th></tr></thead>
        <tbody>${dayEvents.map(e => `<tr><td style="font-family:monospace;font-size:12px">${e.time}</td><td>${esc(e.type)}</td><td style="color:#64748b">${esc(e.detail)}</td></tr>`).join("")}</tbody>
      </table>` : ""}
      ${dayAI.length > 0 ? `<table>
        <thead><tr><th>Time</th><th>Feature</th><th>Model</th><th style="text-align:right">Cost</th></tr></thead>
        <tbody>${dayAI.map(a => `<tr><td style="font-family:monospace;font-size:12px">${a.time}</td><td>${esc(a.feature)}</td><td style="color:#64748b;font-size:12px">${esc(a.model)}</td><td style="text-align:right">$${a.cost.toFixed(3)}</td></tr>`).join("")}</tbody>
      </table>` : ""}
    </div>`
  }).join("")}
</div>

</body></html>`
}

// ── Helpers ─────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;")
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}`
}

function statCard(label: string, value: string | number, sub: string): string {
  return `<div class="card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`
}

function barChart(data: Array<{ label: string; value: number }>, color = "#ff4500"): string {
  if (data.length === 0) return '<p style="color:#94a3b8;font-size:13px">No data</p>'
  const max = Math.max(...data.map(d => d.value), 1)
  const barW = Math.max(8, Math.floor(600 / data.length) - 2)
  const h = 120
  return `<svg width="${data.length * (barW + 2)}" height="${h}" style="max-width:100%">${data.map((d, i) => {
    const barH = Math.max(2, (d.value / max) * (h - 20))
    return `<rect x="${i * (barW + 2)}" y="${h - barH}" width="${barW}" height="${barH}" fill="${color}" rx="2"><title>${d.label}: ${d.value}</title></rect>`
  }).join("")}</svg>`
}

const CSS = `<style>
*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#0f172a}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}h1{font-size:24px;margin:0}.meta{color:#64748b;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.stat-label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.stat-value{font-size:32px;font-weight:700}.stat-sub{font-size:12px;color:#94a3b8;margin-top:2px}
h2{font-size:16px;margin:0 0 12px;color:#334155}h3{font-size:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:6px 12px;background:#f8fafc;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e2e8f0}
td{padding:6px 12px;border-bottom:1px solid #f1f5f9}tr:hover td{background:#f8fafc}
.badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600}
.badge-founder{background:#fff7ed;color:#ea580c}.badge-executive{background:#fef3c7;color:#d97706}
.badge-apprentice{background:#f0fdf4;color:#16a34a}.badge-supplier{background:#eff6ff;color:#2563eb}
.status{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600}
.status-active{background:#dcfce7;color:#16a34a}.status-recent{background:#dbeafe;color:#2563eb}
.status-dormant{background:#fef3c7;color:#d97706}.status-churned{background:#fee2e2;color:#dc2626}
.orange{color:#ff4500}.section{margin-bottom:24px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:768px){.two-col{grid-template-columns:1fr}}
a.logout{color:#64748b;text-decoration:none;font-size:13px}a.logout:hover{color:#ef4444}
a.drill{color:#ff4500;text-decoration:none;font-size:12px;font-weight:600}a.drill:hover{text-decoration:underline}
</style>`
