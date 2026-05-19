import { buildInterfaceContractMatrix } from '../architecture/interface-contracts'
import { buildVerificationEvidenceLedger, type VerificationLedgerStatus } from '../architecture/verification-ledger'
import { buildEngineeringVerificationPlan, type VerificationStatus } from '../architecture/verification-plan'
import type { ArchitectureReadiness, ProductDossier, SectionIssue } from '../schema/types'

export type InterfaceVerificationVerdict =
  | 'accepted_interfaces'
  | 'interface_review_ready'
  | 'interface_evidence_pending'
  | 'interface_blocked'
  | 'no_required_interfaces'

export type InterfaceVerificationStatus =
  | 'accepted'
  | 'review_ready'
  | 'pending_evidence'
  | 'deferred'
  | 'blocked'

export interface InterfaceVerificationGateRow {
  id: string
  interfaceId: string
  fromModuleId: string
  fromModuleName: string
  toModuleId: string
  toModuleName: string
  contractStatus: 'present' | 'missing'
  carrierStatus: 'both_endpoints_carried' | 'carrier_incomplete'
  fromCarrierSubModules: string[]
  toCarrierSubModules: string[]
  componentWordIds: string[]
  verificationActivityId: string | null
  plannedStatus: VerificationStatus | null
  ledgerStatus: VerificationLedgerStatus | null
  status: InterfaceVerificationStatus
  blockers: string[]
  requiredAction: string
}

export interface InterfaceVerificationGate {
  verdict: InterfaceVerificationVerdict
  summary: {
    rows: number
    acceptedRows: number
    reviewReadyRows: number
    pendingEvidenceRows: number
    deferredRows: number
    blockedRows: number
    presentContracts: number
    missingContracts: number
    carrierCompleteRows: number
    verificationActivityRows: number
    acceptedEvidenceRatio: number
    structuralPassRatio: number
  }
  rows: InterfaceVerificationGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildInterfaceVerificationGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): InterfaceVerificationGate {
  const contracts = buildInterfaceContractMatrix(dossier, readiness)
  const verificationPlan = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const verificationLedger = buildVerificationEvidenceLedger(verificationPlan, dossier.sources.verificationEvidence)
  const ledgerById = new Map(verificationLedger.rows.map(row => [row.activityId, row]))

  const rows = contracts.requiredContracts.map(contract => {
    const verificationActivityId = `interface_review:${contract.from.moduleId}:${contract.to.moduleId}:${contract.interfaceId}`
    const ledger = ledgerById.get(verificationActivityId)
    const fromCarrierSubModules = contract.from.carrierSubModules.map(subModule => subModule.subModuleId)
    const toCarrierSubModules = contract.to.carrierSubModules.map(subModule => subModule.subModuleId)
    const carrierStatus = fromCarrierSubModules.length > 0 && toCarrierSubModules.length > 0
      ? 'both_endpoints_carried'
      : 'carrier_incomplete'
    const blockers = blockersFor(contract.status, carrierStatus, ledger?.ledgerStatus ?? null, ledger?.residualAction, contract.notes)
    const status = statusFor(contract.status, carrierStatus, ledger?.ledgerStatus ?? null)

    return {
      id: contract.id,
      interfaceId: contract.interfaceId,
      fromModuleId: contract.from.moduleId,
      fromModuleName: contract.from.moduleName,
      toModuleId: contract.to.moduleId,
      toModuleName: contract.to.moduleName,
      contractStatus: contract.status,
      carrierStatus,
      fromCarrierSubModules,
      toCarrierSubModules,
      componentWordIds: Array.from(new Set([
        ...contract.from.carrierSubModules.flatMap(subModule => subModule.componentWordIds),
        ...contract.to.carrierSubModules.flatMap(subModule => subModule.componentWordIds),
      ])),
      verificationActivityId: ledger?.activityId ?? null,
      plannedStatus: ledger?.plannedStatus ?? null,
      ledgerStatus: ledger?.ledgerStatus ?? null,
      status,
      blockers,
      requiredAction: actionFor(status, ledger?.residualAction),
    } satisfies InterfaceVerificationGateRow
  })

  const acceptedRows = rows.filter(row => row.status === 'accepted').length
  const reviewReadyRows = rows.filter(row => row.status === 'review_ready').length
  const pendingEvidenceRows = rows.filter(row => row.status === 'pending_evidence').length
  const deferredRows = rows.filter(row => row.status === 'deferred').length
  const blockedRows = rows.filter(row => row.status === 'blocked').length
  const verdict: InterfaceVerificationVerdict = rows.length === 0
    ? 'no_required_interfaces'
    : blockedRows > 0
      ? 'interface_blocked'
      : acceptedRows === rows.length
        ? 'accepted_interfaces'
        : pendingEvidenceRows > 0 || deferredRows > 0
          ? 'interface_evidence_pending'
          : 'interface_review_ready'

  return {
    verdict,
    summary: {
      rows: rows.length,
      acceptedRows,
      reviewReadyRows,
      pendingEvidenceRows,
      deferredRows,
      blockedRows,
      presentContracts: rows.filter(row => row.contractStatus === 'present').length,
      missingContracts: rows.filter(row => row.contractStatus === 'missing').length,
      carrierCompleteRows: rows.filter(row => row.carrierStatus === 'both_endpoints_carried').length,
      verificationActivityRows: rows.filter(row => row.verificationActivityId !== null).length,
      acceptedEvidenceRatio: ratio(acceptedRows, rows.length),
      structuralPassRatio: ratio(rows.filter(row => row.contractStatus === 'present' && row.carrierStatus === 'both_endpoints_carried' && row.verificationActivityId !== null).length, rows.length),
    },
    rows,
    blockers: rows
      .filter(row => row.status === 'blocked')
      .flatMap(row => row.blockers.length > 0 ? row.blockers.map(blocker => `${row.id}: ${blocker}`) : [`${row.id}: blocked`]),
    nextActions: Array.from(new Set(rows
      .filter(row => row.status !== 'accepted')
      .map(row => row.requiredAction))),
  }
}

export function renderInterfaceVerificationGateCsv(gate: InterfaceVerificationGate): string {
  const header = [
    'id',
    'interfaceId',
    'fromModuleId',
    'toModuleId',
    'contractStatus',
    'carrierStatus',
    'fromCarrierSubModules',
    'toCarrierSubModules',
    'componentWordIds',
    'verificationActivityId',
    'plannedStatus',
    'ledgerStatus',
    'status',
    'blockers',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.id,
    row.interfaceId,
    row.fromModuleId,
    row.toModuleId,
    row.contractStatus,
    row.carrierStatus,
    row.fromCarrierSubModules.join('; '),
    row.toCarrierSubModules.join('; '),
    row.componentWordIds.join('; '),
    row.verificationActivityId ?? '',
    row.plannedStatus ?? '',
    row.ledgerStatus ?? '',
    row.status,
    row.blockers.join(' '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function statusFor(
  contractStatus: InterfaceVerificationGateRow['contractStatus'],
  carrierStatus: InterfaceVerificationGateRow['carrierStatus'],
  ledgerStatus: VerificationLedgerStatus | null,
): InterfaceVerificationStatus {
  if (contractStatus === 'missing' || carrierStatus === 'carrier_incomplete') return 'blocked'
  if (ledgerStatus === null) return 'blocked'
  if (ledgerStatus === 'accepted') return 'accepted'
  if (ledgerStatus === 'rejected' || ledgerStatus === 'blocked_without_evidence') return 'blocked'
  if (ledgerStatus === 'deferred') return 'deferred'
  if (ledgerStatus === 'pending') return 'review_ready'
  return 'pending_evidence'
}

function blockersFor(
  contractStatus: InterfaceVerificationGateRow['contractStatus'],
  carrierStatus: InterfaceVerificationGateRow['carrierStatus'],
  ledgerStatus: VerificationLedgerStatus | null,
  residualAction: string | undefined,
  contractNotes: string[],
): string[] {
  return [
    ...(contractStatus === 'missing' ? contractNotes : []),
    ...(carrierStatus === 'carrier_incomplete' ? ['At least one endpoint is missing a submodule carrier.'] : []),
    ...(ledgerStatus === null ? ['No interface-review verification activity is linked to this required contract.'] : []),
    ...(ledgerStatus === 'rejected' || ledgerStatus === 'blocked_without_evidence' ? [residualAction ?? 'Interface verification is blocked.'] : []),
  ]
}

function actionFor(status: InterfaceVerificationStatus, residualAction: string | undefined): string {
  if (status === 'accepted') return 'Interface contract has accepted reviewer evidence; keep evidence attached.'
  if (status === 'review_ready') return 'Collect named interface-review evidence through verification intake.'
  if (status === 'pending_evidence') return residualAction ?? 'Resolve pending interface evidence before publication.'
  if (status === 'deferred') return 'Resolve or explicitly accept the deferred interface evidence before trusted publication.'
  return residualAction ?? 'Repair required interface declarations, carrier submodules or verification activity links.'
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
