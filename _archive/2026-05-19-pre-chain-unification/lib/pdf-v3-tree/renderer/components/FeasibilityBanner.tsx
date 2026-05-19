import React from "react"
import { View, Text } from "@react-pdf/renderer"
import { PdfVerdictData } from "../../types/render-contracts"

const VERDICT_COLORS = {
    RED: { bg: "#fee2e2", border: "#b91c1c", text: "#7f1d1d", label: "RED" },
    AMBER: { bg: "#fef3c7", border: "#b45309", text: "#7c2d12", label: "AMBER" },
    GREEN: { bg: "#dcfce7", border: "#15803d", text: "#14532d", label: "GREEN" },
    UNREVIEWED: { bg: "#f3f4f6", border: "#6b7280", text: "#374151", label: "UNREVIEWED" },
} as const

export function FeasibilityCoverBadge({
    verdict,
}: {
    verdict: PdfVerdictData
}): React.ReactElement {
    const phantom = verdict.status === "GREEN" && verdict.checkedConstraints.length === 0
    const effectiveStatus = phantom ? "UNREVIEWED" : verdict.status
    const theme = VERDICT_COLORS[effectiveStatus as keyof typeof VERDICT_COLORS] ?? VERDICT_COLORS.UNREVIEWED

    // Top 3 blockers for RED/AMBER — gives the reader immediate context
    const topBlockers = verdict.fails
        .filter((f) => f.severity === "blocker")
        .slice(0, 3)
    const topWarnings = topBlockers.length === 0
        ? verdict.fails.filter((f) => f.severity === "warning").slice(0, 3)
        : []
    const topFindings = topBlockers.length > 0 ? topBlockers : topWarnings

    return (
        <View
            style={{
                marginTop: 18,
                marginBottom: 4,
                padding: 14,
                borderRadius: 6,
                backgroundColor: theme.bg,
                borderWidth: 2,
                borderColor: theme.border,
            }}
            wrap={false}
        >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                    style={{
                        backgroundColor: theme.border,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 4,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 14,
                            fontWeight: "bold",
                            color: "white",
                            letterSpacing: 1,
                        }}
                    >
                        {theme.label}
                    </Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: "bold", color: theme.text }}>
                    {effectiveStatus === "RED"
                        ? "Feasibility — blockers found"
                        : effectiveStatus === "AMBER"
                            ? "Feasibility — warnings found"
                            : effectiveStatus === "GREEN"
                                ? "Feasibility — all checks passed"
                                : "Feasibility — not yet reviewed"}
                </Text>
            </View>
            {topFindings.length > 0 && (
                <View style={{ marginTop: 8 }}>
                    {topFindings.map((f, idx) => (
                        <View
                            key={idx}
                            style={{
                                flexDirection: "row",
                                marginBottom: 3,
                                paddingLeft: 4,
                            }}
                        >
                            <Text style={{ width: 10, fontSize: 9, color: theme.text }}>
                                •
                            </Text>
                            <Text
                                style={{
                                    flex: 1,
                                    fontSize: 9,
                                    color: theme.text,
                                    lineHeight: 1.4,
                                }}
                            >
                                {f.summary}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
            {effectiveStatus === "GREEN" && (
                <Text
                    style={{
                        fontSize: 8.5,
                        color: theme.text,
                        marginTop: 6,
                        opacity: 0.8,
                    }}
                >
                    {`${verdict.checkedConstraints.length} constraint${verdict.checkedConstraints.length === 1 ? "" : "s"} evaluated: ${verdict.checkedConstraints.join(", ")}.`}
                </Text>
            )}
        </View>
    )
}
