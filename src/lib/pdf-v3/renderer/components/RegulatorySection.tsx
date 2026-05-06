import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles, MUTED } from "../styles";
import type { PdfRegulatoryData, PdfAttribution } from "../../types/render-contracts";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";


interface RegulatorySectionProps {
    readonly items: ReadonlyArray<PdfRegulatoryData>;
    readonly attribution?: PdfAttribution;
    readonly sectionNumber: number;
}

// Mirrors V2 regulatoryStatusColour mapping
function getRegulatoryStatusColour(status: string | null) {
    if (!status) return { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" };
    switch (status.toLowerCase()) {
        case "not-started":
        case "in-scope-not-started":
            return { bg: "#fef3c7", text: "#92400e", border: "#f59e0b" };
        case "design-impact-identified":
            return { bg: "#dbeafe", text: "#1e40af", border: "#3b82f6" };
        case "evidence-gathered":
            return { bg: "#ede9fe", text: "#6b21a8", border: "#8b5cf6" };
        case "compliant":
            return { bg: "#dcfce7", text: "#166534", border: "#22c55e" };
        case "not-applicable":
            return { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" };
        default:
            return { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" };
    }
}

function formatStatus(status: string | null) {
    if (!status) return "UNKNOWN";
    return status.replace(/-/g, " ").toUpperCase();
}

function UnverifiedPill(): React.ReactElement {
    return (
        <Text
            style={{
                fontSize: 6.5,
                color: "#92400e",
                backgroundColor: "#fef3c7",
                paddingHorizontal: 3,
                paddingVertical: 1,
                borderRadius: 2,
                marginLeft: 3,
                fontWeight: "bold",
            }}
        >
            Unverified
        </Text>
    );
}

function VerificationStatusPill({ status }: { status: 'VERIFIED' | 'UNVERIFIED' | null }): React.ReactElement | null {
    if (!status) return null;
    const isVerified = status === 'VERIFIED';
    return (
        <Text
            style={{
                fontSize: 6.5,
                color: isVerified ? "#166534" : "#991b1b",
                backgroundColor: isVerified ? "#dcfce7" : "#fee2e2",
                paddingHorizontal: 3,
                paddingVertical: 1,
                borderRadius: 2,
                marginLeft: 3,
                fontWeight: "bold",
                borderWidth: 1,
                borderColor: isVerified ? "#22c55e" : "#f87171",
            }}
        >
            {isVerified ? "VERIFIED" : "UNVERIFIED"}
        </Text>
    );
}

export function RegulatorySection({ items, attribution, noBreak }: RegulatorySectionProps): React.ReactElement {
    const hasMatrix = items.some(
        (r) =>
            r.applicability ||
            r.designImpact ||
            r.evidenceRequired ||
            r.ownerRole ||
            r.gapAction
    );

    const unverifiedCount = items.filter((r) => !r.verifiedAt || (r.confidence != null && r.confidence < 0.7)).length;
    const unverifiedFraction = items.length > 0 ? unverifiedCount / items.length : 0;
    const showRegulatoryUnverifiedCallout = items.length > 0 && unverifiedFraction >= 0.3;

    return (
        <View break={noBreak ? undefined : true}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>2. Regulatory posture</Text>
                {attribution && <DataAttribution {...attribution} />}
            </View>
            
            {items.length === 0 && (
                <View
                    style={{
                        marginTop: 6,
                        marginBottom: 8,
                        padding: 10,
                        borderRadius: 4,
                        backgroundColor: "#fffbeb",
                        borderLeftWidth: 3,
                        borderLeftColor: "#b45309",
                    }}
                >
                    <Text
                        style={{
                            fontSize: 10,
                            fontWeight: "bold",
                            color: "#78350f",
                            marginBottom: 4,
                        }}
                    >
                        Regulatory analysis not yet performed
                    </Text>
                    <Text
                        style={{ fontSize: 9, color: "#92400e", marginBottom: 4 }}
                    >
                        The compliance review stage has not yet run for this project. When it completes, this section will list each applicable standard with its status, owner, and next gap action. Until then, do not use this document for procurement or regulatory submissions.
                    </Text>
                </View>
            )}
            
            {hasMatrix && items.length > 0 && (
                <Text style={{ color: MUTED, marginBottom: 8, fontSize: 9 }}>
                    Per-standard compliance matrix — applicability, design impact, evidence required, status, owner, and the next concrete gap action.
                </Text>
            )}
            
            {showRegulatoryUnverifiedCallout && (
                <View
                    style={{
                        marginBottom: 8,
                        padding: 8,
                        borderRadius: 4,
                        backgroundColor: "#fef3c7",
                        borderLeftWidth: 3,
                        borderLeftColor: "#b45309",
                    }}
                >
                    <Text style={{ fontSize: 9, fontWeight: "bold", color: "#78350f" }}>
                        {unverifiedCount} of {items.length} regulatory entries are unverified extractions.
                    </Text>
                    <Text style={{ fontSize: 8.5, color: "#78350f", marginTop: 3 }}>
                        These entries were populated by an automated extraction pass and should be cross-checked against the original standard text before any procurement, certification, or design-freeze decision.
                    </Text>
                </View>
            )}
            
            {items.map((r, i) => {
                const isUnverified = !r.verifiedAt || (r.confidence != null && r.confidence < 0.7);
                const colours = getRegulatoryStatusColour(r.status);
                
                return (
                    <View key={i} style={{ marginBottom: 10 }} wrap={false}>
                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                            <Text style={{ fontWeight: "bold", marginRight: 8 }}>{r.code}</Text>
                            {r.status && (
                                <Text
                                    style={{
                                        fontSize: 8,
                                        paddingHorizontal: 6,
                                        paddingVertical: 2,
                                        borderRadius: 3,
                                        backgroundColor: colours.bg,
                                        color: colours.text,
                                        borderWidth: 1,
                                        borderColor: colours.border,
                                        marginRight: 4,
                                    }}
                                >
                                    {formatStatus(r.status)}
                                </Text>
                            )}
                            {r.ownerRole && (
                                <Text style={{
                                    fontSize: 8,
                                    color: MUTED,
                                    backgroundColor: "#f9fafb",
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 3,
                                    alignSelf: "flex-start",
                                    borderWidth: 1,
                                    borderColor: "#e5e7eb",
                                    marginLeft: 6 
                                }}>
                                    {r.ownerRole}
                                </Text>
                            )}
                            {isUnverified && <UnverifiedPill />}
                            {r.verificationStatus && <VerificationStatusPill status={r.verificationStatus} />}
                        </View>
                        <Text style={{ fontStyle: "italic", marginBottom: 2 }}>{r.name}</Text>
                        {r.summary && <Text style={{ marginBottom: 3 }}>{r.summary}</Text>}

                        {/* Claim type, verification status, and source grade line */}
                        {(r.claimType || r.sourceGrade) && (
                            <View style={{ flexDirection: "row", marginBottom: 3, gap: 10 }}>
                                {r.claimType && (
                                    <Text style={{ fontSize: 8, color: MUTED }}>
                                        <Text style={{ fontWeight: "bold" }}>Claim type: </Text>
                                        {r.claimType}
                                    </Text>
                                )}
                                {r.verificationStatus && (
                                    <Text
                                        style={{
                                            fontSize: 8,
                                            color: r.verificationStatus === "VERIFIED" ? "#166534" : "#991b1b",
                                            fontWeight: "bold",
                                        }}
                                    >
                                        Status: {r.verificationStatus}
                                    </Text>
                                )}
                                {r.sourceGrade && (
                                    <Text style={{ fontSize: 8, color: MUTED }}>
                                        <Text style={{ fontWeight: "bold" }}>Source grade: </Text>
                                        {r.sourceGrade}
                                    </Text>
                                )}
                            </View>
                        )}

                        {/* Unverified visual warning for individual rows */}
                        {r.verificationStatus === "UNVERIFIED" && (
                            <View
                                style={{
                                    marginBottom: 3,
                                    padding: 4,
                                    borderRadius: 2,
                                    backgroundColor: "#fee2e2",
                                    borderLeftWidth: 2,
                                    borderLeftColor: "#b91c1c",
                                }}
                            >
                                <Text style={{ fontSize: 8, color: "#991b1b", fontWeight: "bold" }}>
                                    This claim has not been independently verified. Cross-check against the original standard before acting on it.
                                </Text>
                            </View>
                        )}

                        {r.applicability && (
                            <Text style={{ fontSize: 9, marginBottom: 2 }}>
                                <Text style={{ fontWeight: "bold" }}>Applicability: </Text>
                                {r.applicability}
                            </Text>
                        )}
                        {r.designImpact && (
                            <Text style={{ fontSize: 9, marginBottom: 2 }}>
                                <Text style={{ fontWeight: "bold" }}>Design impact: </Text>
                                {r.designImpact}
                            </Text>
                        )}
                        {r.evidenceRequired && (
                            <Text style={{ fontSize: 9, marginBottom: 2 }}>
                                <Text style={{ fontWeight: "bold" }}>Evidence required: </Text>
                                {r.evidenceRequired}
                            </Text>
                        )}
                        {r.gapAction && (
                            <Text style={{ fontSize: 9, marginBottom: 2 }}>
                                <Text style={{ fontWeight: "bold" }}>Next action: </Text>
                                {r.gapAction}
                            </Text>
                        )}
                    </View>
                );
            })}
            

            {attribution?.judgement && <SectionJudgement judgement={attribution.judgement} />}
        </View>
    );
}
