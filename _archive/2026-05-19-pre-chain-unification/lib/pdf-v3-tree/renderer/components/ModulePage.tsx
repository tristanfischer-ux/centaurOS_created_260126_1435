import React from "react";
import { Page, View, Text, Image } from "@react-pdf/renderer";
import { styles, MUTED } from "../styles";
import { PdfFooter } from "./PdfFooter";
import type { PdfModuleData, PdfAttribution } from "../../types/render-contracts";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";

interface ModulePageProps {
    readonly module: PdfModuleData;
    readonly index: number;
    readonly attribution?: PdfAttribution;
    readonly sectionNumber: number;
}

/**
 * V3 dumb component — renders one module per page.
 *
 * Mirrors the V2 module layout (heading, metadata, image, purpose,
 * why-it-matters, description, key parts, failure modes, unknowns,
 * cost) but carries ZERO logic. All values arrive pre-formatted from
 * the enrichment pipeline.
 */
export function ModulePage({ module, index, attribution, sectionNumber }: ModulePageProps): React.ReactElement {
    if (module.mirrorOfName) {
        return (
            <Page size="A4" style={styles.page} wrap>
                <View style={styles.sectionHeaderRow}>
                    <Text style={styles.h2Text}>
                        {sectionNumber}.{index + 1} \u00B7 {module.name}
                    </Text>
                    {attribution && <DataAttribution {...attribution} />}
                </View>

                {/* Metadata row — mass, budget, lead time */}
                <View style={styles.moduleHead}>
                    <View style={{ flex: 1 }} />
                    <Text style={styles.moduleMeta}>
                        {module.formattedMassKg}
                        {module.budgetMassKg != null
                            ? ` / budget ${module.formattedBudgetMassKg}`
                            : ""}
                        {module.leadWeeks != null
                            ? ` · ${module.formattedLeadWeeks} lead · ${module.formattedLeadTimeSource}`
                            : ""}
                    </Text>
                </View>

                <View style={{ padding: 12, backgroundColor: "#f3f4f6", marginBottom: 12 }}>
                    <Text style={{ fontSize: 10, color: "#374151" }}>
                        Mirrors {module.mirrorOfName} — variance summary follows
                    </Text>
                </View>

                {/* Cost summary */}
                <View style={[styles.row, { marginTop: 12 }]}>
                    <Text style={styles.rowLabel}>Estimated cost</Text>
                    <Text style={[styles.rowValue, { fontWeight: "bold" }]}>
                        {module.formattedCostGbp}
                    </Text>
                </View>

                {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
            <PdfFooter label={`${module.name} \u00B7 Module ${index + 1}`} />
            </Page>
        );
    }

    return (
        <Page size="A4" style={styles.page} wrap>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>
                    {sectionNumber}.{index + 1} \u00B7 {module.name}
                </Text>
                {attribution && <DataAttribution {...attribution} />}
            </View>

            {/* Metadata row — mass, budget, lead time, mirror */}
            <View style={styles.moduleHead}>
                <View style={{ flex: 1 }} />
                <Text style={styles.moduleMeta}>
                    {module.formattedMassKg}
                    {module.budgetMassKg != null
                        ? ` / budget ${module.formattedBudgetMassKg}`
                        : ""}
                    {module.leadWeeks != null
                        ? ` · ${module.formattedLeadWeeks} lead · ${module.formattedLeadTimeSource}`
                        : ""}
                    {module.mirrorOfName
                        ? ` · mirrors ${module.mirrorOfName}`
                        : ""}
                </Text>
            </View>

            {/* Module image — generated render or empty placeholder */}
            {module.imageUrl ? (
                <>
                    <Image src={module.imageUrl} style={styles.moduleImage} />
                    <Text style={styles.imageDisclaimer}>
                        Illustrative only — not a technical specification. Generated for visual reference; component arrangement, proportions, and identities may differ from the final engineered assembly.
                    </Text>
                </>
            ) : (
                <View style={styles.moduleImageEmpty}>
                    <Text style={{ color: MUTED, fontSize: 10, fontWeight: "bold", marginBottom: 2 }}>
                        {module.name}
                    </Text>
                    <Text style={{ color: MUTED, fontSize: 8 }}>
                        3D render pending — dimensions shown to scale
                    </Text>
                </View>
            )}

            {/* Purpose */}
            {module.purpose && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Purpose</Text>
                    <Text>{module.purpose}</Text>
                </View>
            )}

            {/* Why it matters */}
            {module.whyItMatters && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Why it matters</Text>
                    <Text>{module.whyItMatters}</Text>
                </View>
            )}

            {/* Description */}
            {module.description && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Description</Text>
                    <Text>{module.description}</Text>
                </View>
            )}

            {/* Key parts */}
            <Text style={styles.h5}>
                Key parts ({module.keyParts.length})
            </Text>
            {module.keyParts.length === 0 ? (
                <Text style={styles.muted}>None declared.</Text>
            ) : (
                module.keyParts.map((part, i) => (
                    <View key={i} style={styles.bullet}>
                        <Text style={styles.bulletDot}>{"\u2022"}</Text>
                        <Text style={styles.bulletText}>{part}</Text>
                    </View>
                ))
            )}

            {/* Failure modes */}
            {module.failureModes.length > 0 && (
                <View style={{ marginTop: 8 }}>
                    <Text style={styles.h5}>Failure modes ({module.failureModes.length})</Text>
                    {module.failureModes.map((fm, i) => (
                        <View key={i} style={styles.bullet}>
                            <Text style={styles.bulletDot}>{"\u2022"}</Text>
                            <Text style={styles.bulletText}>{fm}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Open questions / unknowns */}
            {module.unknowns.length > 0 && (
                <View style={{ marginTop: 8 }}>
                    <Text style={styles.h5}>Open questions ({module.unknowns.length})</Text>
                    {module.unknowns.map((u, i) => (
                        <View key={i} style={styles.bullet}>
                            <Text style={styles.bulletDot}>{"\u2022"}</Text>
                            <Text style={styles.bulletText}>{u}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Cost summary */}
            <View style={[styles.row, { marginTop: 12 }]}>
                <Text style={styles.rowLabel}>Estimated cost</Text>
                <Text style={[styles.rowValue, { fontWeight: "bold" }]}>
                    {module.formattedCostGbp}
                </Text>
            </View>

            <PdfFooter label={`${module.name} \u00B7 Module ${index + 1}`} />
        </Page>
    );
}
