import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";

export function PdfFooter({ label }: { label: string }): React.ReactElement {
    return (
        <View style={styles.footer} fixed>
            <Text>{label}</Text>
            <Text
                render={({ pageNumber, totalPages }) =>
                    `Page ${pageNumber} of ${totalPages}`
                }
            />
        </View>
    );
}
