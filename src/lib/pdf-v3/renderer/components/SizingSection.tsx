import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { PdfAttribution } from "../../types/render-contracts";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";


interface SizingSectionProps {
    readonly sheet: any;
    readonly sectionNumber: number;
    readonly attribution?: PdfAttribution;
}

export function SizingSection({
    sheet,
    sectionNumber,
    attribution,
}: SizingSectionProps): React.ReactElement | null {
    if (!sheet) return null;
    const opt = sheet.optimisation;
    const feasibleLabel = sheet.feasible ? "FEASIBLE" : "INFEASIBLE";
    const feasibleColor = sheet.feasible ? "#0a6a1a" : "#a3001a";
    const envelopeLine = `${sheet.envelope?.label} · interior ${sheet.envelope?.interior_w_mm}×${sheet.envelope?.interior_d_mm}×${sheet.envelope?.interior_h_mm}mm · ${Number(sheet.envelope?.interior_floor_m2 || 0).toFixed(2)} m² floor`;
    
    // Build the trial grid: rows = unique tier counts, columns = unique canopies
    const tierValues = Array.from(
        new Set((opt?.trials ?? []).map((t: any) => t.targets.tiers).filter((v: any): v is number => typeof v === "number")),
    ).sort((a: any, b: any) => a - b) as number[];
    const canopyValues = Array.from(
        new Set((opt?.trials ?? []).map((t: any) => t.targets.canopy_m2).filter((v: any): v is number => typeof v === "number")),
    ).sort((a: any, b: any) => a - b) as number[];
    const lookup = new Map<string, { feasible: boolean; utilization_pct: number }>();
    for (const t of opt?.trials ?? []) {
        lookup.set(`${t.targets.tiers}|${t.targets.canopy_m2}`, {
            feasible: t.feasible,
            utilization_pct: t.utilization_pct,
        });
    }

    const trialCount = (opt?.trials ?? []).length;
    const captionText = trialCount > 0
        ? `Forge ran a ${trialCount}-trial sweep to find the best fit for this envelope. Coefficient library: ${sheet.rules_domain} v${sheet.rules_version}.`
        : `Forge applied the ${sheet.rules_domain} v${sheet.rules_version} rules library — a closed-form deterministic solve (no trial sweep needed for this domain). Final target below was computed directly from the brief's capacity + envelope constraints.`;

    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>{sectionNumber}. Sizing optimisation</Text>
                {attribution && <DataAttribution {...attribution} />}
            </View>
            <Text style={styles.muted}>{captionText}</Text>
            
            {!sheet.feasible && (
                <View
                    style={{
                        marginTop: 8,
                        marginBottom: 10,
                        padding: 10,
                        backgroundColor: "#fee2e2",
                        borderLeftWidth: 4,
                        borderLeftColor: "#b91c1c",
                        borderRadius: 3,
                    }}
                    wrap={false}
                >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#7f1d1d", marginBottom: 4 }}>
                        INFEASIBLE DESIGN — The briefed target exceeds the selected envelope.
                    </Text>
                    <Text style={{ fontSize: 9, color: "#7f1d1d", marginBottom: 6 }}>
                        The solver could not fit the original target into the envelope. The configuration below is incomplete or over-capacity. Treat downstream dimensions, spatial plans, and costs as tentative until the brief is revised.
                    </Text>
                    {sheet.closest_feasible_alternate && (
                        <View style={{ marginTop: 2, padding: 6, backgroundColor: "#fef2f2", borderRadius: 2 }}>
                            <Text style={{ fontSize: 9, fontWeight: "bold", color: "#991b1b", marginBottom: 2 }}>
                                Closest feasible alternate the solver found:
                            </Text>
                            <Text style={{ fontSize: 9, color: "#991b1b", marginBottom: 2 }}>
                                {Object.entries(sheet.closest_feasible_alternate.target).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                            </Text>
                            <Text style={{ fontSize: 8.5, color: "#991b1b", fontStyle: "italic" }}>
                                {sheet.closest_feasible_alternate.delta_from_primary} · envelope: {sheet.closest_feasible_alternate.envelope.label}
                            </Text>
                        </View>
                    )}
                </View>
            )}

            <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>Envelope</Text>
                <Text style={{ fontSize: 10, marginBottom: 6 }}>{envelopeLine}</Text>
                <Text style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>Original target (from brief)</Text>
                <Text style={{ fontSize: 11, marginBottom: 6 }}>
                    {sheet.target ? Object.entries(sheet.target).map(([k, v]) => `${k}: ${v}`).join(" · ") : "No target data"}
                    <Text style={{ color: feasibleColor, fontWeight: "bold" }}> [{feasibleLabel}]</Text>
                </Text>
                {!sheet.feasible && !sheet.closest_feasible_alternate && (
                    <View
                        style={{
                            marginTop: 6,
                            marginBottom: 8,
                            padding: 8,
                            borderRadius: 4,
                            backgroundColor: "#fef3c7",
                            borderLeftWidth: 3,
                            borderLeftColor: "#a16207",
                        }}
                    >
                        <Text style={{ fontSize: 10, fontWeight: "bold", color: "#78350f" }}>
                            No feasible alternate found within the solver&apos;s envelope + target sweep. The brief targets and the chosen envelope can&apos;t be reconciled — the recommendations below are manual options.
                        </Text>
                    </View>
                )}
                {opt?.winner?.rationale && (
                    <Text style={{ fontSize: 10, fontStyle: "italic", color: "#444", marginBottom: 8 }}>
                        {opt.winner.rationale}
                    </Text>
                )}
            </View>

            {opt && tierValues.length > 0 && canopyValues.length > 0 && (
                <View style={{ marginBottom: 12 }} wrap={false}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>
                        Trial grid (rows = tiers, columns = canopy m² · cell = floor util %)
                    </Text>
                    <View style={{ flexDirection: "row", borderBottom: "1 solid #e5e5e5" }}>
                        <Text style={{ width: 40, fontSize: 9, fontWeight: "bold", padding: 4 }}>tiers ↓</Text>
                        {canopyValues.map((c) => (
                            <Text key={c} style={{ flex: 1, fontSize: 9, textAlign: "center", padding: 4, fontWeight: "bold" }}>
                                {c}
                            </Text>
                        ))}
                    </View>
                    {tierValues.map((t) => (
                        <View key={t} style={{ flexDirection: "row", borderBottom: "1 solid #f0f0f0" }}>
                            <Text style={{ width: 40, fontSize: 9, padding: 4, fontWeight: "bold" }}>{t}</Text>
                            {canopyValues.map((c) => {
                                const cell = lookup.get(`${t}|${c}`);
                                if (!cell) return (
                                    <Text key={c} style={{ flex: 1, fontSize: 9, textAlign: "center", padding: 4, color: "#ccc" }}>—</Text>
                                );
                                const isWinner =
                                    opt.winner?.targets.tiers === t && opt.winner?.targets.canopy_m2 === c;
                                const bg = !cell.feasible
                                    ? "#fee0dc"
                                    : cell.utilization_pct >= 90
                                        ? "#fff3cd"
                                        : cell.utilization_pct >= 60
                                            ? "#d4edda"
                                            : "#e8f5e9";
                                return (
                                    <View
                                        key={c}
                                        style={{
                                            flex: 1,
                                            backgroundColor: bg,
                                            padding: 4,
                                            borderRight: isWinner ? "2 solid #ff4500" : "1 solid #fff",
                                        }}
                                    >
                                        <Text style={{ fontSize: 9, textAlign: "center" }}>
                                            {cell.feasible ? `${Math.round(cell.utilization_pct)}%` : "✗"}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    ))}
                    <Text style={{ fontSize: 8, color: "#777", marginTop: 4 }}>
                        Green = comfortable fit · Yellow = tight (≥90% floor used) · Red = infeasible ·
                        Orange outline = winning config.
                    </Text>
                </View>
            )}
            
            {opt?.top_alternatives && opt.top_alternatives.length > 0 && (
                <View style={{ marginBottom: 10 }} wrap={false}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>Top alternatives</Text>
                    {opt.top_alternatives.map((alt: any, i: number) => (
                        <View key={i} style={{ marginBottom: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: "bold" }}>
                                {Object.entries(alt.targets).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                            </Text>
                            <Text style={{ fontSize: 9, color: "#555" }}>{alt.trade_offs}</Text>
                        </View>
                    ))}
                </View>
            )}
            
            {opt?.levers && opt.levers.length > 0 && (
                <View style={{ marginBottom: 10 }} wrap={false}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>
                        Levers — what you could do next
                    </Text>
                    {opt.levers.map((lv: any, i: number) => (
                        <View key={i} style={{ marginBottom: 5 }}>
                            <Text style={{ fontSize: 10, fontWeight: "bold" }}>{lv.action}</Text>
                            <Text style={{ fontSize: 9, color: "#0a6a1a" }}>Gain: {lv.gain}</Text>
                            <Text style={{ fontSize: 9, color: "#a3001a" }}>Cost: {lv.cost}</Text>
                        </View>
                    ))}
                </View>
            )}
            
            {Array.isArray(sheet.notes) && sheet.notes.length > 0 && (
                <View style={{ marginBottom: 10 }} wrap={false}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>Engineering notes</Text>
                    {sheet.notes.map((n: string, i: number) => (
                        <Text key={i} style={{ fontSize: 9, color: "#333", marginBottom: 3 }}>
                            • {n}
                        </Text>
                    ))}
                </View>
            )}



            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            <PdfFooter label="Sizing optimisation" />
        </Page>
    );
}
