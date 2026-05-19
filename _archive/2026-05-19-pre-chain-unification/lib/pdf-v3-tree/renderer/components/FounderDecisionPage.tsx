import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { PdfVerdictData } from "../../types/render-contracts";

interface FounderDecisionPageProps {
    readonly verdict: PdfVerdictData;
}

/**
 * V3 dumb component — renders the RED feasibility decision banner.
 *
 * When the verdict is RED, this page tells the founder explicitly
 * that procurement must not proceed and a rebrief or redesign is required.
 */
export function FounderDecisionPage({ verdict }: FounderDecisionPageProps): React.ReactElement | null {
    if (verdict.status !== "RED") return null;

    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>Founder decision</Text>
            </View>

            <View
                style={{
                    marginTop: 24,
                    marginBottom: 20,
                    padding: 20,
                    borderRadius: 6,
                    backgroundColor: "#fee2e2",
                    borderWidth: 2,
                    borderColor: "#b91c1c",
                }}
                wrap={false}
            >
                <Text
                    style={{
                        fontSize: 20,
                        fontWeight: "bold",
                        color: "#7f1d1d",
                        lineHeight: 1.3,
                        textAlign: "center",
                    }}
                >
                    Decision: DO NOT PROCEED TO PROCUREMENT.
                </Text>
                <Text
                    style={{
                        fontSize: 20,
                        fontWeight: "bold",
                        color: "#7f1d1d",
                        lineHeight: 1.3,
                        textAlign: "center",
                        marginTop: 6,
                    }}
                >
                    Rebrief or redesign required.
                </Text>
            </View>

            <View style={{ marginTop: 10 }} wrap={false}>
                <Text style={{ fontSize: 10, fontWeight: "bold", marginBottom: 6, color: "#374151" }}>
                    Blockers that triggered this verdict:
                </Text>
                {verdict.fails.map((fail, idx) => (
                    <View
                        key={idx}
                        style={{
                            marginBottom: 8,
                            padding: 8,
                            borderRadius: 4,
                            backgroundColor: fail.severity === "blocker" ? "#fee2e2" : "#fef3c7",
                            borderLeftWidth: 3,
                            borderLeftColor: fail.severity === "blocker" ? "#b91c1c" : "#b45309",
                        }}
                    >
                        <Text style={{ fontSize: 10, fontWeight: "bold", color: fail.severity === "blocker" ? "#7f1d1d" : "#78350f" }}>
                            [{fail.axis.toUpperCase()}] {fail.summary}
                        </Text>
                        <Text style={{ fontSize: 9, color: fail.severity === "blocker" ? "#991b1b" : "#92400e", marginTop: 3 }}>
                            {fail.evidence}
                        </Text>
                    </View>
                ))}
            </View>

            <PdfFooter label="Founder decision" />
        </Page>
    );
}
