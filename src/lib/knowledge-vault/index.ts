/**
 * @file index.ts
 *
 * @description Public API for the ForgeOS Knowledge Vault — an organizational
 * second brain that accumulates interconnected knowledge from specialist conversations.
 *
 * @example
 * import {
 *   queryKnowledgeNotes,
 *   getKnowledgeNote,
 *   createKnowledgeNote,
 *   extractKnowledge,
 *   getVaultStats,
 * } from '@/lib/knowledge-vault'
 */

// Core operations
export {
  queryKnowledgeNotes,
  getKnowledgeNote,
  getKnowledgeNoteWithLinks,
  createKnowledgeNote,
  updateKnowledgeNote,
  archiveKnowledgeNote,
  deleteKnowledgeNote,
  pinKnowledgeNote,
  verifyKnowledgeNote,
  createKnowledgeLink,
  removeKnowledgeLink,
  getVaultStats,
  ensureDefaultDomains,
  getKnowledgeDomains,
  searchKnowledgeForSpecialist,
} from './manager'

// Extraction pipeline
export { extractKnowledge } from './extractor'

// Connection discovery
export { discoverConnections } from './connector'

// Types
export type {
  KnowledgeNote,
  KnowledgeNoteSummary,
  KnowledgeLink,
  KnowledgeLinkWithNote,
  KnowledgeDomain,
  KnowledgeNoteType,
  KnowledgeLinkRelationship,
  LinkDiscoverySource,
  KnowledgeQueryFilters,
  KnowledgeQueryParams,
  KnowledgeQueryResult,
  KnowledgeSortBy,
  KnowledgeSortOrder,
  VaultStats,
  ExtractionInput,
  ExtractedNote,
  ExtractionResult,
} from './types'

export { NOTE_TYPE_META, LINK_RELATIONSHIP_META, DEFAULT_DOMAINS } from './types'
