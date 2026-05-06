import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { PdfCostWaterfallData, PdfAttribution } from "../../types/render-contracts";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";


interface CostWaterfallSectionProps {
    readonly costWaterfall: PdfCostWaterfallData;
    readonly attribution?: PdfAttribution;
    readonly sectionNumber: number;
}

/**
 * V3 dumb component — renders the cost waterfall section.
 *
 * Mirrors the V2 CostPage layout:
 *   - Stat tiles: unit cost, ceiling, headroom
 *   - Per-module roll-up table: module | cost | % of unit
 *
 * Zero logic — all values arrive pre-formatted from the enrichment
 * pipeline (Phase 03). The component never calls safeNumeric, fmtGbp,
 * or any other coercion helper.
 */
export function CostWaterfallSection({ costWaterfall, attribution, sectionNumber }: CostWaterfallSectionProps): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>{sectionNumber}. Cost waterfall</Text>
                {attribution && <DataAttribution {...attribution} />}
            </View>
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                Cost estimates derived from the module decomposition and the
                project&apos;s cost-estimate data. Per-module figures roll up to the
                unit cost shown on the cover page.
            </Text>

            {/* Stat tiles — unit cost, ceiling, headroom */}
            <View style={styles.statRow}>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>Unit cost (all-in)</Text>
                    <Text style={styles.statValue}>{costWaterfall.formattedUnitCost}</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>Ceiling (brief)</Text>
                    <Text style={styles.statValue}>{costWaterfall.formattedCeiling}</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>Headroom</Text>
                    <Text
                        style={
                            costWaterfall.isOverBudget
                                ? [styles.statValue, { color: "#B91C1C" }]
                                : styles.statValue
                        }
                    >
                        {costWaterfall.formattedHeadroom}
                    </Text>
                </View>
            </View>

            {/* Per-module roll-up table */}
            {costWaterfall.perModule.length > 0 ? (
                <>
                    <Text style={styles.h3}>Per-module roll-up</Text>
                    <View style={styles.table}>
                        <View style={styles.tableHead}>
                            <Text style={[styles.tableHeadCell, { flex: 3 }]}>Module</Text>
                            <Text style={[styles.tableHeadCell, { width: 70, textAlign: "right" }]}>Cost</Text>
                            <Text style={[styles.tableHeadCell, { width: 70, textAlign: "right" }]}>% of unit</Text>
                        </View>
                        {costWaterfall.perModule.map((entry, i) => (
                            <View key={i} style={styles.tableRow}>
                                <Text style={[styles.tableCell, { flex: 3 }]}>
                                    {entry.moduleName}
                                </Text>
                                <Text style={[styles.tableCell, { width: 70, textAlign: "right" }]}>
                                    {entry.formattedCost}
                                </Text>
                                <Text style={[styles.tableCell, { width: 70, textAlign: "right" }]}>
                                    {entry.formattedPctOfUnit}
                                </Text>
                            </View>
                        ))}
                    </View>
                </>
            ) : (
                <Text style={[styles.muted, { marginTop: 8 }]}>
                    No per-module cost data available yet.
                </Text>
            )}



            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            <PdfFooter label="Cost waterfall" />
        </Page>
    );
}
