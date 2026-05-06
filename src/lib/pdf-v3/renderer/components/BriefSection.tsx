import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";
import type { PdfRenderData } from "../../types/render-contracts";
import { FeasibilityCoverBadge } from "./FeasibilityBanner";
import { DataAttribution } from "./DataAttribution";
import { SectionJudgement } from "./SectionJudgement";


interface BriefSectionProps {
    readonly data: PdfRenderData;
    readonly sectionNumber: number;
}

export function BriefSection({ data, sectionNumber }: BriefSectionProps): React.ReactElement {
    const brief = data.brief;
    const isPhantomGreen = data.verdict.status === "GREEN" && data.verdict.checkedConstraints.length === 0;

    return (
        <View>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.h2Text}>{sectionNumber}. Brief</Text>
                {data.attributions?.brief && <DataAttribution {...data.attributions.brief} />}
            </View>
            
            {data.verdict && (data.verdict.status !== "GREEN" || isPhantomGreen) && (
                <FeasibilityCoverBadge verdict={data.verdict} />
            )}
            
            {brief.subject && (
                <View style={styles.para}>
                    <Text style={styles.h5}>What we are building</Text>
                    <Text>{brief.subject}</Text>
                </View>
            )}
            
            {brief.mission && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Mission</Text>
                    <Text>{brief.mission}</Text>
                </View>
            )}
            
            {brief.useCase && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Use case</Text>
                    <Text>{brief.useCase}</Text>
                </View>
            )}
            
            {brief.targetCustomers && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Target customers</Text>
                    <Text>{brief.targetCustomers}</Text>
                </View>
            )}
            
            {brief.whyNow && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Why now</Text>
                    <Text>{brief.whyNow}</Text>
                </View>
            )}
            
            {(brief.unitCostCeilingGbp != null
                || brief.maxMassKg != null
                || brief.targetProcess
                || brief.targetMaterial
                || brief.toleranceTarget
                || brief.quantityTarget) && (
                <Text style={styles.h3}>Constraints declared</Text>
            )}
            
            {brief.unitCostCeilingGbp != null && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Unit cost ceiling</Text>
                    <Text style={styles.rowValue}>{data.meta.costCeilingFormatted}</Text>
                </View>
            )}
            
            {brief.maxMassKg != null && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Max mass</Text>
                    <Text style={styles.rowValue}>{brief.maxMassKg.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</Text>
                </View>
            )}
            
            {brief.targetProcess && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Target process</Text>
                    <Text style={styles.rowValue}>{brief.targetProcess}</Text>
                </View>
            )}
            
            {brief.targetMaterial && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Target material</Text>
                    <Text style={styles.rowValue}>{brief.targetMaterial}</Text>
                </View>
            )}
            
            {brief.toleranceTarget && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Tolerance target</Text>
                    <Text style={styles.rowValue}>{brief.toleranceTarget}</Text>
                </View>
            )}
            
            {brief.quantityTarget && (
                <View style={styles.row}>
                    <Text style={styles.rowLabel}>Quantity target</Text>
                    <Text style={styles.rowValue}>{brief.quantityTarget}</Text>
                </View>
            )}
            
            {brief.complianceNotes && (
                <View style={styles.para}>
                    <Text style={styles.h5}>Compliance notes</Text>
                    <Text>{brief.complianceNotes}</Text>
                </View>
            )}
            

            {data.attributions?.brief?.judgement && <SectionJudgement judgement={data.attributions?.brief?.judgement} />}
        </View>
    );
}
