import { StyleSheet } from "@react-pdf/renderer"

export const BRAND = "#ea580c" // International-orange adjacent
export const INK = "#1f2937"
export const MUTED = "#6b7280"
export const SOFT = "#9ca3af"
export const BORDER = "#e5e7eb"
export const BG_SOFT = "#f9fafb"

export const styles = StyleSheet.create({
    // ── Pages ───────────────────────────────
    page: {
        padding: 36,
        paddingTop: 48,
        paddingBottom: 56,
        fontSize: 9.5,
        lineHeight: 1.45,
        color: INK,
    },
    cover: {
        padding: 0,
        color: INK,
        fontSize: 11,
        lineHeight: 1.5,
    },
    coverBand: {
        backgroundColor: BRAND,
        minHeight: 140,
        width: "100%",
        paddingLeft: 48,
        paddingRight: 48,
        paddingTop: 42,
        paddingBottom: 24,
        color: "white",
    },
    coverBandTitle: { fontSize: 28, fontWeight: "bold", color: "white", marginBottom: 18, lineHeight: 1.2 },
    coverBandSub: { fontSize: 11, color: "white", opacity: 0.9, marginTop: 4 },
    coverBody: { padding: 48 },
    coverGridRow: { flexDirection: "row", marginBottom: 4 },
    coverGridLabel: { width: 160, color: MUTED, fontSize: 10 },
    coverGridValue: { flex: 1, fontSize: 10 },

    // ── Typography ──────────────────────────
    h1: { fontSize: 22, marginBottom: 4, fontWeight: "bold" },
    sectionHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 0,
        marginBottom: 10,
        borderBottomWidth: 2,
        borderBottomColor: BRAND,
        paddingBottom: 4,
    },
    h2Text: {
        fontSize: 16,
        fontWeight: "bold",
        color: BRAND,
    },
    h2: {
        fontSize: 16,
        marginTop: 0,
        marginBottom: 10,
        fontWeight: "bold",
        color: BRAND,
        borderBottomWidth: 2,
        borderBottomColor: BRAND,
        paddingBottom: 4,
    },
    h3: { fontSize: 13, marginTop: 14, marginBottom: 6, fontWeight: "bold", color: INK },
    h4: { fontSize: 11, marginTop: 10, marginBottom: 4, fontWeight: "bold", color: INK },
    h5: { fontSize: 10, marginTop: 6, marginBottom: 3, fontWeight: "bold", color: MUTED, textTransform: "uppercase" },
    muted: { color: MUTED },
    soft: { color: SOFT, fontSize: 8.5 },
    small: { fontSize: 8.5, color: MUTED },
    para: { marginBottom: 6 },

    // ── Layout helpers ──────────────────────
    hr: { borderBottomWidth: 1, borderBottomColor: BORDER, marginTop: 6, marginBottom: 10 },
    row: { flexDirection: "row", marginBottom: 5 },
    rowLabel: { width: 140, fontWeight: "bold", paddingRight: 8 },
    rowValue: { flex: 1 },
    pill: {
        fontSize: 8,
        color: "white",
        backgroundColor: BRAND,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 3,
        alignSelf: "flex-start",
    },
    pillMuted: {
        fontSize: 8,
        color: MUTED,
        backgroundColor: BG_SOFT,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 3,
        alignSelf: "flex-start",
        borderWidth: 1,
        borderColor: BORDER,
    },
    statRow: { flexDirection: "row", gap: 14, marginBottom: 10 },
    stat: { flex: 1, padding: 8, backgroundColor: BG_SOFT, borderRadius: 4 },
    statLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", marginBottom: 2 },
    statValue: { fontSize: 14, fontWeight: "bold" },

    // ── Lists ───────────────────────────────
    bullet: { flexDirection: "row", marginBottom: 2, paddingLeft: 4 },
    bulletDot: { width: 8, color: BRAND, fontSize: 9 },
    bulletText: { flex: 1 },

    // ── Module card ─────────────────────────
    moduleHead: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 4,
    },
    moduleName: { fontSize: 13, fontWeight: "bold", flex: 1 },
    moduleMeta: { fontSize: 9, color: MUTED, textAlign: "right" },
    moduleImage: {
        width: "100%",
        height: 260,
        marginTop: 6,
        marginBottom: 6,
        objectFit: "contain",
    },
    moduleImageEmpty: {
        height: 80,
        backgroundColor: BG_SOFT,
        borderRadius: 4,
        marginTop: 6,
        marginBottom: 6,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#e5e7eb",
    },
    imageDisclaimer: {
        fontSize: 8,
        color: MUTED,
        fontStyle: "italic",
        textAlign: "center",
        marginTop: -2,
        marginBottom: 8,
    },
    coverImage: {
        width: "100%",
        height: 340,
        marginTop: 14,
        objectFit: "contain",
    },

    // ── Tables ──────────────────────────────
    table: { marginTop: 4 },
    tableHead: {
        flexDirection: "row",
        backgroundColor: BG_SOFT,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
        paddingVertical: 4,
        paddingHorizontal: 2,
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
        paddingVertical: 3,
        paddingHorizontal: 2,
    },
    tableHeadCell: { fontSize: 8, fontWeight: "bold", color: MUTED, textTransform: "uppercase" },
    tableCell: { fontSize: 8.5 },

    // ── Footer ──────────────────────────────
    footer: {
        position: "absolute",
        left: 36,
        right: 36,
        bottom: 22,
        fontSize: 8,
        color: SOFT,
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 1,
        borderTopColor: BORDER,
        paddingTop: 4,
    },
})
