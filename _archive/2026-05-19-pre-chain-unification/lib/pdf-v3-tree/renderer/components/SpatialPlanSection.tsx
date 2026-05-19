import React from "react";
import { Page, View, Text, Svg, Rect, Line, Polygon, Image, Circle } from "@react-pdf/renderer";
import { styles, MUTED, INK, BORDER } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { PdfAttribution } from "../../types/render-contracts";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";


interface SpatialPlanSectionProps {
    readonly plan: any;
    readonly sectionNumber: number;
    readonly moduleNameById: Map<string, string>;
    readonly imageDataUri: string | null;
    readonly attribution?: PdfAttribution;
}

function mountColours(
    mount: string,
): { fill: string; stroke: string; dashed: boolean } {
    switch (mount) {
        case "floor":
            return { fill: "#e5e7eb", stroke: "#6b7280", dashed: false };
        case "wall":
            return { fill: "#dbeafe", stroke: "#2563eb", dashed: false };
        case "ceiling":
            return { fill: "#fed7aa", stroke: "#ea580c", dashed: true };
        case "envelope":
        default:
            return { fill: "transparent", stroke: "#111827", dashed: false };
    }
}

function featureStyle(
    kind: string,
): { stroke: string; fill: string; strokeDasharray?: string } {
    switch (kind) {
        case "aisle":
            return { stroke: "#9ca3af", fill: "none", strokeDasharray: "4 3" };
        case "door":
            return { stroke: "#ea580c", fill: "#ffedd5" };
        case "vent":
            return { stroke: "#0ea5e9", fill: "none", strokeDasharray: "1 2" };
        case "access_panel":
            return { stroke: "#16a34a", fill: "none", strokeDasharray: "2 2" };
        case "cable_tray":
            return { stroke: "#a855f7", fill: "none" };
        case "pipe_run":
            return { stroke: "#0891b2", fill: "none" };
        case "wall":
            return { stroke: "#111827", fill: "none" };
        case "structural_column":
        default:
            return { stroke: "#374151", fill: "#d1d5db" };
    }
}

export function SpatialPlanSection({
    plan,
    sectionNumber,
    moduleNameById,
    imageDataUri,
    attribution,
}: SpatialPlanSectionProps): React.ReactElement | null {
    if (!plan) return null;

    const env = plan.envelope;
    const view = plan.view;

    const labelFor = (p: any): string =>
        p.label_override ?? moduleNameById.get(p.module_id) ?? p.module_id;

    const fmtDateTime = (iso: string | null | undefined): string => {
        if (!iso) return "\u2014";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        return d.toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const header = (
        <View style={styles.sectionHeaderRow}>
            <Text style={styles.h2Text}>
                {sectionNumber}. Spatial plan — {env.label}
            </Text>
            {attribution && <DataAttribution {...attribution} />}
        </View>
    );

    const is2D = view === "top_down" || view === "side_elevation";

    const DRAWING_W_PT = 450;
    const axisInsetPt = 14;

    const envelopeX_mm = env.interior_w_mm;
    const envelopeY_mm = view === "top_down" ? env.interior_d_mm : env.interior_h_mm;

    const scale = envelopeX_mm > 0 ? DRAWING_W_PT / envelopeX_mm : 1;
    const drawingW = DRAWING_W_PT;
    const drawingH = Math.max(40, envelopeY_mm * scale);
    const svgH = drawingH + axisInsetPt * 2;

    const toSvgX = (x_mm: number): number => axisInsetPt + x_mm * scale;
    const toSvgY = (y_mm: number, size_mm: number): number =>
        axisInsetPt + (envelopeY_mm - y_mm - size_mm) * scale;
    const toSvgPtY = (y_mm: number): number =>
        axisInsetPt + (envelopeY_mm - y_mm) * scale;

    const sizeAlongY = (p: any): number => (view === "top_down" ? p.d_mm : p.h_mm);
    const sizeAlongX = (p: any): number => p.w_mm;
    const originOnY = (p: any): number => (view === "top_down" ? p.y_mm : (p.z_mm ?? 0));

    const drawingStack = (() => {
        const rows = [...plan.placements].sort((a: any, b: any) => {
            const za = a.layer ?? a.z_mm ?? 0;
            const zb = b.layer ?? b.z_mm ?? 0;
            return zb - za;
        });
        if (rows.length === 0) return null;
        return (
            <View
                style={{
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 3,
                    padding: 8,
                    marginBottom: 10,
                }}
            >
                {rows.map((p, i) => (
                    <View
                        key={`sk-${i}`}
                        style={{
                            flexDirection: "row",
                            paddingVertical: 5,
                            borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
                            borderBottomColor: BORDER,
                            backgroundColor:
                                mountColours(p.mount).fill === "transparent"
                                    ? undefined
                                    : mountColours(p.mount).fill,
                        }}
                    >
                        <Text style={{ width: 40, fontSize: 9, fontWeight: "bold", color: MUTED }}>
                            {p.layer != null ? `L${p.layer}` : `z=${Math.round(p.z_mm ?? 0)}`}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 9, fontWeight: "bold" }}>
                            {labelFor(p)}
                        </Text>
                        <Text style={{ width: 110, fontSize: 8, color: MUTED }}>
                            {Math.round(p.w_mm)}×{Math.round(p.d_mm)}×{Math.round(p.h_mm)} mm
                        </Text>
                        <Text style={{ width: 60, fontSize: 8, color: MUTED }}>
                            {p.mount}
                        </Text>
                    </View>
                ))}
            </View>
        );
    })();

    const axisCaption = is2D ? (
        <View style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 1 }}>
                X — envelope length, mm (0 → {envelopeX_mm})
            </Text>
            <Text style={{ fontSize: 8.5, color: MUTED }}>
                Y — {view === "top_down" ? "envelope depth" : "envelope height"},
                mm (0 → {envelopeY_mm})
            </Text>
        </View>
    ) : null;

    const legend = (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 8 }}>
            {[
                { label: "Floor-mounted", mount: "floor" },
                { label: "Wall-mounted", mount: "wall" },
                { label: "Ceiling-mounted (above)", mount: "ceiling" },
                { label: "Envelope", mount: "envelope" },
            ].map((item) => {
                const c = mountColours(item.mount);
                return (
                    <View key={item.mount} style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 2 }}>
                        <View
                            style={{
                                width: 10,
                                height: 8,
                                borderWidth: 0.8,
                                borderColor: c.stroke,
                                backgroundColor: c.fill === "transparent" ? undefined : c.fill,
                                borderStyle: c.dashed ? "dashed" : "solid",
                                marginRight: 4,
                            }}
                        />
                        <Text style={{ fontSize: 8, color: INK }}>{item.label}</Text>
                    </View>
                );
            })}
        </View>
    );

    const placementsTable = (
        <View style={{ flex: 1, paddingRight: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>Placements</Text>
            {plan.placements.length === 0 ? (
                <Text style={{ fontSize: 9, color: MUTED, fontStyle: "italic" }}>
                    No placements — this rules library authored features only.
                </Text>
            ) : (
                <>
                    <View style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER, paddingBottom: 2, marginBottom: 2 }}>
                        <Text style={{ flex: 1.6, fontSize: 7.5, fontWeight: "bold", color: MUTED }}>Module</Text>
                        <Text style={{ width: 34, fontSize: 7.5, fontWeight: "bold", color: MUTED }}>Mount</Text>
                        <Text style={{ width: 74, fontSize: 7.5, fontWeight: "bold", color: MUTED }}>W×D×H mm</Text>
                        <Text style={{ width: 70, fontSize: 7.5, fontWeight: "bold", color: MUTED }}>x,y,z mm</Text>
                        <Text style={{ width: 40, fontSize: 7.5, fontWeight: "bold", color: MUTED, textAlign: "right" }}>Rotation °</Text>
                    </View>
                    {plan.placements.map((p: any, i: number) => (
                        <View key={`pt-${i}`} style={{ flexDirection: "row", paddingVertical: 1.5 }}>
                            <Text style={{ flex: 1.6, fontSize: 8 }}>{labelFor(p)}</Text>
                            <Text style={{ width: 34, fontSize: 8 }}>{p.mount}</Text>
                            <Text style={{ width: 74, fontSize: 8 }}>
                                {Math.round(p.w_mm)}×{Math.round(p.d_mm)}×{Math.round(p.h_mm)}
                            </Text>
                            <Text style={{ width: 70, fontSize: 8 }}>
                                {Math.round(p.x_mm)},{Math.round(p.y_mm)},{Math.round(p.z_mm ?? 0)}
                            </Text>
                            <Text style={{ width: 26, fontSize: 8, textAlign: "right" }}>{Math.round(p.orientation_deg)}</Text>
                        </View>
                    ))}
                </>
            )}
        </View>
    );

    const constraintsList = (
        <View style={{ flex: 1, paddingLeft: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>Constraints</Text>
            {plan.constraints.length === 0 ? (
                <Text style={{ fontSize: 9, color: MUTED, fontStyle: "italic" }}>No constraints recorded.</Text>
            ) : (
                plan.constraints.map((c: any, i: number) => {
                    const aName = moduleNameById.get(c.a) ?? c.a;
                    const bName = moduleNameById.get(c.b) ?? c.b;
                    const range = c.min_mm != null && c.max_mm != null
                        ? `${c.min_mm}–${c.max_mm}mm`
                        : c.min_mm != null ? `min ${c.min_mm}mm`
                        : c.max_mm != null ? `max ${c.max_mm}mm`
                        : "—";
                    return (
                        <View key={`c-${i}`} style={{ marginBottom: 3 }}>
                            <Text style={{ fontSize: 8.5 }}>
                                <Text style={{ fontWeight: "bold" }}>{c.kind}</Text>: {aName} ↔ {bName} · {range}
                            </Text>
                            {c.reason && <Text style={{ fontSize: 7.5, color: MUTED, marginLeft: 6 }}>{c.reason}</Text>}
                        </View>
                    );
                })
            )}
        </View>
    );

    const OVERFLOW_NOTE_RE = /overflows?\s+envelope\s+by\s+([\d,]+)\s*mm/i;
    const overflowAnnotations = (plan.notes ?? []).filter((n: string) => OVERFLOW_NOTE_RE.test(n));
    const hasOverflow = overflowAnnotations.length > 0;

    return (
        <Page size="A4" style={styles.page} wrap>
            {header}
            <Text style={[styles.muted, { marginBottom: 6 }]}>
                {view}, plan_type={plan.plan_type}, authored by {plan.authored_by},
                generated {fmtDateTime(plan.generated_at)} ({plan.rules_domain} v{plan.rules_version})
            </Text>

            {hasOverflow && (
                <View
                    style={{
                        marginTop: 8,
                        marginBottom: 8,
                        padding: 10,
                        backgroundColor: "#fee2e2",
                        borderLeftWidth: 4,
                        borderLeftColor: "#b91c1c",
                        borderRadius: 3,
                    }}
                    wrap={false}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7f1d1d" }}>
                        Spatial plan does not fit briefed envelope — placements exceed enclosure.
                    </Text>
                    <Text style={{ fontSize: 9, color: "#7f1d1d", marginTop: 3 }}>
                        The layout engine flagged overflow(s) below. Treat all downstream dimensions, costs, and supplier shortlists as tentative until the brief envelope or module dimensions are revised to resolve the conflicts.
                    </Text>
                    {overflowAnnotations.slice(0, 4).map((n: string, i: number) => (
                        <Text key={`ov-${i}`} style={{ fontSize: 8.5, color: "#7f1d1d", marginTop: 2 }}>
                            • {n}
                        </Text>
                    ))}
                </View>
            )}

            {plan.placements.length === 0 && (
                <View
                    style={{
                        borderWidth: 1,
                        borderColor: BORDER,
                        borderStyle: "dashed",
                        padding: 12,
                        marginTop: 6,
                        marginBottom: 10,
                    }}
                >
                    <Text style={{ fontSize: 10, color: MUTED }}>
                        No placements — envelope outline only. The rules library
                        produced features or constraints but no module was matched.
                    </Text>
                </View>
            )}

            {is2D && imageDataUri ? (
                <>
                    {axisCaption}
                    <View wrap={false} style={{ marginBottom: 8 }}>
                        <Image src={imageDataUri} style={{ width: "100%", height: "auto" }} />
                    </View>
                    {legend}
                </>
            ) : (
                drawingStack
            )}

            <View style={{ flexDirection: "row", marginTop: 4, marginBottom: 8 }} wrap={false}>
                {placementsTable}
                {constraintsList}
            </View>

            {plan.notes && plan.notes.length > 0 && (
                <View wrap={false}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>Notes</Text>
                    {plan.notes.map((n: string, i: number) => (
                        <Text key={`n-${i}`} style={{ fontSize: 9, color: "#333", marginBottom: 2 }}>
                            • {n}
                        </Text>
                    ))}
                </View>
            )}



            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            <PdfFooter label="Spatial plan" />
        </Page>
    );
}
