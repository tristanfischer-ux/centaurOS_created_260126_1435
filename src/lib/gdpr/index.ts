/**
 * GDPR Service Library
 * Core services for GDPR compliance including data requests,
 * exports, deletions, and audit logging
 */

// Data Requests
export {
  createDataRequest,
  getDataRequest,
  updateDataRequestStatus,
  processDataRequest,
  getMyDataRequests,
  getPendingDataRequests,
  getAllDataRequests,
  cancelDataRequest,
  denyDataRequest,
} from "./data-requests"

// Data Export
export {
  generateDataExport,
  collectUserData,
  formatExportData,
  uploadExport,
  getExportUrl,
  getExportSummary,
} from "./data-export"

// Data Deletion
export {
  canDeleteUser,
  anonymizeUser,
  scheduleFullDeletion,
  processImmediateDeletion,
  getRetentionEndDate,
  cancelScheduledDeletion,
  getDueDeletions,
} from "./data-deletion"

// Audit Logging
export {
  logDataAccess,
  logDataModification,
  logDataDeletion,
  getAuditLog,
  exportAuditLog,
  getAuditStats,
  logProfileView,
  logMessagesAccess,
  logOrdersAccess,
  logPaymentDataAccess,
  purgeOldAuditLogs,
} from "./audit"
