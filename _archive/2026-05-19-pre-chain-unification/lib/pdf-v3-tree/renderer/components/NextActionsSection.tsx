import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";

interface NextActionsSectionProps {
    readonly nextActions: ReadonlyArray<string>;
}

/**
 * V3 dumb component — renders the list of recommended next actions.
 */
export function NextActionsSection({ nextActions }: NextActionsSectionProps): React.ReactElement | null {
    if (nextActions.length === 0) return null;

    return (
        <View style={{ marginTop: 4 }}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>Next actions</Text>
            </View>
            <Text style={[styles.muted, { marginBottom: 8, fontSize: 9 }]}>
                Recommended actions to advance this project.
            </Text>

            {nextActions.map((item, idx) => (
                <View
                    key={idx}
                    style={{
                        flexDirection: "row",
                        marginBottom: 4,
                        paddingLeft: 4,
                    }}
                >
                    <Text style={{ width: 10, fontSize: 9, color: "#2563eb" }}>
                        {idx + 1}.
                    </Text>
                    <Text style={{ flex: 1, fontSize: 9, color: "#374151" }}>
                        {item}
                    </Text>
                </View>
            ))}
        </View>
    );
}
