/**
 * TodayView — V2 triage surface.
 *
 * Ported 1:1 from FORGE-MOCKUP-TODAY-V2.html. DOM structure, class names,
 * and layout match the mockup exactly. Content is now driven by real data
 * supplied via props from `page.tsx`. When a data source is unavailable
 * or empty, the same visual footprint renders with an empty-state — no
 * hardcoded mockup strings leak through.
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

import { useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import "./today-v2.css"

// ─── Prop types ──────────────────────────────────────────────────────

export type SourceTag = "forge" | "money" | "people" | "comms" | "compliance"

export interface PriorityAction {
    label: string
    href: string
    variant?: "primary" | "default" | "ghost"
}

export interface PrioritySlab {
    sourceTag: SourceTag
    sourceExtra?: string
    kicker: string
    title: string
    body: string
    actions: PriorityAction[]
    groundingLine: string | null
}

export interface QueueItem {
    rank: number
    id: string
    title: string
    subtitle: string
    source: SourceTag
    sourceExtra?: string
    decay: string
    decayClass?: "overdue" | "warn"
    action: string
    href: string
}

export interface CalendarItem {
    id: string
    time: string
    isNow: boolean
    title: string
    who: string
    source: SourceTag
    href?: string
}

export interface WaitingItem {
    id: string
    name: string
    initials: string
    avatarKind: "default" | "chase" | "fiona"
    ask: string
    meta: string
    queuedAt: string
    source: SourceTag
    actions: { yes: string; ask: string; no: string }
}

export interface MilestoneMarker {
    id: string
    title: string
    date: string
    severity: "critical" | "forge" | "money" | "compliance" | "info"
}

export interface BuildTile {
    id: string
    name: string
    subtitle: string
    heroUrl: string | null
    statePill: "on track" | "1 blocking" | "at risk"
    costLabel: string | null
    daysToFlight: number | null
    href: string
}

export interface TeamMemberBrief {
    name: string
    role: string
}

export interface TeamSummary {
    topMembers: TeamMemberBrief[]
    totalCount: number
    specialistCount: number
    lastActivityAt: string | null
}

export interface OperationsSummary {
    shippedProducts: number
    activeSuppliers: number
    certExpiriesNext30d: number | null
}

export interface TodayViewProps {
    userName: string
    signals: {
        brokeOvernightCount: number
        overdueCount: number
        waitingCount: number
    }
    priority: PrioritySlab | null
    runway: {
        runwayMonths: number | null
        burnThisMonthPence: number | null
        biggestCostPence: number | null
        currency: string
    }
    waiting: {
        items: WaitingItem[]
        totalCount: number
    }
    queue: QueueItem[]
    calendar: {
        items: CalendarItem[]
        tomorrowCount: number
        connected: boolean
        hasEvents: boolean
    }
    horizon: {
        anchorTitle: string | null
        anchorDate: string | null
        markers: MilestoneMarker[]
    }
    builds: {
        tiles: BuildTile[]
        hasAny: boolean
    }
    operations: OperationsSummary
    team: TeamSummary | null
}

// ─── Small helpers ───────────────────────────────────────────────────

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

function formatPence(pence: number | null, currency: string): string {
    if (pence === null) return "—"
    const pounds = pence / 100
    const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : ""
    if (pounds >= 1000) {
        return `${symbol}${(pounds / 1000).toFixed(1)}k`
    }
    return `${symbol}${pounds.toFixed(0)}`
}

function formatRelativeTime(iso: string): string {
    const then = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - then.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return "just now"
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay === 1) return "yesterday"
    if (diffDay < 7) return `${diffDay}d ago`
    return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function avatarClass(kind: "default" | "chase" | "fiona"): string {
    if (kind === "chase") return "avatar chase"
    if (kind === "fiona") return "avatar fiona"
    return "avatar"
}

// ─── Main component ──────────────────────────────────────────────────

export function TodayView(props: TodayViewProps) {
    const { userName, signals, priority, runway, waiting, queue, calendar, horizon, builds, operations, team } = props

    const now = new Date()
    const weekdayDate = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    const clockTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

    const firstName = (userName || "there").split(" ")[0]

    const hour = now.getHours()
    const greetingWord = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"

    // Queue filter (client-only state; source tabs).
    const [queueFilter, setQueueFilter] = useState<"all" | SourceTag>("all")
    const filteredQueue = useMemo(
        () => (queueFilter === "all" ? queue : queue.filter(q => q.source === queueFilter)),
        [queueFilter, queue],
    )

    // ── Empty-state detection ────────────────────────────────────────
    // True only when every data source on the page is empty — no priority
    // surfaced, no builds, no queue, no waiting items, no calendar events,
    // no horizon anchor, no runway number. If ANY one of these is populated
    // we fall through to the standard populated view so partial-data states
    // never get hidden behind the empty shell.
    const isEmptyDay =
        priority === null &&
        !builds.hasAny &&
        queue.length === 0 &&
        waiting.totalCount === 0 &&
        !calendar.hasEvents &&
        horizon.anchorTitle === null &&
        runway.runwayMonths === null

    if (isEmptyDay) {
        return (
            <div className="t2">
                <h1 className="t2-greeting">
                    <span className="t2-title-dot" aria-hidden="true" />
                    {greetingWord}, {firstName} — let&apos;s get going.
                </h1>
                <div className="t2-greeting-sub">
                    {weekdayDate} · {clockTime} · setup done · nothing queued yet
                </div>

                {/* Priority slab replacement */}
                <div className="t2-prio-empty">
                    <div className="illus" aria-hidden="true">◈</div>
                    <div className="body">
                        <div className="k">Priority</div>
                        <h2>No priorities yet — start your first project</h2>
                        <p>
                            Priorities appear when risks fire, suppliers miss SLAs, or a readiness gap
                            becomes the blocker. Until there&apos;s a project or product in flight,
                            there&apos;s nothing to prioritise.
                        </p>
                        <Link href="/the-forge-v2/new" className="cta">Start a project →</Link>
                        <Link href="/the-forge-v2" className="cta-secondary">or validate a hypothesis first</Link>
                    </div>
                </div>

                {/* Runway + Waiting row */}
                <div className="t2-empty-row-2">
                    <div className="t2-empty-card">
                        <div className="k">Runway <span className="soon-badge">Soon</span></div>
                        <div className="stub-big">—</div>
                        <div className="msg">
                            Connect Cash Burn (Xero) to see runway, burn rate, and the cash horizon.
                            Manual entry opens when the integration ships.
                        </div>
                        <Link href="/money" className="action-link">Enter manually →</Link>
                    </div>
                    <div className="t2-empty-card">
                        <div className="k">Waiting on you</div>
                        <div className="placeholder-line">Nothing queued yet</div>
                        <div className="msg">
                            Your team&apos;s asks, supplier questions, and partner replies appear here.
                            Connect Gmail to pull in external threads.
                        </div>
                        <Link href="/settings/integrations" className="action-link">Connect Gmail →</Link>
                    </div>
                </div>

                {/* Today queue + Calendar + Risk horizon */}
                <div className="t2-empty-row-3">
                    <div className="t2-empty-card">
                        <div className="k">Today queue</div>
                        <div className="placeholder-line">No items</div>
                        <div className="msg">
                            As you tag objectives, book meetings, or raise risks, this fills up.
                            It&apos;s your single work queue across Plan, Forge, and Cash Burn.
                        </div>
                    </div>
                    <div className="t2-empty-card">
                        <div className="k">Calendar peek</div>
                        <div className="placeholder-line">Calendar not connected</div>
                        <div className="msg">
                            Your day&apos;s meetings show here with a 2-line prep summary per call.
                        </div>
                        <Link href="/settings/integrations" className="action-link">Connect Google Calendar →</Link>
                    </div>
                    <div className="t2-empty-card">
                        <div className="k">14-day risk horizon</div>
                        <div className="placeholder-line">Set a launch date to activate</div>
                        <div className="msg">
                            The horizon shows every risk that could bite between now and ship day.
                            Set a target launch to switch it on.
                        </div>
                        <Link href="/plan" className="action-link">Set launch date →</Link>
                    </div>
                </div>

                {/* Builds band */}
                <div className="t2-builds-band">
                    <h3>Your builds</h3>
                    <Link href="/the-forge-v2/new" className="t2-new-build-tile">
                        <div className="plus" aria-hidden="true">+</div>
                        <h4>Start a new build</h4>
                        <p>Hardware project · BOM, suppliers, cost, risks all linked. 4-step wizard, 5 minutes.</p>
                    </Link>
                </div>

                {/* Ops + Team */}
                <div className="t2-empty-strips">
                    <div className="t2-strip-card">
                        <div className="ic" aria-hidden="true">📦</div>
                        <div className="sb-body">
                            <h4>Operations</h4>
                            <p>Activates after your first shipment. Tracks fulfilment, RMAs, uptime, and customer support.</p>
                        </div>
                    </div>
                    <div className="t2-strip-card">
                        <div className="ic" aria-hidden="true">👥</div>
                        <div className="sb-body">
                            <h4>Your team</h4>
                            <p>Invite co-founders, engineers, or advisors to see them here.</p>
                        </div>
                        <Link href="/settings/team" className="sb-action">Invite →</Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="t2">
            <h1 className="t2-greeting">
                <span className="t2-title-dot" aria-hidden="true" />
                {greetingWord}, {firstName}
            </h1>
            <div className="t2-greeting-sub">
                {weekdayDate} · {clockTime}
                {/* Broke-overnight chip: either a count or an "all clear" pill */}
                {signals.brokeOvernightCount > 0 ? (
                    <span className="t2-chip danger">
                        <span className="dot" /> {signals.brokeOvernightCount} broke overnight
                    </span>
                ) : (
                    <span className="t2-chip info">
                        <span className="dot" /> All clear overnight
                    </span>
                )}
                {/* Overdue chip — omitted when 0 */}
                {signals.overdueCount > 0 && (
                    <span className="t2-chip warning">
                        <span className="dot" /> {signals.overdueCount} overdue
                    </span>
                )}
                {/* Waiting chip — omitted when 0 */}
                {signals.waitingCount > 0 && (
                    <span className="t2-chip info">
                        <span className="dot" /> {signals.waitingCount} waiting on you
                    </span>
                )}
            </div>

            <div className="t2-headline-grid">
                {/* Priority slab */}
                {priority ? (
                    <div className="t2-priority">
                        <div className="t2-kicker-row">
                            <span className="t2-kicker">{priority.kicker}</span>
                            <SourceBadge kind={priority.sourceTag} extra={priority.sourceExtra} />
                        </div>
                        <h2>{priority.title}</h2>
                        <p>{priority.body}</p>
                        <div className="actions">
                            {priority.actions.map((a, idx) => (
                                <Link
                                    key={`${a.label}-${idx}`}
                                    href={a.href}
                                    className={`t2-btn${a.variant === "primary" ? " primary" : a.variant === "ghost" ? " ghost" : ""}`}
                                >
                                    {a.label}
                                </Link>
                            ))}
                        </div>
                        {priority.groundingLine && (
                            <div className="t2-grounding-line">{priority.groundingLine}</div>
                        )}
                    </div>
                ) : (
                    <div className="t2-priority" style={{ borderLeftColor: "var(--t-border)" }}>
                        <div className="t2-kicker-row">
                            <span className="t2-kicker">No blocking items</span>
                        </div>
                        <h2>No blocking items today</h2>
                        <p>Your specialists haven&apos;t surfaced anything urgent.</p>
                        <div className="actions">
                            <Link href="/the-forge-v2" className="t2-btn">Browse your projects →</Link>
                        </div>
                    </div>
                )}

                {/* Runway card */}
                <div className="t2-runway">
                    <div className="label">Cash runway</div>
                    {runway.runwayMonths !== null ? (
                        <>
                            <div className="big-num">
                                {runway.runwayMonths.toFixed(1)}<small> months</small>
                            </div>
                            <div className="sub">
                                {runway.burnThisMonthPence !== null
                                    ? `At current burn ${formatPence(runway.burnThisMonthPence, runway.currency)}/mo`
                                    : "Burn unavailable"}
                            </div>
                            <div className="t2-runway-bar">
                                <div className="fill" style={{ width: `${Math.min(100, (runway.runwayMonths / 18) * 100)}%` }} />
                            </div>
                            <div className="t2-mini-stats">
                                <div className="s" style={runway.biggestCostPence === null ? { gridColumn: "1 / span 2" } : undefined}>
                                    <div className="k">Burn this month</div>
                                    <div className="v">{formatPence(runway.burnThisMonthPence, runway.currency)}</div>
                                </div>
                                {runway.biggestCostPence !== null && (
                                    <div className="s">
                                        <div className="k">Biggest commit</div>
                                        <div className="v">{formatPence(runway.biggestCostPence, runway.currency)}</div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="big-num">
                                —<small> months</small>
                            </div>
                            <div className="sub">
                                Connect finance in <Link href="/money">Money · Cockpit →</Link>
                            </div>
                            <div className="t2-runway-bar"><div className="fill" style={{ width: "0%" }} /></div>
                            <div className="t2-mini-stats">
                                <div className="s" style={{ gridColumn: "1 / span 2" }}>
                                    <div className="k">Burn this month</div>
                                    <div className="v">—</div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Waiting on you */}
            <div className="t2-waiting-card">
                <div className="t2-waiting-head">
                    <div className="title">Waiting on you <span className="count">{waiting.totalCount}</span></div>
                    <button type="button" className="t2-morning-nudge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        Send standup to team
                    </button>
                </div>

                {waiting.items.length > 0 ? (
                    waiting.items.map(item => (
                        <div key={item.id} className="t2-waiting-item">
                            <div className={avatarClass(item.avatarKind)}>{item.initials}</div>
                            <div className="body">
                                <span className="who">{item.name}</span> — {item.ask}
                                <div className="meta">
                                    Queued {formatRelativeTime(item.queuedAt)} · <SourceBadge kind={item.source} /> · {item.meta}
                                </div>
                            </div>
                            <div className="decisions">
                                <Link href="#" className="t2-btn-y">{item.actions.yes}</Link>
                                <Link href="#" className="t2-btn-ask">{item.actions.ask}</Link>
                                <Link href="#" className="t2-btn-n">{item.actions.no}</Link>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="t2-waiting-item">
                        <div className="body" style={{ textAlign: "center" }}>
                            <span className="who">Nothing waiting on you right now.</span>
                            <div className="meta">Specialists queue decisions here when they need your input.</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Mid grid: queue + calendar */}
            <div className="t2-mid-grid">
                <div className="t2-queue-card">
                    <div className="t2-queue-head">
                        <div className="title">Today</div>
                        <div className="t2-queue-filters">
                            <button type="button" className={queueFilter === "all" ? "active" : ""} onClick={() => setQueueFilter("all")}>All</button>
                            <button type="button" className={queueFilter === "forge" ? "active" : ""} onClick={() => setQueueFilter("forge")}>Forge</button>
                            <button type="button" className={queueFilter === "money" ? "active" : ""} onClick={() => setQueueFilter("money")}>Money</button>
                            <button type="button" className={queueFilter === "people" ? "active" : ""} onClick={() => setQueueFilter("people")}>People</button>
                            <button type="button" className={queueFilter === "compliance" ? "active" : ""} onClick={() => setQueueFilter("compliance")}>Compliance</button>
                        </div>
                    </div>

                    {filteredQueue.length > 0 ? (
                        filteredQueue.map((item) => (
                            <QueueRow
                                key={item.id}
                                rank={item.rank}
                                title={item.title}
                                sub={<><SourceBadge kind={item.source} extra={item.sourceExtra} /> · {item.subtitle}</>}
                                decay={item.decay}
                                decayClass={item.decayClass}
                                action={item.action}
                                href={item.href}
                            />
                        ))
                    ) : (
                        <div className="t2-queue-row">
                            <div className="label" style={{ textAlign: "center" }}>
                                Clear queue. You&apos;re ahead.
                            </div>
                        </div>
                    )}
                </div>

                <div className="t2-calendar-card">
                    <h3>Today&apos;s calendar</h3>
                    {calendar.hasEvents ? (
                        calendar.items.map(ev => (
                            <div key={ev.id} className="t2-cal-item">
                                <div className={ev.isNow ? "time now" : "time"}>{ev.time}</div>
                                <div>
                                    <div className="title">{ev.title}</div>
                                    <div className="who">{ev.who}</div>
                                </div>
                                <SourceBadge kind={ev.source} />
                            </div>
                        ))
                    ) : (
                        <div className="t2-cal-item">
                            <div>
                                <div className="title">
                                    {calendar.connected ? "No events today" : "Google Calendar not connected"}
                                </div>
                                <div className="who">
                                    {calendar.connected
                                        ? "Your day is clear."
                                        : <>Connect in <Link href="/settings/integrations">settings → integrations →</Link></>}
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="t2-cal-tomorrow">
                        {calendar.tomorrowCount > 0
                            ? <>Tomorrow: <strong>{calendar.tomorrowCount} event{calendar.tomorrowCount === 1 ? "" : "s"}</strong></>
                            : "Tomorrow: no meetings"}
                    </div>
                </div>
            </div>

            {/* Risk horizon */}
            <div className="t2-horizon-card">
                <div className="t2-horizon-head">
                    <h3>14-day risk horizon</h3>
                    {horizon.anchorTitle && horizon.anchorDate ? (
                        <div className="anchor">
                            Anchor: <strong>
                                {horizon.anchorTitle} — {new Date(horizon.anchorDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </strong>
                            {horizon.markers.length > 0 && <> · {horizon.markers.length} item{horizon.markers.length === 1 ? "" : "s"} in window</>}
                        </div>
                    ) : (
                        <div className="anchor">
                            No anchor milestone set — set your flight date in <Link href="/plan">Strategy → /plan</Link>
                        </div>
                    )}
                </div>
                {horizon.anchorTitle ? (
                    <div className="t2-horizon-timeline-wrap">
                        <RiskHorizonSvg markers={horizon.markers} />
                    </div>
                ) : null}
            </div>

            {/* Builds */}
            <div className="t2-section-label">
                <h3>
                    Your builds · {builds.tiles.length} active
                </h3>
                <div className="aside"><Link href="/the-forge-v2">Open Forge →</Link></div>
            </div>

            <div className="t2-builds-row">
                {builds.hasAny ? (
                    <>
                        {builds.tiles.map(tile => (
                            <Link key={tile.id} href={tile.href} className="t2-build-tile">
                                <div className="t2-build-tile-hero haps">
                                    {tile.heroUrl ? (
                                        <Image
                                            src={tile.heroUrl}
                                            alt={`${tile.name} render`}
                                            fill
                                            sizes="(max-width: 900px) 100vw, 33vw"
                                            style={{ objectFit: "cover" }}
                                        />
                                    ) : null}
                                    <span className={`state-pill${tile.statePill === "1 blocking" ? " blocking" : ""}`}>
                                        {tile.statePill}
                                    </span>
                                </div>
                                <div className="t2-build-tile-meta">
                                    <h4>{tile.name}</h4>
                                    <div className="tag">{tile.subtitle}</div>
                                    <div className="row">
                                        <span>
                                            {tile.costLabel ? <><strong>{tile.costLabel}</strong> · cost</> : <><strong>—</strong> · cost</>}
                                        </span>
                                        <span>•</span>
                                        <span>
                                            {tile.daysToFlight !== null ? <><strong>{tile.daysToFlight}d</strong> · to flight</> : <><strong>—</strong> · to flight</>}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))}
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
                    </>
                ) : (
                    <Link href="/the-forge-v2/new" className="t2-build-tile new-build" style={{ gridColumn: "1 / -1" }}>
                        <div style={{ textAlign: "center", padding: "48px 20px" }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>Start your first build</div>
                            <div style={{ fontSize: 12, color: "var(--t-fg-subtle)", marginTop: 4 }}>Brief → Modules → BOM</div>
                        </div>
                    </Link>
                )}
            </div>

            {/* Operations strip */}
            <Link href="/the-forge-v2" className="t2-footer-strip">
                <div className="body">
                    <strong>Operations</strong> · {operations.shippedProducts} product{operations.shippedProducts === 1 ? "" : "s"} shipped · {operations.activeSuppliers} active supplier{operations.activeSuppliers === 1 ? "" : "s"}
                    {operations.certExpiriesNext30d !== null && (
                        <> · {operations.certExpiriesNext30d} cert expir{operations.certExpiriesNext30d === 1 ? "y" : "ies"} next 30 days</>
                    )}
                    <div className="meta">BOM Watch · Supplier Scorecards · Revisions · Compliance Calendar</div>
                </div>
                <div className="cta">Open Operations →</div>
            </Link>

            {/* Team strip */}
            {team && team.topMembers.length > 0 ? (
                <Link href="/settings/team" className="t2-footer-strip">
                    <div className="body">
                        <strong>Team</strong> · {team.topMembers.map(m => `${m.name}${m.role ? ` (${m.role})` : ""}`).join(" · ")} · {team.specialistCount} specialists on call
                        <div className="meta">
                            {team.lastActivityAt
                                ? `Last team activity ${formatRelativeTime(team.lastActivityAt)}`
                                : "No recent team activity"}
                            {waiting.totalCount > 0 && ` · ${waiting.totalCount} waiting on you (above)`}
                        </div>
                    </div>
                    <div className="cta">Open Team →</div>
                </Link>
            ) : (
                <Link href="/settings/team" className="t2-footer-strip">
                    <div className="body">
                        <strong>Team</strong> · No team yet
                        <div className="meta">Invite your first teammate to unlock specialist briefings and standups.</div>
                    </div>
                    <div className="cta">Invite one →</div>
                </Link>
            )}
        </div>
    )
}

// ─── Sub-components ──────────────────────────────────────────────────

function QueueRow({
    rank,
    title,
    sub,
    decay,
    decayClass,
    action,
    href,
}: {
    rank: number
    title: string
    sub: React.ReactNode
    decay: string
    decayClass?: "overdue" | "warn"
    action: string
    href: string
}) {
    return (
        <div className="t2-queue-row">
            <div className="rank">{rank}</div>
            <div className="label">
                {title}
                <div className="sub">{sub}</div>
            </div>
            <div className={`decay ${decayClass ?? ""}`}>{decay}</div>
            <Link href={href} className="go-btn">{action}</Link>
        </div>
    )
}

/**
 * Renders the 14-day risk horizon SVG. Static day axis + dynamic markers.
 *
 * Only the "TODAY" anchor and "FLIGHT" end-cap are drawn unconditionally;
 * all other markers come from `markers` (milestones within the 14-day
 * window). When no markers are passed we still show the timeline +
 * today pin so the layout doesn't collapse.
 */
function RiskHorizonSvg({ markers }: { markers: MilestoneMarker[] }) {
    const now = new Date()
    const days: { label: string; xOffset: number; major: boolean; isToday: boolean }[] = []
    for (let i = 0; i < 14; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() + i)
        days.push({
            label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
            xOffset: 20 + i * 83,
            major: i % 2 === 0,
            isToday: i === 0,
        })
    }

    const severityColor: Record<MilestoneMarker["severity"], string> = {
        critical: "#dc2626",
        forge: "#ff4500",
        money: "#7c3aed",
        compliance: "#ca8a04",
        info: "#3b82f6",
    }

    return (
        <svg viewBox="0 0 1200 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="20" y1="78" x2="1180" y2="78" stroke="#e7e5e4" strokeWidth="1.5" />

            <g fontFamily="-apple-system, Inter, sans-serif" fontSize="10" fill="#a8a29e" textAnchor="middle">
                {days.map((d, idx) => (
                    <g key={idx} transform={`translate(${d.xOffset},0)`}>
                        {d.major && <line y1="73" y2="83" stroke="#d6d3d1" />}
                        <text y="105" fontWeight={d.isToday ? 700 : 400} fill={d.isToday ? "#1c1917" : undefined}>{d.label}</text>
                    </g>
                ))}
            </g>

            {/* TODAY anchor */}
            <g transform="translate(20,0)">
                <line y1="30" y2="78" stroke="#ff4500" strokeWidth="2" />
                <circle cy="78" r="5" fill="#ff4500" />
                <rect x="-20" y="12" width="40" height="18" rx="4" fill="#ff4500" />
                <text x="0" y="25" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">TODAY</text>
            </g>

            {/* Dynamic markers */}
            {markers.map(m => {
                const daysOut = Math.floor((new Date(m.date).getTime() - now.getTime()) / 86400000)
                if (daysOut < 0 || daysOut > 13) return null
                const x = 20 + daysOut * 83
                const color = severityColor[m.severity]
                const label = m.title.length > 18 ? `${m.title.slice(0, 15)}...` : m.title
                return (
                    <g key={m.id} transform={`translate(${x},0)`}>
                        <circle cy="78" r="6" fill={color} stroke="#fff" strokeWidth="2" />
                        <line y1="78" y2="50" stroke={color} strokeDasharray="2 2" />
                        <rect x="-58" y="32" width="116" height="18" rx="3" fill={color} />
                        <text x="0" y="45" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">{label}</text>
                    </g>
                )
            })}

            {/* Legend */}
            <g transform="translate(20,10)" fontFamily="Inter, sans-serif" fontSize="10">
                <g><circle cx="6" cy="3" r="4" fill="#dc2626" /><text x="15" y="6" fill="#1c1917">Critical</text></g>
                <g transform="translate(65,0)"><circle cx="6" cy="3" r="4" fill="#ff4500" /><text x="15" y="6" fill="#1c1917">Forge</text></g>
                <g transform="translate(118,0)"><circle cx="6" cy="3" r="4" fill="#7c3aed" /><text x="15" y="6" fill="#1c1917">Money</text></g>
                <g transform="translate(175,0)"><circle cx="6" cy="3" r="4" fill="#ca8a04" /><text x="15" y="6" fill="#1c1917">Compliance</text></g>
            </g>
        </svg>
    )
}
