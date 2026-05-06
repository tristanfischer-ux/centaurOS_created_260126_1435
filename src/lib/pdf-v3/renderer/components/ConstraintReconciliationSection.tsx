import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { styles, MUTED, BRAND, BG_SOFT, BORDER, INK } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { ReconciliationEntry, PdfAttribution } from "../../types/render-contracts";
import { SectionJudgement } from "./SectionJudgement";

interface ConstraintReconciliationSectionProps {
    readonly reconciliation: ReadonlyArray<ReconciliationEntry>;
    readonly attribution?: PdfAttribution;
}

export function ConstraintReconciliationSection({ reconciliation, attribution }: ConstraintReconciliationSectionProps): React.ReactElement | null {
    if (!reconciliation || reconciliation.length === 0) return null;

    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>Constraint Reconciliation</Text>
            </View>

            <View style={{ marginTop: 12 }}>
                <View style={[styles.row, { backgroundColor: BG_SOFT, padding: 8, borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                    <Text style={{ flex: 2, fontWeight: "bold", fontSize: 10, color: MUTED }}>Constraint</Text>
                    <Text style={{ flex: 1, fontWeight: "bold", fontSize: 10, color: MUTED }}>Target</Text>
                    <Text style={{ flex: 1, fontWeight: "bold", fontSize: 10, color: MUTED }}>Actual</Text>
                    <Text style={{ flex: 1, fontWeight: "bold", fontSize: 10, color: MUTED }}>Status</Text>
                </View>
                {reconciliation.map((entry, i) => (
                    <View key={i} style={[styles.row, { padding: 8, borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                        <Text style={{ flex: 2, fontSize: 10, color: INK }}>{entry.constraint}</Text>
                        <Text style={{ flex: 1, fontSize: 10, color: INK }}>{entry.target}</Text>
                        <Text style={{ flex: 1, fontSize: 10, color: INK }}>{entry.actual}</Text>
                        <Text style={{ flex: 1, fontSize: 10, color: entry.status === 'FAIL' || entry.status === 'INFEASIBLE' ? '#a3001a' : (entry.status === 'PASS' || entry.status === 'FEASIBLE' ? '#0a6a1a' : INK), fontWeight: "bold" }}>
                            {entry.status}
                        </Text>
                    </View>
                ))}
            </View>

            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            <PdfFooter label="Constraint Reconciliation" />
        </Page>
    );
}
