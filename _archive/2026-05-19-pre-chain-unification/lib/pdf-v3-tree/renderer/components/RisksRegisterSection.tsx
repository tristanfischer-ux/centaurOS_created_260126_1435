import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { styles, MUTED } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { PdfRisksModuleData, PdfRiskEntry, PdfAttribution } from "../../types/render-contracts";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";


interface RisksRegisterSectionProps {
    readonly risks: ReadonlyArray<PdfRisksModuleData>;
    readonly attribution?: PdfAttribution;
    readonly sectionNumber: number;
}

/**
 * V3 dumb component — renders the risks register section.
 *
 * Mirrors the V2 RisksPage layout:
 *   - Per-module heading
 *   - Structured risk matrix entries (FMEA style) when present
 *   - Legacy failure modes and unknowns when no risk matrix
 *
 * Zero logic — all ratings, bands, and colours arrive pre-formatted
 * from the enrichment pipeline (Phase 03). The component never calls
 * riskRating(), severityLabel(), or any other computation helper.
 */
export function RisksRegisterSection({ risks, attribution, sectionNumber }: RisksRegisterSectionProps): React.ReactElement {
    const anyMatrix = risks.some((m) => m.riskEntries.length > 0);

    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>{sectionNumber}. Risks register</Text>
                {attribution && <DataAttribution {...attribution} />}
            </View>
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                {anyMatrix
                    ? "FMEA-style risk matrix per module. Each row is rated severity (Negligible / Minor / Moderate / Major / Catastrophic) \u00D7 likelihood (Rare / Unlikely / Possible / Likely / Frequent). Rating bands: low (1\u20133), medium (4\u20138), high (9\u201315), critical (16\u201325). Residual rating shows the band after the listed mitigation lands."
                    : "Every failure mode and open question declared against each module, in one register."}
            </Text>

            {risks.map((mod, modIdx) => (
                <View key={modIdx} style={{ marginTop: 10 }}>
                    <Text style={styles.h4}>{mod.moduleName}</Text>

                    {mod.riskEntries.length === 0 &&
                        mod.failureModes.length === 0 &&
                        mod.unknowns.length === 0 && (
                            <Text style={styles.muted}>No risks declared on this module.</Text>
                        )}

                    {/* Structured risk matrix entries */}
                    {mod.riskEntries.length > 0 && (
                        <View style={{ marginTop: 4 }}>
                            <Text style={styles.h5}>
                                Risk matrix ({mod.riskEntries.length})
                            </Text>
                            {mod.riskEntries.map((entry, i) => (
                                    <RiskMatrixRow key={entry.id || i} entry={entry} />
                            ))}
                        </View>
                    )}

                    {/* Legacy failure modes — shown when no structured risk matrix */}
                    {mod.riskEntries.length === 0 && mod.failureModes.length > 0 && (
                        <View style={{ marginTop: 4 }}>
                            <Text style={styles.h5}>
                                Known failure modes ({mod.failureModes.length})
                            </Text>
                            {mod.failureModes.map((f, i) => (
                                <View key={i} style={styles.bullet}>
                                    <Text style={styles.bulletDot}>{"\u2022"}</Text>
                                    <Text style={styles.bulletText}>{f}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Unknowns / open questions */}
                    {mod.unknowns.length > 0 && (
                        <View style={{ marginTop: 4 }}>
                            <Text style={styles.h5}>Open questions ({mod.unknowns.length})</Text>
                            {mod.unknowns.map((u, i) => (
                                <View key={i} style={styles.bullet}>
                                    <Text style={styles.bulletDot}>{"\u2022"}</Text>
                                    <Text style={styles.bulletText}>{u}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            ))}



            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            <PdfFooter label="Risks register" />
        </Page>
    );
}

/**
 * Single risk matrix row — FMEA entry with hazard, rating, cause,
 * consequence, mitigation, owner, and residual rating.
 */
function RiskMatrixRow({ entry }: { entry: PdfRiskEntry }): React.ReactElement {
    return (
        <View
            style={{
                marginBottom: 8,
                flexDirection: "row",
            }}
        >
            {/* Left border replacement */}
            <View style={{ width: 2, backgroundColor: entry.initialBandColor, marginRight: 4 }} />
            <View style={{ flex: 1 }}>
                {/* Hazard title + initial rating badge */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    marginBottom: 1,
                }}
            >
                <Text
                    style={{
                        fontSize: 10,
                        fontWeight: "bold",
                        flex: 1,
                        paddingRight: 6,
                    }}
                >
                    {entry.id}: {entry.hazard}
                </Text>
                <Text
                    style={{
                        fontSize: 9,
                        color: entry.initialBandColor,
                        fontWeight: "bold",
                        marginLeft: 6,
                        flexShrink: 0,
                    }}
                >
                    {entry.formattedInitialRating}
                </Text>
            </View>

            {/* Cause */}
            {entry.cause && (
                <Text style={{ fontSize: 9, marginBottom: 1 }}>
                    <Text style={{ fontWeight: "bold" }}>Cause: </Text>
                    {entry.cause}
                </Text>
            )}

            {/* Consequence */}
            {entry.consequence && (
                <Text style={{ fontSize: 9, marginBottom: 1 }}>
                    <Text style={{ fontWeight: "bold" }}>Consequence: </Text>
                    {entry.consequence}
                </Text>
            )}

            {/* Existing controls */}
            {entry.existingControls && (
                <Text style={{ fontSize: 9, marginBottom: 1 }}>
                    <Text style={{ fontWeight: "bold" }}>Existing controls: </Text>
                    {entry.existingControls}
                </Text>
            )}

            {/* Mitigation */}
            {entry.mitigation && (
                <Text style={{ fontSize: 9, marginBottom: 1 }}>
                    <Text style={{ fontWeight: "bold" }}>Mitigation: </Text>
                    {entry.mitigation}
                </Text>
            )}

            {/* Owner */}
            {entry.owner && (
                <Text style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>
                    Owner: {entry.owner}
                </Text>
            )}

            {/* Residual rating */}
            {entry.formattedResidualRating && entry.residualBandColor && (
                <Text
                    style={{
                        fontSize: 9,
                        color: entry.residualBandColor,
                        marginTop: 1,
                    }}
                >
                    Residual: {entry.formattedResidualRating}
                </Text>
            )}
            </View>
        </View>
    );
}
