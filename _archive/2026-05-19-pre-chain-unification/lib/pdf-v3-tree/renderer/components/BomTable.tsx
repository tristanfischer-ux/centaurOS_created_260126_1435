import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { styles, MUTED } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { PdfBomData, PdfAttribution } from "../../types/render-contracts";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";


interface BomTableProps {
    readonly bom: ReadonlyArray<PdfBomData>;
    readonly attribution?: PdfAttribution;
    readonly sectionNumber: number;
}

const NULL_PLACEHOLDER = "\u2014";

function fmtGbp(n: number | null | undefined): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return NULL_PLACEHOLDER;
    return `\u00A3${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

function fmtKg(n: number | null | undefined): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return NULL_PLACEHOLDER;
    return `${n.toFixed(2)} kg`;
}

/**
 * V3 dumb component — renders the bill of materials as a full-page table.
 *
 * Hierarchical grouping by module. Explicit Buy/Make column.
 */
export function BomTable({ bom, attribution, sectionNumber }: BomTableProps): React.ReactElement {
    // Group by sourceModuleName
    const groupedBom = new Map<string, PdfBomData[]>();
    for (const row of bom) {
        const modName = row.sourceModuleName ?? "Unassigned";
        if (!groupedBom.has(modName)) {
            groupedBom.set(modName, []);
        }
        groupedBom.get(modName)!.push(row);
    }
    
    // Sort modules (Unassigned at the end usually)
    const sortedModules = Array.from(groupedBom.keys()).sort((a, b) => {
        if (a === "Unassigned") return 1;
        if (b === "Unassigned") return -1;
        return a.localeCompare(b);
    });

    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>
                    {sectionNumber}. BOM master ({bom.length} rows)
                </Text>
                {attribution && <DataAttribution {...attribution} />}
            </View>
            <Text style={[styles.muted, { marginBottom: 6, fontSize: 9 }]}>
                BOM derived from the module decomposition, expanded into typed
                part rows. Grouped by source module.
            </Text>

            {bom.length === 0 ? (
                <Text style={styles.muted}>No parts generated yet.</Text>
            ) : (
                <View style={styles.table}>
                    <View style={styles.tableHead}>
                        <Text style={[styles.tableHeadCell, { width: 65 }]}>Part #</Text>
                        <Text style={[styles.tableHeadCell, { flex: 2.5 }]}>Name</Text>
                        <Text style={[styles.tableHeadCell, { width: 45 }]}>Buy/Make</Text>
                        <Text style={[styles.tableHeadCell, { flex: 1.5 }]}>Process / material</Text>
                        <Text style={[styles.tableHeadCell, { width: 56, textAlign: "right", paddingRight: 8 }]}>Mass</Text>
                        <Text style={[styles.tableHeadCell, { width: 60, textAlign: "right", paddingRight: 12 }]}>Cost</Text>
                    </View>

                    {sortedModules.map(modName => {
                        const rows = groupedBom.get(modName)!;
                        return (
                            <React.Fragment key={modName}>
                                <View style={[styles.tableRow, { backgroundColor: "#f3f4f6" }]}>
                                    <Text style={[styles.tableCell, { fontWeight: "bold", flex: 1 }]}>
                                        {modName} ({rows.length} parts)
                                    </Text>
                                </View>
                                {rows.map((row, i) => (
                                    <View key={`${modName}-${i}`} style={styles.tableRow}>
                                        <Text style={[styles.tableCell, { width: 65 }]}>
                                            {row.partNumber}
                                        </Text>
                                        <Text style={[styles.tableCell, { flex: 2.5 }]}>
                                            {row.name}
                                            {row.description ? (
                                                <Text style={{ color: MUTED }}>{" \u2014 " + row.description}</Text>
                                            ) : null}
                                        </Text>
                                        <Text style={[styles.tableCell, { width: 45 }]}>
                                            {row.isPurchased ? "Buy" : "Make"}
                                        </Text>
                                        <Text style={[styles.tableCell, { flex: 1.5 }]}>
                                            {row.isPurchased
                                                ? NULL_PLACEHOLDER
                                                : [row.process, row.material].filter((s) => s && s !== "Unknown").join(" \u00B7 ") || NULL_PLACEHOLDER}
                                        </Text>
                                        <Text style={[styles.tableCell, { width: 56, textAlign: "right", paddingRight: 8 }]}>
                                            {fmtKg(row.massKg)}
                                        </Text>
                                        <Text style={[styles.tableCell, { width: 60, textAlign: "right", paddingRight: 12 }]}>
                                            {fmtGbp(row.estimatedUnitCostGbp)}
                                        </Text>
                                    </View>
                                ))}
                            </React.Fragment>
                        );
                    })}
                </View>
            )}

            {/* Summary footer */}
            {bom.length > 0 && (() => {
                const totalCost = bom.reduce((sum, r) => sum + (r.estimatedUnitCostGbp ?? 0), 0);
                const totalMass = bom.reduce((sum, r) => sum + (r.massKg ?? 0), 0);
                const buyCount = bom.filter((r) => r.isPurchased).length;
                const makeCount = bom.length - buyCount;
                return (
                    <View style={{ marginTop: 10 }}>
                        <View style={styles.hr} />
                        <View style={styles.row}>
                            <Text style={styles.rowLabel}>Total cost</Text>
                            <Text style={[styles.rowValue, { fontWeight: "bold" }]}>{fmtGbp(totalCost)}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.rowLabel}>Total mass</Text>
                            <Text style={styles.rowValue}>{fmtKg(totalMass)}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.rowLabel}>Buy / make</Text>
                            <Text style={styles.rowValue}>{buyCount} buy · {makeCount} make</Text>
                        </View>
                    </View>
                );
            })()}



            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            <PdfFooter label="Bill of materials" />
        </Page>
    );
}
