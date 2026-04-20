/**
 * TodayView — V2 triage surface.
 *
 * Ported 1:1 from FORGE-MOCKUP-TODAY-V2.html. DOM structure, class names,
 * and copy match the mockup exactly. Content is stubbed with the mockup's
 * reference data for visual parity; real data gets wired in a follow-up.
 *
 * Sections (top to bottom):
 *   1. Greeting row (name, date/time, 3 signal chips)
 *   2. Headline grid — Priority blocking card + Cash runway card
 *   3. Waiting on you (queued decisions with Y/Ask/N)
 *   4. Mid grid — Today queue + Today's calendar
 *   5. 14-day risk horizon (SVG timeline)
 *   6. Your builds row
 *   7. Operations strip
 *   8. Team strip
 */

"use client"

import Image from "next/image"
import Link from "next/link"
import "./today-v2.css"

export interface TodayViewProps {
    userName: string
}

type SourceTag = "forge" | "money" | "people" | "comms" | "compliance"

const SOURCE_TAG_CLASS: Record<SourceTag, string> = {
    forge: "t2-source-forge",
    money: "t2-source-money",
    people: "t2-source-people",
    comms: "t2-source-comms",
    compliance: "t2-source-compliance",
}

const SOURCE_TAG_LABEL: Record<SourceTag, string> = {
    forge: "Forge",
    money: "Money",
    people: "People",
    comms: "Comms",
    compliance: "Compliance",
}

function SourceBadge({ kind, extra }: { kind: SourceTag; extra?: string }) {
    return (
        <span className={`t2-source-tag ${SOURCE_TAG_CLASS[kind]}`}>
            {SOURCE_TAG_LABEL[kind]}
            {extra ? ` · ${extra}` : ""}
        </span>
    )
}

export function TodayView({ userName }: TodayViewProps) {
    const now = new Date()
    const weekdayDate = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    const clockTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

    const firstName = (userName || "there").split(" ")[0]

    const hour = now.getHours()
    const greetingWord = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"

    return (
        <div className="t2">
            <h1 className="t2-greeting">{greetingWord}, {firstName}</h1>
            <div className="t2-greeting-sub">
                {weekdayDate} · {clockTime}
                <span className="t2-chip danger"><span className="dot" /> 1 broke overnight</span>
                <span className="t2-chip warning"><span className="dot" /> 2 overdue</span>
                <span className="t2-chip info"><span className="dot" /> 3 waiting on you</span>
            </div>

            <div className="t2-headline-grid">
                <div className="t2-priority">
                    <div className="t2-kicker-row">
                        <span className="t2-kicker">🔴 Blocking — #1 today</span>
                        <SourceBadge kind="forge" extra="HAPS UAV" />
                    </div>
                    <h2>Astra&apos;s AS9100 cert expired in February — blocking 2 wing-spar awards (£860).</h2>
                    <p>
                        Chase ran the check this morning. Astra confirmed a re-audit on 12 June, so a <strong>6-week gap</strong> if you wait.
                        Zimmermann scored 65/100 on the same spec, AS9100 runs through 2027 — next-best pivot.
                    </p>
                    <div className="actions">
                        <Link href="#" className="t2-btn primary">Message Astra</Link>
                        <Link href="#" className="t2-btn">Promote Zimmermann</Link>
                        <Link href="#" className="t2-btn ghost">See all 4 open risks →</Link>
                    </div>
                    <div className="t2-grounding-line">Chase · 6 of 8 supplier fields · 14 Mar cert-registry cross-check</div>
                </div>

                <div className="t2-runway">
                    <div className="label">Cash runway</div>
                    <div className="big-num">11.4<small> months</small></div>
                    <div className="sub">At current burn £62k/mo · Series A target Oct 2026</div>
                    <div className="t2-runway-bar"><div className="fill" style={{ width: "72%" }} /></div>
                    <div className="t2-mini-stats">
                        <div className="s">
                            <div className="k">Burn this month</div>
                            <div className="v">£58.4k</div>
                        </div>
                        <div className="s">
                            <div className="k">HAPS commit (over)</div>
                            <div className="v" style={{ color: "var(--t-danger)" }}>£172k</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="t2-waiting-card">
                <div className="t2-waiting-head">
                    <div className="title">Waiting on you <span className="count">3</span></div>
                    <button type="button" className="t2-morning-nudge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        Send standup to team
                    </button>
                </div>

                <div className="t2-waiting-item">
                    <div className="avatar">JW</div>
                    <div className="body">
                        <span className="who">Jian (VP Eng)</span> — approve wing-spar tolerance ±0.3mm on final CAD? Full drawing linked.
                        <div className="meta">Queued 9:42pm yesterday · <SourceBadge kind="forge" /> · blocks Astra RFQ award</div>
                    </div>
                    <div className="decisions">
                        <Link href="#" className="t2-btn-y">Approve</Link>
                        <Link href="#" className="t2-btn-ask">Ask Jian</Link>
                        <Link href="#" className="t2-btn-n">Reject</Link>
                    </div>
                </div>

                <div className="t2-waiting-item">
                    <div className="avatar chase">CH</div>
                    <div className="body">
                        <span className="who">Chase (VP Supply)</span> — promote Zimmermann Precision to preferred supplier for wing-spar?
                        <div className="meta">Queued 6:14am · <SourceBadge kind="forge" /> · unblocks the Astra situation above</div>
                    </div>
                    <div className="decisions">
                        <Link href="#" className="t2-btn-y">Promote</Link>
                        <Link href="#" className="t2-btn-ask">Compare</Link>
                        <Link href="#" className="t2-btn-n">Reject</Link>
                    </div>
                </div>

                <div className="t2-waiting-item">
                    <div className="avatar fiona">FI</div>
                    <div className="body">
                        <span className="who">Fiona (Fundraising)</span> — send draft follow-up to Kirsty (Octopus Ventures, Series A lead)? 9 days since last contact, draft reads well.
                        <div className="meta">Queued 7:30am · <SourceBadge kind="money" /> · last 3 replies &lt;24h; silence = decaying interest</div>
                    </div>
                    <div className="decisions">
                        <Link href="#" className="t2-btn-y">Send</Link>
                        <Link href="#" className="t2-btn-ask">Revise</Link>
                        <Link href="#" className="t2-btn-n">Hold</Link>
                    </div>
                </div>
            </div>

            <div className="t2-mid-grid">
                <div className="t2-queue-card">
                    <div className="t2-queue-head">
                        <div className="title">Today</div>
                        <div className="t2-queue-filters">
                            <button type="button" className="active">All</button>
                            <button type="button">Forge</button>
                            <button type="button">Money</button>
                            <button type="button">People</button>
                            <button type="button">Compliance</button>
                        </div>
                    </div>

                    <QueueRow rank={1} title="Astra AS9100 expired" sub={<><SourceBadge kind="forge" /> · blocks wing-spar award (£860 × 2)</>} decay="-62 days" decayClass="overdue" action="Open →" />
                    <QueueRow rank={2} title="Kirsty (Octopus) follow-up overdue" sub={<><SourceBadge kind="money" /> · Series A lead · last reply 9 Apr</>} decay="-2 days" decayClass="overdue" action="Reply →" />
                    <QueueRow rank={3} title="ISO 27001 surveillance — book audit slot" sub={<><SourceBadge kind="compliance" /> · auditor requires 14-day notice</>} decay="14 days" decayClass="warn" action="Book →" />
                    <QueueRow rank={4} title="Cost breach — HAPS £22k over ceiling" sub={<><SourceBadge kind="forge" /> · decide whether to cut solar coverage or raise</>} decay="5 days" decayClass="warn" action="Open →" />
                    <QueueRow rank={5} title="Investor update (March) — 4 days overdue" sub={<><SourceBadge kind="comms" /> · draft ready, needs sign-off</>} decay="-4 days" decayClass="overdue" action="Review →" />
                    <QueueRow rank={6} title="Daniel (CTO) 1:1 — mass-budget sync" sub={<><SourceBadge kind="people" /> · standing 14:00 Mon</>} decay="Today 14:00" action="Prep →" />
                    <QueueRow rank={7} title="T-Motor propeller quote — review" sub={<><SourceBadge kind="forge" /> · 2 of 3 quotes back, still waiting on Hacker</>} decay="2 days" action="Review →" />
                </div>

                <div className="t2-calendar-card">
                    <h3>Today&apos;s calendar</h3>
                    <div className="t2-cal-item">
                        <div className="time now">09:30</div>
                        <div>
                            <div className="title">Kirsty call — Series A lead</div>
                            <div className="who">Octopus Ventures · 30 min</div>
                        </div>
                        <SourceBadge kind="money" />
                    </div>
                    <div className="t2-cal-item">
                        <div className="time">14:00</div>
                        <div>
                            <div className="title">Daniel 1:1</div>
                            <div className="who">Mass budget over on propulsion + empennage</div>
                        </div>
                        <SourceBadge kind="people" />
                    </div>
                    <div className="t2-cal-item">
                        <div className="time">16:00</div>
                        <div>
                            <div className="title">Supplier review (weekly)</div>
                            <div className="who">Chase dial-in · 45 min</div>
                        </div>
                        <SourceBadge kind="forge" />
                    </div>
                    <div className="t2-cal-tomorrow">
                        Tomorrow: <strong>3 calls · 1 review</strong>
                    </div>
                </div>
            </div>

            <div className="t2-horizon-card">
                <div className="t2-horizon-head">
                    <h3>14-day risk horizon</h3>
                    <div className="anchor">Anchor: <strong>HAPS first flight — 12 June</strong> · 5 items threaten the window</div>
                </div>
                <div className="t2-horizon-timeline-wrap">
                    <RiskHorizonSvg />
                </div>
            </div>

            <div className="t2-section-label">
                <h3>Your builds · 2 active · 1 shipped</h3>
                <div className="aside"><Link href="/the-forge-v2">Open Forge →</Link></div>
            </div>

            <div className="t2-builds-row">
                <Link href="#" className="t2-build-tile">
                    <div className="t2-build-tile-hero haps">
                        <Image src="/images/case-study-drone.png" alt="HAPS UAV render" fill sizes="(max-width: 900px) 100vw, 33vw" style={{ objectFit: "cover" }} />
                        <span className="state-pill blocking">1 blocking</span>
                        <span className="style-tag">Photoreal</span>
                    </div>
                    <div className="t2-build-tile-meta">
                        <h4>HAPS UAV</h4>
                        <div className="tag">High-altitude pseudo-satellite · 22m wing</div>
                        <div className="row">
                            <span><strong>£172k</strong> · over</span>
                            <span>•</span>
                            <span><strong>54d</strong> · to flight</span>
                        </div>
                    </div>
                </Link>

                <Link href="#" className="t2-build-tile">
                    <div className="t2-build-tile-hero drone">
                        <Image src="/cad-lab/templates/heavy-drone.png" alt="Atmos Drone v2 render" fill sizes="(max-width: 900px) 100vw, 33vw" style={{ objectFit: "cover" }} />
                        <span className="state-pill">on track</span>
                        <span className="style-tag">Photoreal</span>
                    </div>
                    <div className="t2-build-tile-meta">
                        <h4>Atmos Drone v2</h4>
                        <div className="tag">Survey quad · Lidar payload</div>
                        <div className="row">
                            <span><strong>£48k</strong> · on budget</span>
                            <span>•</span>
                            <span><strong>Modules</strong> stage</span>
                        </div>
                    </div>
                </Link>

                <Link href="/the-forge-v2/new" className="t2-build-tile new-build">
                    <div style={{ textAlign: "center", padding: "24px 20px" }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6 }}>
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <div>Start a new build</div>
                        <div style={{ fontSize: 11, color: "var(--t-fg-subtle)", marginTop: 3 }}>Brief → Modules → BOM</div>
                    </div>
                </Link>
            </div>

            <Link href="#" className="t2-footer-strip">
                <div className="body">
                    <strong>Operations</strong> · 2 products shipped · 7 active suppliers · 3 cert expiries next 30 days
                    <div className="meta">BOM Watch · Supplier Scorecards · Revisions · Compliance Calendar</div>
                </div>
                <div className="cta">Open Operations →</div>
            </Link>

            <Link href="#" className="t2-footer-strip">
                <div className="body">
                    <strong>Team</strong> · Daniel (CTO) · Priya (Ops) · Rita (Accounts, fractional) · 13 specialists on call
                    <div className="meta">Last sync posted 5:47pm Friday · 3 people waiting on you (above)</div>
                </div>
                <div className="cta">Open Team →</div>
            </Link>
        </div>
    )
}

function QueueRow({
    rank,
    title,
    sub,
    decay,
    decayClass,
    action,
}: {
    rank: number
    title: string
    sub: React.ReactNode
    decay: string
    decayClass?: "overdue" | "warn"
    action: string
}) {
    return (
        <div className="t2-queue-row">
            <div className="rank">{rank}</div>
            <div className="label">
                {title}
                <div className="sub">{sub}</div>
            </div>
            <div className={`decay ${decayClass ?? ""}`}>{decay}</div>
            <Link href="#" className="go-btn">{action}</Link>
        </div>
    )
}

function RiskHorizonSvg() {
    return (
        <svg viewBox="0 0 1200 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="20" y1="78" x2="1180" y2="78" stroke="#e7e5e4" strokeWidth="1.5" />

            <g fontFamily="-apple-system, Inter, sans-serif" fontSize="10" fill="#a8a29e" textAnchor="middle">
                <g transform="translate(20,0)"><line y1="73" y2="83" stroke="#d6d3d1" /><text y="105">Sat 19</text></g>
                <g transform="translate(103,0)"><text y="105" fontWeight="700" fill="#1c1917">Sun 20</text></g>
                <g transform="translate(186,0)"><line y1="73" y2="83" stroke="#d6d3d1" /><text y="105">Mon 21</text></g>
                <g transform="translate(269,0)"><text y="105">Tue 22</text></g>
                <g transform="translate(352,0)"><line y1="73" y2="83" stroke="#d6d3d1" /><text y="105">Wed 23</text></g>
                <g transform="translate(435,0)"><text y="105">Thu 24</text></g>
                <g transform="translate(518,0)"><line y1="73" y2="83" stroke="#d6d3d1" /><text y="105">Fri 25</text></g>
                <g transform="translate(601,0)"><text y="105">Sat 26</text></g>
                <g transform="translate(684,0)"><line y1="73" y2="83" stroke="#d6d3d1" /><text y="105">Sun 27</text></g>
                <g transform="translate(767,0)"><text y="105">Mon 28</text></g>
                <g transform="translate(850,0)"><line y1="73" y2="83" stroke="#d6d3d1" /><text y="105">Tue 29</text></g>
                <g transform="translate(933,0)"><text y="105">Wed 30</text></g>
                <g transform="translate(1016,0)"><line y1="73" y2="83" stroke="#d6d3d1" /><text y="105">Thu 1</text></g>
                <g transform="translate(1099,0)"><text y="105">Fri 2</text></g>
            </g>

            <g transform="translate(20,0)">
                <line y1="30" y2="78" stroke="#ff4500" strokeWidth="2" />
                <circle cy="78" r="5" fill="#ff4500" />
                <rect x="-20" y="12" width="40" height="18" rx="4" fill="#ff4500" />
                <text x="0" y="25" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">TODAY</text>
            </g>

            <g transform="translate(186,0)">
                <circle cy="78" r="7" fill="#dc2626" stroke="#fff" strokeWidth="2" />
                <line y1="78" y2="50" stroke="#dc2626" strokeDasharray="2 2" />
                <rect x="-62" y="32" width="124" height="18" rx="3" fill="#dc2626" />
                <text x="0" y="45" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">Astra audit window</text>
            </g>

            <g transform="translate(269,0)">
                <circle cy="78" r="6" fill="#7c3aed" stroke="#fff" strokeWidth="2" />
                <line y1="78" y2="110" stroke="#7c3aed" strokeDasharray="2 2" />
                <rect x="-55" y="112" width="110" height="18" rx="3" fill="#7c3aed" />
                <text x="0" y="125" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">Kirsty reply SLA</text>
            </g>

            <g transform="translate(518,0)">
                <circle cy="78" r="6" fill="#ca8a04" stroke="#fff" strokeWidth="2" />
                <line y1="78" y2="50" stroke="#ca8a04" strokeDasharray="2 2" />
                <rect x="-58" y="32" width="116" height="18" rx="3" fill="#ca8a04" />
                <text x="0" y="45" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">ISO book-by deadline</text>
            </g>

            <g transform="translate(352,0)">
                <circle cy="78" r="5" fill="#ff4500" stroke="#fff" strokeWidth="2" />
                <line y1="78" y2="110" stroke="#ff4500" strokeDasharray="2 2" />
                <rect x="-48" y="112" width="96" height="18" rx="3" fill="#ff4500" />
                <text x="0" y="125" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">T-Motor quote</text>
            </g>

            <g transform="translate(933,0)">
                <circle cy="78" r="6" fill="#ff4500" stroke="#fff" strokeWidth="2" />
                <line y1="78" y2="50" stroke="#ff4500" strokeDasharray="2 2" />
                <rect x="-60" y="32" width="120" height="18" rx="3" fill="#ff4500" />
                <text x="0" y="45" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">MaxPV NDA expiry</text>
            </g>

            <g transform="translate(1180,0)">
                <line y1="30" y2="78" stroke="#16a34a" strokeWidth="2" />
                <circle cy="78" r="6" fill="#16a34a" stroke="#fff" strokeWidth="2" />
                <rect x="-64" y="12" width="64" height="18" rx="4" fill="#16a34a" />
                <text x="-32" y="25" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">FLIGHT +54d</text>
            </g>

            <g transform="translate(20,10)" fontFamily="Inter, sans-serif" fontSize="10">
                <g><circle cx="6" cy="3" r="4" fill="#dc2626" /><text x="15" y="6" fill="#1c1917">Critical</text></g>
                <g transform="translate(65,0)"><circle cx="6" cy="3" r="4" fill="#ff4500" /><text x="15" y="6" fill="#1c1917">Forge</text></g>
                <g transform="translate(118,0)"><circle cx="6" cy="3" r="4" fill="#7c3aed" /><text x="15" y="6" fill="#1c1917">Money</text></g>
                <g transform="translate(175,0)"><circle cx="6" cy="3" r="4" fill="#ca8a04" /><text x="15" y="6" fill="#1c1917">Compliance</text></g>
            </g>
        </svg>
    )
}
