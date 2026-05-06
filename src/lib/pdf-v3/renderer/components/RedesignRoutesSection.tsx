import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { styles, MUTED, BG_SOFT, BORDER, INK } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { RedesignRoute } from "../../types/render-contracts";

interface RedesignRoutesSectionProps {
    readonly redesignRoutes: ReadonlyArray<RedesignRoute>;
}

export function RedesignRoutesSection({ redesignRoutes }: RedesignRoutesSectionProps): React.ReactElement | null {
    if (!redesignRoutes || redesignRoutes.length === 0) return null;

    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>Redesign Routes</Text>
            </View>

            <View style={{ marginTop: 12 }}>
                {redesignRoutes.map((route, i) => (
                    <View key={i} style={{ marginBottom: 12, padding: 12, backgroundColor: BG_SOFT, borderRadius: 4, borderWidth: 1, borderColor: BORDER }}>
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: INK, marginBottom: 4 }}>
                            {route.action}
                        </Text>
                        <Text style={{ fontSize: 10, color: INK }}>
                            <Text style={{ fontWeight: "bold", color: MUTED }}>Impact: </Text>
                            {route.impact}
                        </Text>
                    </View>
                ))}
            </View>

            <PdfFooter label="Redesign Routes" />
        </Page>
    );
}
