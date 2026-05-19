import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";

interface RequiredInputsSectionProps {
    readonly requiredInputs: ReadonlyArray<string>;
}

/**
 * V3 dumb component — renders the list of inputs still required
 * before the project can advance.
 */
export function RequiredInputsSection({ requiredInputs }: RequiredInputsSectionProps): React.ReactElement | null {
    if (requiredInputs.length === 0) return null;

    return (
        <View style={{ marginTop: 4 }}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>Required inputs</Text>
            </View>
            <Text style={[styles.muted, { marginBottom: 8, fontSize: 9 }]}>
                The following inputs are still needed before this project can proceed to the next stage.
            </Text>

            {requiredInputs.map((item, idx) => (
                <View
                    key={idx}
                    style={{
                        flexDirection: "row",
                        marginBottom: 4,
                        paddingLeft: 4,
                    }}
                >
                    <Text style={{ width: 10, fontSize: 9, color: "#b45309" }}>
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
