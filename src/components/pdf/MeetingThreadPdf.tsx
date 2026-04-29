/**
 * @file MeetingThreadPdf.tsx
 *
 * @description react-pdf/renderer document component for a brainstorming
 * council transcript. Produces an A4 portrait PDF with:
 *
 *   Page 1 — Cover: full-bleed cover infographic (raster PNG) at top,
 *             session question as large headline, meta line.
 *   Page 2+ — Transcript: one block per meeting_entry in council order
 *             (Cal framing, Round 1 specialists, Round 2 peer-updates,
 *             Cal close), separated by thin horizontal rules.
 *   Every page — Footer: "Fractional Forge · ForgeOS · <date> · Page N of M"
 *
 * GOTCHA (from MEMORY.md forgeos_pdf_and_supplier_gotchas):
 *   @react-pdf/renderer SVG renders opaque black even with explicit white
 *   backgrounds. NEVER use <Svg> / <Rect> / <Line> for decorative elements
 *   here. All horizontal rules are <View> with a top border. The cover
 *   image is passed as a data URL (base64 or object URL) to <Image src=>,
 *   which handles raster PNG correctly.
 *
 * @related
 *   src/actions/meeting-thread-pdf.ts — server action that fetches data,
 *     renders this component, uploads to Storage and returns a signed URL.
 */

import React from "react"
import {
    Document,
    Page,
    View,
    Text,
    Image,
    StyleSheet,
} from "@react-pdf/renderer"
import type { MeetingEntryRow } from "@/actions/meeting-threads"

// ─── Brand tokens ──────────────────────────────────────────────────────────────

const BRAND         = "#ff4500" // International Orange
const INK           = "#292524" // Charcoal body text
const MUTED         = "#78716c" // stone-500
const SOFT          = "#a8a29e" // stone-400
const BG_PAGE       = "#fff7ef" // warm cream
const BORDER        = "#e7e5e4" // stone-200
const TIER_COLOURS: Record<string, string> = {
    quick:    "#3b82f6", // electric blue
    full:     "#8b5cf6", // violet
    deep:     "#0891b2", // cyan-600
    strategy: "#ff4500", // international orange
}

// ─── Tier & position labels ────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
    quick:    "Quick Council",
    full:     "Full Council",
    deep:     "Deep Council",
    strategy: "Strategy Council",
}

const POSITION_LABELS: Record<string, string> = {
    opener:       "Opener",
    reactor:      "Reactor",
    deep:         "Deep Dive",
    "host-close": "Host Close",
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    // ── Pages ───────────────────────────────
    page: {
        backgroundColor: BG_PAGE,
        paddingLeft: 48,
        paddingRight: 48,
        paddingTop: 48,
        paddingBottom: 56,
        fontSize: 9.5,
        lineHeight: 1.5,
        color: INK,
        fontFamily: "Helvetica",
    },

    // ── Cover page ──────────────────────────
    coverImage: {
        width: "100%",
        // Fixed height gives the cover image its visual weight.
        // A4 content area is ~498pt wide at 48pt horizontal margins.
        // 16:9 at that width = ~280pt. Use 260pt to leave breathing room.
        height: 260,
        marginBottom: 0,
        objectFit: "cover",
    },
    coverImagePlaceholder: {
        width: "100%",
        height: 180,
        backgroundColor: "#f5f0eb",
        marginBottom: 0,
    },
    coverBody: {
        paddingTop: 32,
    },
    coverQuestion: {
        fontSize: 22,
        fontWeight: "bold",
        color: INK,
        lineHeight: 1.3,
        marginBottom: 16,
        fontFamily: "Times-Roman",
    },
    coverMeta: {
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        marginBottom: 8,
    },
    coverMetaText: {
        fontSize: 9,
        color: MUTED,
    },
    tierPill: {
        fontSize: 8,
        color: "white",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 3,
    },

    // ── Transcript page ──────────────────────
    sectionHeader: {
        fontSize: 10,
        fontWeight: "bold",
        color: BRAND,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 14,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: BRAND,
    },

    // ── Entry block ──────────────────────────
    entryBlock: {
        marginBottom: 18,
    },
    entryByline: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 5,
        flexWrap: "wrap",
    },
    entrySpecialistName: {
        fontSize: 10,
        fontWeight: "bold",
        color: INK,
    },
    entryTitle: {
        fontSize: 8.5,
        color: MUTED,
    },
    entryPositionPill: {
        fontSize: 7.5,
        color: BRAND,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 3,
        borderWidth: 1,
        borderColor: BRAND,
    },
    entryRoundPill: {
        fontSize: 7.5,
        color: MUTED,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 3,
        borderWidth: 1,
        borderColor: BORDER,
    },
    entryContent: {
        fontSize: 9.5,
        color: INK,
        lineHeight: 1.55,
    },
    // Horizontal rule between entries — View with top border, NO SVG.
    entryDivider: {
        borderTopWidth: 1,
        borderTopColor: BORDER,
        marginTop: 16,
        marginBottom: 0,
    },

    // ── Founder question block ────────────────
    founderBlock: {
        marginBottom: 18,
        paddingLeft: 10,
        borderLeftWidth: 2,
        borderLeftColor: BRAND,
    },
    founderLabel: {
        fontSize: 8.5,
        fontWeight: "bold",
        color: BRAND,
        marginBottom: 4,
    },
    founderContent: {
        fontSize: 9.5,
        color: INK,
        lineHeight: 1.55,
    },

    // ── Footer ──────────────────────────────
    footer: {
        position: "absolute",
        left: 48,
        right: 48,
        bottom: 20,
        fontSize: 8,
        color: SOFT,
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 1,
        borderTopColor: BORDER,
        paddingTop: 4,
    },
})

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MeetingThreadPdfProps {
    /** Thread topic / question — rendered as the cover headline */
    topic: string
    /** Council tier key */
    councilTier: string
    /** Number of specialist attendees */
    specialistCount: number
    /** ISO date string — session date displayed on cover + footer */
    createdAt: string
    /** All entries in council order */
    entries: MeetingEntryRow[]
    /**
     * Cover infographic PNG as a base64 data URL.
     * e.g. "data:image/png;base64,..."
     * Passed through directly to <Image src=>.
     * Null when the cover has not been generated yet — shows a placeholder.
     *
     * IMPORTANT: do NOT use an SVG background behind this. See gotcha comment
     * at the top of this file.
     */
    coverImageDataUrl: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format ISO date string as "28 April 2026" */
function formatDate(iso: string): string {
    try {
        const d = new Date(iso)
        return d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
        })
    } catch {
        return iso
    }
}

// ─── Footer component ─────────────────────────────────────────────────────────

function PdfFooter({ sessionDate }: { sessionDate: string }): React.ReactElement {
    return (
        <View style={styles.footer} fixed>
            <Text>Fractional Forge · ForgeOS · {sessionDate}</Text>
            <Text
                render={({ pageNumber, totalPages }) =>
                    `Page ${pageNumber} of ${totalPages}`
                }
            />
        </View>
    )
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function CoverPage({
    topic,
    councilTier,
    specialistCount,
    createdAt,
    coverImageDataUrl,
}: Omit<MeetingThreadPdfProps, "entries">): React.ReactElement {
    const tierLabel = TIER_LABELS[councilTier] ?? councilTier
    const tierColour = TIER_COLOURS[councilTier] ?? BRAND
    const sessionDate = formatDate(createdAt)

    return (
        <Page size="A4" style={styles.page}>
            {/* Cover infographic — raster PNG, not SVG. This is intentional.
                See MEMORY.md forgeos_pdf_and_supplier_gotchas: SVG renders as
                solid black in react-pdf; always use raster <Image>. */}
            {coverImageDataUrl ? (
                <Image src={coverImageDataUrl} style={styles.coverImage} />
            ) : (
                <View style={styles.coverImagePlaceholder} />
            )}

            <View style={styles.coverBody}>
                {/* Session question */}
                <Text style={styles.coverQuestion}>{topic}</Text>

                {/* Meta row */}
                <View style={styles.coverMeta}>
                    <View style={[styles.tierPill, { backgroundColor: tierColour }]}>
                        <Text>{tierLabel}</Text>
                    </View>
                    <Text style={styles.coverMetaText}>
                        {specialistCount} specialist{specialistCount !== 1 ? "s" : ""}
                    </Text>
                    <Text style={styles.coverMetaText}>·</Text>
                    <Text style={styles.coverMetaText}>{sessionDate}</Text>
                </View>
            </View>

            <PdfFooter sessionDate={sessionDate} />
        </Page>
    )
}

// ─── Entry block ──────────────────────────────────────────────────────────────

function EntryBlock({
    entry,
    showDivider,
}: {
    entry: MeetingEntryRow
    showDivider: boolean
}): React.ReactElement {
    if (entry.role === "founder") {
        return (
            <View style={styles.founderBlock}>
                <Text style={styles.founderLabel}>You</Text>
                <Text style={styles.founderContent}>{entry.content}</Text>
                {showDivider && <View style={styles.entryDivider} />}
            </View>
        )
    }

    const positionLabel = entry.councilPosition
        ? (POSITION_LABELS[entry.councilPosition] ?? entry.councilPosition)
        : null

    return (
        <View style={styles.entryBlock}>
            {/* Byline */}
            <View style={styles.entryByline}>
                {entry.specialistName && (
                    <Text style={styles.entrySpecialistName}>
                        {entry.specialistName}
                    </Text>
                )}
                {positionLabel && (
                    <View style={styles.entryPositionPill}>
                        <Text>{positionLabel}</Text>
                    </View>
                )}
                <View style={styles.entryRoundPill}>
                    <Text>Round {entry.roundNumber}</Text>
                </View>
            </View>

            {/* Body */}
            <Text style={styles.entryContent}>{entry.content}</Text>

            {/* Divider — View with top border, not SVG */}
            {showDivider && <View style={styles.entryDivider} />}
        </View>
    )
}

// ─── Transcript pages ─────────────────────────────────────────────────────────

function TranscriptPages({
    entries,
    sessionDate,
}: {
    entries: MeetingEntryRow[]
    sessionDate: string
}): React.ReactElement {
    return (
        <Page size="A4" style={styles.page}>
            <Text style={styles.sectionHeader}>Council Transcript</Text>

            {entries.map((entry, idx) => (
                <EntryBlock
                    key={entry.id}
                    entry={entry}
                    showDivider={idx < entries.length - 1}
                />
            ))}

            <PdfFooter sessionDate={sessionDate} />
        </Page>
    )
}

// ─── Document root ────────────────────────────────────────────────────────────

/**
 * MeetingThreadPdf — root react-pdf Document component.
 *
 * @description Pass to `pdf(<MeetingThreadPdf {...props} />).toBlob()` and
 * convert the blob to a Buffer for upload. Do NOT use renderToStream in a
 * serverless context — it opens a readable stream that may not finish before
 * the Vercel function returns. Use the blob → arrayBuffer → Buffer pattern
 * (same as export-project-pdf.tsx).
 */
export function MeetingThreadPdf(props: MeetingThreadPdfProps): React.ReactElement {
    const sessionDate = formatDate(props.createdAt)

    // Split entries into manageable chunks per page.
    // react-pdf doesn't auto-paginate within a single Page's <View> tree for
    // text wrapping — it DOES paginate automatically when content overflows,
    // but there is a practical render-budget concern if we dump 30+ entries
    // into a single Page element.
    //
    // Strategy: render ALL entries in a single <Page> and rely on react-pdf's
    // built-in overflow pagination. This is the same approach as
    // export-project-pdf.tsx for its BOM master table. The only caveat is that
    // react-pdf uses YogaLayout internally and handles overflow across pages.
    //
    // If we ever hit Yoga layout issues with very long sessions, chunk into
    // multiple <Page> elements of ~15 entries each. For now, keep it simple.

    return (
        <Document>
            <CoverPage
                topic={props.topic}
                councilTier={props.councilTier}
                specialistCount={props.specialistCount}
                createdAt={props.createdAt}
                coverImageDataUrl={props.coverImageDataUrl}
            />
            <TranscriptPages
                entries={props.entries}
                sessionDate={sessionDate}
            />
        </Document>
    )
}
