import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";

interface FailedCalculationsSectionProps {
    readonly failedCalculations: ReadonlyArray<string>;
}

/**
 * V3 dumb component — renders the list of failed calculations
 * that occurred during the pipeline run.
 */
export function FailedCalculationsSection({ failedCalculations }: FailedCalculationsSectionProps): React.ReactElement | null {
    if (failedCalculations.length === 0) return null;

    return (
        <View style={{ marginTop: 4 }}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>Failed calculations</Text>
            </View>
            <Text style={[styles.muted, { marginBottom: 8, fontSize: 9 }]}>
                The following calculations could not be completed during the pipeline run. Results that depend on these values should be treated as estimates.
            </Text>

            {failedCalculations.map((item, idx) => (
                <View
                    key={idx}
                    style={{
                        flexDirection: "row",
                        marginBottom: 4,
                        paddingLeft: 4,
                    }}
                >
                    <Text style={{ width: 10, fontSize: 9, color: "#b91c1c" }}>
                        {"\u2022"}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 9, color: "#374151" }}>
                        {item}
                    </Text>
                </View>
            ))}
        </View>
    );
}
