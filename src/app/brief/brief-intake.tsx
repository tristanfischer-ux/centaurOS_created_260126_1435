"use client"

/**
 * @file Brief Intake (Client Component)
 * @description The concierge brief form for the Fractional Forge homepage.
 * Submits via the submitBrief server action (Supabase persist + Resend email),
 * then swaps to a confirmation view with the Calendly link. Styled to match the
 * marketing homepage (light, ember), scoped under .ff-intake.
 */

import { useState, type FormEvent } from "react"
import { submitDossierBrief } from "@/actions/dossier-projects"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"
import { FOCUS_SECTORS } from "@/lib/focus-sectors"

const CSS = `
.ff-intake{--ink:#0f1729;--ink-soft:#334155;--muted:#64748b;--line:#e6eaf0;--surface:#f8fafc;--ember:#e2562a;--ember-dark:#c2410c;--ember-soft:#fff2ec;--blue:#1d4ed8;--green:#0f7a4d;--green-soft:#ecfdf5;--radius:18px;--radius-sm:12px;--shadow:0 1px 2px rgba(15,23,41,.04),0 10px 30px rgba(15,23,41,.07);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);line-height:1.6;flex:1;
  background:radial-gradient(900px 420px at 85% -10%, var(--ember-soft), transparent 60%),radial-gradient(700px 380px at 0% 0%, #eef4ff, transparent 55%), #fff;}
.ff-intake *{box-sizing:border-box;}
.ff-intake a{color:var(--blue);text-decoration:none;}
.ff-intake .wrap{max-width:680px;margin:0 auto;padding:0 24px;}
.ff-intake .topbar{border-bottom:1px solid var(--line);background:rgba(255,255,255,.8);}
.ff-intake .topbar .row{display:flex;align-items:center;justify-content:space-between;height:64px;max-width:680px;margin:0 auto;padding:0 24px;}
.ff-intake .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;color:var(--ink);letter-spacing:-.02em;}
.ff-intake .flame{width:26px;height:26px;border-radius:8px;background:linear-gradient(160deg,#f59e0b,#e2562a 60%,#c2410c);display:inline-block;}
.ff-intake .back{font-size:14px;font-weight:600;color:var(--ink-soft);}
.ff-intake main{padding:54px 0 80px;}
.ff-intake .card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:38px;}
.ff-intake .eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ember-dark);}
.ff-intake h1{font-size:clamp(28px,4vw,40px);font-weight:800;letter-spacing:-.02em;margin:14px 0 0;line-height:1.15;}
.ff-intake .sub{font-size:18px;color:var(--ink-soft);margin:16px 0 0;}
.ff-intake form{margin-top:26px;display:flex;flex-direction:column;gap:18px;}
.ff-intake label{display:block;font-weight:700;font-size:14.5px;color:var(--ink);}
.ff-intake .req{color:var(--ember);}
.ff-intake .hint{font-weight:400;color:var(--muted);font-size:13px;}
.ff-intake textarea,.ff-intake input,.ff-intake select{width:100%;margin-top:8px;font-family:inherit;font-size:16px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);padding:13px 14px;}
.ff-intake textarea{min-height:130px;resize:vertical;line-height:1.5;}
.ff-intake textarea:focus,.ff-intake input:focus,.ff-intake select:focus{outline:none;border-color:var(--ember);box-shadow:0 0 0 3px var(--ember-soft);background:#fff;}
.ff-intake .row2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
@media(max-width:560px){.ff-intake .row2{grid-template-columns:1fr;}}
.ff-intake .btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;border-radius:999px;padding:16px 28px;font-weight:700;font-size:17px;cursor:pointer;border:1px solid transparent;background:var(--ember);color:#fff;box-shadow:0 6px 18px rgba(226,86,42,.28);width:100%;font-family:inherit;}
.ff-intake .btn:hover{background:var(--ember-dark);}
.ff-intake .btn:disabled{opacity:.6;cursor:default;}
.ff-intake .fineprint{font-size:13.5px;color:var(--muted);margin:6px 0 0;text-align:center;}
.ff-intake .err{color:#b91c1c;font-size:14px;font-weight:600;}
.ff-intake .confid{margin-top:10px;font-size:13px;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 13px;line-height:1.55;}
.ff-intake .done{text-align:center;}
.ff-intake .check{width:64px;height:64px;border-radius:50%;background:var(--green-soft);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;margin:0 auto 20px;border:1px solid #b7ebd1;}
.ff-intake .sign{margin-top:22px;font-weight:700;color:var(--ink);}
`

export function BriefIntake() {
  const [idea, setIdea] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [sector, setSector] = useState("")
  const [company, setCompany] = useState("")
  const [nda, setNda] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [trackToken, setTrackToken] = useState("")
  const firstName = name.trim().split(" ")[0] || "there"

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    if (!idea.trim() || !name.trim() || !email.trim()) {
      setError("Please add your idea, name and email.")
      return
    }
    setSending(true)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set("idea", idea)
      fd.set("name", name)
      fd.set("email", email)
      fd.set("sector", sector)
      fd.set("company", company)
      if (nda) fd.set("nda", "on")
      const res = await submitDossierBrief(fd)
      if (res.error) {
        setError(res.error)
      } else {
        setTrackToken(res.token ?? "")
        setDone(true)
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    } catch {
      setError("Something went wrong. Please try again, or email tristan.fischer@fractionalforge.app.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <div className="ff-intake">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <main>
        <div className="wrap">
          {!done ? (
            <div className="card">
              <span className="eyebrow">Get your Design Dossier</span>
              <h1>Tell me about your idea.</h1>
              <p className="sub">A short brief is enough to start, and the more you tell me, the more precisely the result can match your requirements. The Anvil engine uses open engineering libraries and real component prices to produce a buildable design, costed bill of materials, true cost and financial model, engineering drawings, worked calculations, and a risk and regulatory register. Everything is delivered within a few days in a live Excel workbook where every number is a traceable formula. Design Dossiers cost £2,500 each, or £6,000 a month for up to three. Fractional Forge does not review the Dossier, so your own engineers should check it.</p>
              <form onSubmit={onSubmit}>
                <div>
                  <label htmlFor="idea">Your idea <span className="req">*</span> <span className="hint">&mdash; what it does, who it&rsquo;s for, roughly how big.</span></label>
                  <textarea id="idea" value={idea} onChange={(e) => setIdea(e.target.value)} required
                    placeholder="e.g. A 3.5 MWh containerised battery energy-storage system for UK grid-scale frequency response, grid-tied at 11 kV, target install cost under £400/kWh, deployable within 5 days of delivery..." />
                  <p className="confid">Your brief is confidential. It is never used to train any model or shared without your explicit consent. An NDA is available on request &mdash; just ask.</p>
                </div>
                <div className="row2">
                  <div>
                    <label htmlFor="name">Your name <span className="req">*</span></label>
                    <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Okafor" />
                  </div>
                  <div>
                    <label htmlFor="email">Email <span className="req">*</span></label>
                    <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="jane@yourcompany.com" />
                  </div>
                </div>
                <div>
                  <label htmlFor="attachment">Attach a file <span className="hint">(optional &mdash; a spec, sketch or deck; PDF, Office, image or zip, up to 15&nbsp;MB)</span></label>
                  <input id="attachment" name="attachment" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.zip" />
                </div>
                <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontWeight: 500, fontSize: "14.5px", cursor: "pointer" }}>
                  <input type="checkbox" checked={nda} onChange={(e) => setNda(e.target.checked)} style={{ width: "auto", marginTop: "4px" }} />
                  <span>I&rsquo;d like an NDA before we go further &mdash; Tristan will send one over before the work starts.</span>
                </label>
                <div className="row2">
                  <div>
                    <label htmlFor="sector">Sector</label>
                    <select id="sector" value={sector} onChange={(e) => setSector(e.target.value)}>
                      <option value="">Choose one&hellip;</option>
                      {FOCUS_SECTORS.map((s) => (
                        <option key={s.id} value={s.briefValue}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="company">Company / role <span className="hint">(optional)</span></label>
                    <input id="company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Founder, Acme Energy" />
                  </div>
                </div>
                {error && <div className="err">{error}</div>}
                <button className="btn" type="submit" disabled={sending}>{sending ? "Sending…" : "Send my brief →"}</button>
                <p className="fineprint">A Design Dossier costs £2,500. I&rsquo;ll confirm the scope and price by email before any work starts. No account needed. &mdash; Tristan</p>
              </form>
            </div>
          ) : (
            <div className="card done">
              <div className="check">&#10003;</div>
              <h1>Thanks, {firstName} &mdash; your brief&rsquo;s in.</h1>
              <p className="sub">Anvil will build your Design Dossier and I&rsquo;ll email it to <strong>{email}</strong> within a few days, once we have confirmed the scope and price by email. As with any first-pass design, have your own engineers check it before you rely on it.</p>
              {trackToken && (
                <p className="sub">Track its progress any time on your private status page (also in your confirmation email): <a href={`/project/${trackToken}`}><strong>your project tracker &rarr;</strong></a></p>
              )}
              <p className="sub">Questions? Email tristan.fischer@fractionalforge.app.</p>
              <p className="sign">&mdash; Tristan, Founder, Fractional Forge</p>
            </div>
          )}
        </div>
      </main>
      </div>
      <MarketingFooter />
    </div>
  )
}
