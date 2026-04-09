/**
 * ERP Integration Module
 * Main export file for all ERP-related types and utilities
 */

// Types
export * from './types';

// Adapter interface and base class
export { BaseERPAdapter } from './adapter';
export type { ERPAdapter } from './adapter';

// ERP implementations
export { AxisCareAdapter } from './axiscare';
export { HHAeXchangeAdapter } from './hhaexchange';
export { CSVImportAdapter, parseExcel, validateImportData, suggestColumnMapping } from './csv-import';

// Normalization utilities
export {
  normalizeCaregiver,
  normalizePatient,
  normalizeCredential,
  flattenObject,
  suggestColumnMapping as suggestColumnMappingNormalizer,
} from './normalizer';

// Sync manager
export { ERPSyncManager, createSyncManager } from './sync';
export type { SyncOptions } from './sync';
