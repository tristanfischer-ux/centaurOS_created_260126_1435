import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { PdfRenderData } from '../types/render-contracts';
import { styles } from './styles';
import { CoverPage } from './components/CoverPage';
import { TocPage } from './components/TocPage';
import { FeasibilityCoverBadge } from './components/FeasibilityBanner';
import { FounderDecisionPage } from './components/FounderDecisionPage';
import { ModulePage } from './components/ModulePage';
import { BomTable } from './components/BomTable';
import { SupplierTable } from './components/SupplierTable';
import { CostWaterfallSection } from './components/CostWaterfallSection';
import { RisksRegisterSection } from './components/RisksRegisterSection';
import { AuditLogSection } from './components/AuditLogSection';
import { PdfFooter } from './components/PdfFooter';
import { BriefSection } from './components/BriefSection';
import { RegulatorySection } from './components/RegulatorySection';
import { SizingSection } from './components/SizingSection';
import { SpatialPlanSection } from './components/SpatialPlanSection';
import { ConstraintReconciliationSection } from './components/ConstraintReconciliationSection';
import { RedesignRoutesSection } from './components/RedesignRoutesSection';
import { SectionJudgement } from './components/SectionJudgement';
import { BatteryCalculationSection } from './components/BatteryCalculationSection';
import { PowerArchitectureSection } from './components/PowerArchitectureSection';
import { FailedCalculationsSection } from './components/FailedCalculationsSection';
import { RequiredInputsSection } from './components/RequiredInputsSection';
import { NextActionsSection } from './components/NextActionsSection';

export interface ProjectPDFDocumentProps {
  data: PdfRenderData;
}

/**
 * V3 PDF document — composes dumb visual components with zero business logic.
 */
export function ProjectPDFDocument({ data }: ProjectPDFDocumentProps) {
  const hasSheet = data.dimensionSheet != null;
  const hasPlan = data.spatialPlan != null;
  const isRed = data.verdict?.status === 'RED';

  const sectionsList = isRed
    ? [
        'Feasibility',
        'Brief',
        'Regulatory Posture',
        ...(data.reconciliation && data.reconciliation.length > 0 ? ['Constraint Reconciliation'] : []),
        ...(data.redesignRoutes && data.redesignRoutes.length > 0 ? ['Redesign Routes'] : [])
      ]
    : [
        'Feasibility',
        'Brief',
        'Regulatory Posture',
        ...(hasSheet ? ['Sizing optimisation'] : []),
        ...(hasPlan ? ['Spatial plan'] : []),
        'Modules (one page each)',
        'Bill of Materials',
        'Cost waterfall',
        'Risks register',
        'Supplier shortlist',
        'Project audit log'
      ];

  const sections = sectionsList.map((s, i) => `${i + 1}. ${s}`);
  
  // Helper to find section number (1-indexed)
  const getSecNum = (name: string) => sectionsList.indexOf(name) + 1;

  const sizingSectionNumber = hasSheet ? getSecNum('Sizing optimisation') : null;
  const planSectionNumber = hasPlan ? getSecNum('Spatial plan') : null;
  const moduleSectionNumber = getSecNum('Modules (one page each)');
  const bomSectionNumber = getSecNum('Bill of Materials');
  const costSectionNumber = getSecNum('Cost waterfall');
  const riskSectionNumber = getSecNum('Risks register');
  const supplierSectionNumber = getSecNum('Supplier shortlist');
  const auditSectionNumber = getSecNum('Project audit log');
  const briefSectionNumber = getSecNum('Brief');
  const regulatorySectionNumber = getSecNum('Regulatory Posture');
  const feasibilitySectionNumber = getSecNum('Feasibility');

  // Build the module-id → name map once here so SpatialPlanSection can
  // resolve placement.module_id labels without re-walking the array.
  const moduleNameById = new Map<string, string>();
  for (const m of data.modules) moduleNameById.set(m.name, m.name);

  // Filter regulatory items for unverified claims section (shown only in RED block)
  const unverifiedRegulatoryItems = data.regulatory.filter(
    (r) => r.verificationStatus === 'UNVERIFIED' || (!r.verifiedAt && (r.confidence == null || r.confidence < 0.7)),
  );

  return (
    <Document>
      <CoverPage data={data} />
      <TocPage sections={sections} />

      {data.verdict && data.verdict.status !== 'GREEN' && (
        <Page size="A4" style={styles.page} wrap>
          <Text style={styles.h2}>{feasibilitySectionNumber}. Feasibility</Text>
          <Text style={[styles.muted, { marginBottom: 10, fontSize: 9 }]}>
            Before this report was assembled, the design was checked against
            the brief constraints. The verdict below is computed
            deterministically from the sizing solver, bill of materials, and
            cost waterfall — not from language-model opinion.
          </Text>
          <FeasibilityCoverBadge verdict={data.verdict} />

          {data.alerts && data.alerts.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.h5}>System alerts ({data.alerts.length})</Text>
              {data.alerts.map((alert, idx) => {
                const isAlertRed = alert.severity === 'RED';
                const isAmber = alert.severity === 'AMBER';
                return (
                  <View
                    key={idx}
                    style={{
                      marginTop: 6,
                      padding: 8,
                      borderRadius: 4,
                      backgroundColor: isAlertRed ? '#fee2e2' : isAmber ? '#fef3c7' : '#f3f4f6',
                      borderLeftWidth: 3,
                      borderLeftColor: isAlertRed ? '#b91c1c' : isAmber ? '#b45309' : '#6b7280',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: isAlertRed ? '#7f1d1d' : isAmber ? '#7c2d12' : '#374151' }}>
                      {alert.title}
                    </Text>
                    <Text style={{ fontSize: 9, color: isAlertRed ? '#7f1d1d' : isAmber ? '#78350f' : '#4b5563', marginTop: 3 }}>
                      {alert.message}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {data.attributions?.verdict?.judgement && (
            <SectionJudgement judgement={data.attributions.verdict.judgement} />
          )}

          <PdfFooter label="Feasibility" />
        </Page>
      )}

      {/* RED-only sections */}
      {isRed && (
        <>
          <FounderDecisionPage verdict={data.verdict} />

          {/* Failed calculations, unverified claims, battery/power on a shared page */}
          <Page size="A4" style={styles.page} wrap>
            <FailedCalculationsSection failedCalculations={data.failedCalculations} />

            {unverifiedRegulatoryItems.length > 0 && (
              <RegulatorySection
                items={unverifiedRegulatoryItems}
                attribution={data.attributions?.regulatory}
                noBreak
              />
            )}

            <BatteryCalculationSection data={data.batteryCalculation} />
            <PowerArchitectureSection data={data.powerArchitecture} />
            <PdfFooter label="Engineering calculations" />
          </Page>

          {/* Required inputs and next actions */}
          <Page size="A4" style={styles.page} wrap>
            <RequiredInputsSection requiredInputs={data.requiredInputs} />
            <NextActionsSection nextActions={data.nextActions} />
            <PdfFooter label="Required inputs & next actions" />
          </Page>
        </>
      )}

      <Page size="A4" style={styles.page} wrap>
        <BriefSection data={data} sectionNumber={briefSectionNumber} />
        <RegulatorySection items={data.regulatory} attribution={data.attributions?.regulatory} sectionNumber={regulatorySectionNumber} />
        <PdfFooter label="Brief & Regulatory" />
      </Page>

      {!isRed && (
        <>
          {hasSheet && sizingSectionNumber != null && (
            <SizingSection
              sheet={data.dimensionSheet}
              sectionNumber={sizingSectionNumber}
              attribution={data.attributions?.dimensionSheet}
            />
          )}

          {hasPlan && planSectionNumber != null && (
            <SpatialPlanSection
              plan={data.spatialPlan}
              sectionNumber={planSectionNumber}
              moduleNameById={moduleNameById}
              imageDataUri={data.spatialPlanImageDataUri ?? null}
              attribution={data.attributions?.spatialPlan}
            />
          )}

          {data.modules.map((mod, index) => (
            <ModulePage key={index} module={mod} index={index} sectionNumber={moduleSectionNumber} attribution={data.attributions?.modules} />
          ))}
          <BomTable bom={data.bom} attribution={data.attributions?.bom} sectionNumber={bomSectionNumber} />
          <CostWaterfallSection costWaterfall={data.costWaterfall} attribution={data.attributions?.cost} sectionNumber={costSectionNumber} />
          <RisksRegisterSection risks={data.risks} attribution={data.attributions?.risks} sectionNumber={riskSectionNumber} />
          <SupplierTable suppliers={data.suppliers} attribution={data.attributions?.suppliers} sectionNumber={supplierSectionNumber} />
          <AuditLogSection auditLog={data.auditLog} attribution={data.attributions?.auditLog} sectionNumber={auditSectionNumber} />
        </>
      )}
    </Document>
  );
}
