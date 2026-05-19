import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { PdfSectionJudgement } from "../../types/render-contracts";

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
    borderRadius: 4,
  },
  header: {
    fontWeight: "bold",
    fontSize: 10,
    color: "#0f172a",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  table: {
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  tableRowLast: {
    flexDirection: "row",
  },
  colDimension: {
    width: 80,
    padding: 6,
    backgroundColor: "#f1f5f9",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    fontWeight: "bold",
    fontSize: 8.5,
    color: "#334155",
  },
  colScore: {
    width: 35,
    padding: 6,
    textAlign: "center",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    fontWeight: "bold",
    fontSize: 8.5,
  },
  colRationale: {
    flex: 1,
    padding: 6,
    fontSize: 8.5,
    color: "#475569",
    lineHeight: 1.4,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
  },
  colImprovement: {
    flex: 1,
    padding: 6,
    fontSize: 8.5,
    color: "#1e3a8a",
    lineHeight: 1.4,
    fontStyle: "italic",
  },
  row: {
    flexDirection: "row",
    marginBottom: 6,
  },
  label: {
    fontWeight: "bold",
    fontSize: 9,
    color: "#334155",
    width: 120,
  },
  value: {
    fontWeight: "normal",
    fontSize: 9,
    color: "#475569",
    flex: 1,
    lineHeight: 1.4,
  },
});

function DimensionRow({ name, data, isLast = false }: { name: string; data: { score: number; rationale: string; codingImprovement: string; }; isLast?: boolean }) {
  return (
    <View style={isLast ? styles.tableRowLast : styles.tableRow}>
      <Text style={styles.colDimension}>{name}</Text>
      <Text style={[styles.colScore, { color: data.score < 6 ? "#b91c1c" : data.score >= 8 ? "#15803d" : "#0f172a" }]}>
        {data.score}/10
      </Text>
      <Text style={styles.colRationale}>{data.rationale}</Text>
      <Text style={styles.colImprovement}>{data.codingImprovement}</Text>
    </View>
  );
}

export function SectionJudgement({ judgement }: { judgement: PdfSectionJudgement }): React.ReactElement {
  return (
    <View style={styles.container} wrap={false}>
      <Text style={styles.header}>Quality Check \u00B7 {judgement.judgedBy} \u00B7 Stage {judgement.stageId}</Text>
      
      <View style={styles.table}>
        <View style={[styles.tableRow, { backgroundColor: "#f1f5f9" }]}>
          <Text style={[styles.colDimension, { borderBottomWidth: 1, borderBottomColor: "#e2e8f0" }]}>Dimension</Text>
          <Text style={[styles.colScore, { borderBottomWidth: 1, borderBottomColor: "#e2e8f0" }]}>Score</Text>
          <Text style={[styles.colRationale, { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", fontWeight: "bold", color: "#334155" }]}>Rationale</Text>
          <Text style={[styles.colImprovement, { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", fontWeight: "bold", color: "#334155", fontStyle: "normal" }]}>How to fix</Text>
        </View>
        <DimensionRow name="Completeness" data={judgement.dimensions.completeness} />
        <DimensionRow name="Realism" data={judgement.dimensions.realism} />
        <DimensionRow name="Formatting" data={judgement.dimensions.formatting} />
        <DimensionRow name="Sources" data={judgement.dimensions.sources} isLast={true} />
      </View>
    </View>
  );
}