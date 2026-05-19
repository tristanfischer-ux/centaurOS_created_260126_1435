import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles, BORDER } from "../styles";

interface BatteryCalculationSectionProps {
    readonly data: Record<string, unknown> | null | undefined;
}

/**
 * V3 dumb component — renders battery energy calculation parameters
 * as a key-value table.
 */
export function BatteryCalculationSection({ data }: BatteryCalculationSectionProps): React.ReactElement | null {
    if (!data || typeof data !== "object") return null;

    const entries = Object.entries(data).filter(
        ([, v]) => v !== null && v !== undefined,
    );
    if (entries.length === 0) return null;

    return (
        <View style={{ marginTop: 10 }}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>Battery energy calculation</Text>
            </View>
            <Text style={[styles.muted, { marginBottom: 8, fontSize: 9 }]}>
                Parameters used to compute the battery energy requirement for this design.
            </Text>

            <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 4 }}>
                {entries.map(([key, value], idx) => (
                    <View
                        key={key}
                        style={{
                            flexDirection: "row",
                            paddingVertical: 5,
                            paddingHorizontal: 8,
                            borderBottomWidth: idx < entries.length - 1 ? 1 : 0,
                            borderBottomColor: BORDER,
                            backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f9fafb",
                        }}
                    >
                        <Text style={{ width: 200, fontSize: 9, fontWeight: "bold", color: "#374151" }}>
                            {formatKey(key)}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 9, color: "#1f2937" }}>
                            {formatValue(value)}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

function formatKey(key: string): string {
    return key
        .replace(/([A-Z])/g, " $1")
        .replace(/[_-]/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim();
}

function formatValue(value: unknown): string {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") {
        return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
    }
    return String(value);
}
