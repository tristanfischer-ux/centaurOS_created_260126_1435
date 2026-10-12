import { NextResponse } from "next/server";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/security/sanitize";
import { MAIL } from "@/lib/lumicity/html";

// Public enquiry form on /condition-desk, /habitat-draft and /bid-check.
// Sends one notification to Tristan; nothing is sent to the person who filled it in.
const SERVICES: Record<string, string> = {
  "condition-desk": "Condition Desk",
  "habitat-draft": "Habitat Draft",
  "bid-check": "Bid Check",
};
const LIMITS = { name: 120, email: 200, org: 200, ref: 500, message: 4000 } as const;
const FROM = process.env.EMAIL_FROM_ADDRESS || "Tristan @ Fractional Forge <tristan@fractionalforge.app>";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  // Honeypot: bots fill the hidden field. Pretend success.
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });

  const f = {} as Record<keyof typeof LIMITS, string>;
  for (const [k, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    const v = typeof body[k] === "string" ? (body[k] as string).trim() : "";
    if (v.length > max) return NextResponse.json({ error: `${k} too long` }, { status: 400 });
    f[k] = v;
  }
  const service = SERVICES[String(body.service)];
  if (!service || !f.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[service-enquiry] RESEND_API_KEY not set", { service, email: f.email });
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const row = (label: string, v: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">${label}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(v || "-")}</td></tr>`;
  const { error } = await new Resend(key).emails.send({
    from: FROM,
    to: [MAIL],
    replyTo: f.email,
    subject: `${service} request from ${f.name}${f.org ? `, ${f.org}` : ""}`,
    html: `<div style="font-family:sans-serif;max-width:640px"><h2 style="margin:0 0 12px">New ${escapeHtml(service)} request</h2><table>${row("Name", f.name)}${row("Email", f.email)}${row("Organisation", f.org)}${row("Reference", f.ref)}${row("Message", f.message)}</table><p style="color:#888;font-size:12px">Sent from the ${escapeHtml(service)} page. Reply to this email to answer them.</p></div>`,
  });
  if (error) {
    console.error("[service-enquiry] send failed", { service, error: error.message });
    return NextResponse.json({ error: "send failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
