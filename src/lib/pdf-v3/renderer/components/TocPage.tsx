import React from "react"
import { Page, View, Text } from "@react-pdf/renderer"
import { styles, MUTED } from "../styles"

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
    )
}

export function TocPage({ sections }: { sections: string[] }): React.ReactElement {
    return (
        <Page size="A4" style={styles.page} wrap>
            <Text style={styles.h2}>Contents</Text>
            {sections.map((s, i) => (
                <View key={i} style={{ flexDirection: "row", marginBottom: 4 }}>
                    <Text style={{ width: 24, color: MUTED }}>{(i + 1).toString().padStart(2, "0")}</Text>
                    <Text style={{ flex: 1 }}>{s}</Text>
                </View>
            ))}
            <PdfFooter label="Contents" />
        </Page>
    )
}
