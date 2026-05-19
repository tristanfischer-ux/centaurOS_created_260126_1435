import type { EnrichedProjectData, PdfAlert } from '../types/render-contracts';

function checkPhantomGreen(enriched: EnrichedProjectData): PdfAlert | null {
  if (enriched.verdict.status !== 'GREEN') {
    return null;
  }

  const { feasibilityAxes } = enriched.businessRuleContext;
  const hasCheckedAxis = feasibilityAxes.some((axis) => axis.checked);

  if (!hasCheckedAxis) {
    return {
      severity: 'AMBER',
      title: 'Phantom Green',
      message:
        'The verdict is GREEN but no feasibility axes have been checked. ' +
        'The result may not be backed by quantitative analysis.',
    };
  }

  return null;
}

function checkBudgetExceeded(enriched: EnrichedProjectData): PdfAlert | null {
  const { unitCostRaw, costCeilingRaw } = enriched.businessRuleContext;

  if (unitCostRaw === null || costCeilingRaw === null) {
    return null;
  }

  if (unitCostRaw > costCeilingRaw) {
    return {
      severity: 'RED',
      title: 'Budget Exceeded',
      message:
        `Unit cost of ${enriched.unitCostFormatted} exceeds the cost ceiling of ` +
        `${enriched.costCeilingFormatted}. Review the bill of materials for savings.`,
    };
  }

  return null;
}

export function extractAlerts(enriched: EnrichedProjectData): PdfAlert[] {
  const alerts: PdfAlert[] = [];

  const phantomGreen = checkPhantomGreen(enriched);
  if (phantomGreen) alerts.push(phantomGreen);

  const budgetExceeded = checkBudgetExceeded(enriched);
  if (budgetExceeded) alerts.push(budgetExceeded);

  return alerts;
}
