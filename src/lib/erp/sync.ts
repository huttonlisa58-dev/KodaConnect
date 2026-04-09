/**
 * ERP Sync Engine
 * Orchestrates data synchronization between ERP systems and KodaConnect
 */

import { ERPAdapter } from './adapter';
import {
  ERPSyncResult,
  ERPSyncLog,
  ERPError,
  NormalizedCaregiver,
  NormalizedPatient,
  NormalizedCredential,
} from './types';

/**
 * Sync conflict resolution modes
 */
export type ConflictResolutionMode = 'last_write_wins' | 'keep_local' | 'keep_remote';

/**
 * Sync options
 */
export interface SyncOptions {
  conflictResolution?: ConflictResolutionMode;
  batchSize?: number;
  dryRun?: boolean;
  skipValidation?: boolean;
}

/**
 * Sync event for logging
 */
interface SyncEvent {
  timestamp: string;
  event_type: 'started' | 'in_progress' | 'completed' | 'failed';
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Sync Manager - orchestrates all sync operations
 */
export class ERPSyncManager {
  private syncEvents: SyncEvent[] = [];
  private currentSyncId?: string;

  /**
   * Generate unique sync ID
   */
  private generateSyncId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record sync event
   */
  private recordEvent(event: SyncEvent): void {
    this.syncEvents.push(event);
  }

  /**
   * Start a sync operation
   */
  private startSync(syncId: string): void {
    this.currentSyncId = syncId;
    this.recordEvent({
      timestamp: new Date().toISOString(),
      event_type: 'started',
    });
  }

  /**
   * Complete a sync operation
   */
  private completeSync(syncId: string, success: boolean, result?: Partial<ERPSyncResult>): void {
    this.recordEvent({
      timestamp: new Date().toISOString(),
      event_type: success ? 'completed' : 'failed',
      details: result,
    });
    this.currentSyncId = undefined;
  }

  /**
   * Sync caregivers from ERP to KodaConnect
   */
  async syncCaregivers(
    adapter: ERPAdapter,
    companyId: string,
    options?: SyncOptions
  ): Promise<ERPSyncResult> {
    const syncId = this.generateSyncId();
    this.startSync(syncId);

    const result: ERPSyncResult = {
      sync_id: syncId,
      company_id: companyId,
      provider: adapter.provider,
      sync_type: 'caregivers',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      synced_records: 0,
      skipped_records: 0,
      error_records: 0,
      errors: [],
    };

    try {
      if (!adapter.isConnected()) {
        throw new Error('Adapter is not connected');
      }

      // Fetch caregivers from ERP
      const caregivers = await adapter.getCaregivers({
        limit: options?.batchSize || 100,
      });

      result.total_records = caregivers.length;

      // Process each caregiver
      for (const caregiver of caregivers) {
        try {
          // In production, would upsert to Supabase
          // For now, just validate
          if (!options?.skipValidation) {
            if (!caregiver.first_name || !caregiver.last_name) {
              throw new Error('Missing required fields: first_name or last_name');
            }
          }

          result.synced_records++;
        } catch (error) {
          result.error_records++;
          result.errors?.push({
            record_id: caregiver.external_id,
            error_message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      result.status = 'completed';
      result.completed_at = new Date().toISOString();

      this.completeSync(syncId, true, result);
      return result;
    } catch (error) {
      result.status = 'failed';
      result.completed_at = new Date().toISOString();
      result.errors = [
        {
          error_message: error instanceof Error ? error.message : 'Unknown error',
        },
      ];

      this.completeSync(syncId, false, result);
      throw error;
    }
  }

  /**
   * Sync patients from ERP to KodaConnect
   */
  async syncPatients(
    adapter: ERPAdapter,
    companyId: string,
    options?: SyncOptions
  ): Promise<ERPSyncResult> {
    const syncId = this.generateSyncId();
    this.startSync(syncId);

    const result: ERPSyncResult = {
      sync_id: syncId,
      company_id: companyId,
      provider: adapter.provider,
      sync_type: 'patients',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      synced_records: 0,
      skipped_records: 0,
      error_records: 0,
      errors: [],
    };

    try {
      if (!adapter.isConnected()) {
        throw new Error('Adapter is not connected');
      }

      // Fetch patients from ERP
      const patients = await adapter.getPatients({
        limit: options?.batchSize || 100,
      });

      result.total_records = patients.length;

      // Process each patient
      for (const patient of patients) {
        try {
          // In production, would upsert to Supabase
          // For now, just validate
          if (!options?.skipValidation) {
            if (!patient.first_name || !patient.last_name) {
              throw new Error('Missing required fields: first_name or last_name');
            }
          }

          result.synced_records++;
        } catch (error) {
          result.error_records++;
          result.errors?.push({
            record_id: patient.external_id,
            error_message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      result.status = 'completed';
      result.completed_at = new Date().toISOString();

      this.completeSync(syncId, true, result);
      return result;
    } catch (error) {
      result.status = 'failed';
      result.completed_at = new Date().toISOString();
      result.errors = [
        {
          error_message: error instanceof Error ? error.message : 'Unknown error',
        },
      ];

      this.completeSync(syncId, false, result);
      throw error;
    }
  }

  /**
   * Sync credentials from ERP to KodaConnect
   */
  async syncCredentials(
    adapter: ERPAdapter,
    companyId: string,
    caregiverId?: string,
    options?: SyncOptions
  ): Promise<ERPSyncResult> {
    const syncId = this.generateSyncId();
    this.startSync(syncId);

    const result: ERPSyncResult = {
      sync_id: syncId,
      company_id: companyId,
      provider: adapter.provider,
      sync_type: 'credentials',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      synced_records: 0,
      skipped_records: 0,
      error_records: 0,
      errors: [],
    };

    try {
      if (!adapter.isConnected()) {
        throw new Error('Adapter is not connected');
      }

      // Fetch caregivers if no specific caregiver provided
      let caregiverIds: string[] = [];
      if (caregiverId) {
        caregiverIds = [caregiverId];
      } else {
        const caregivers = await adapter.getCaregivers({ limit: 1000 });
        caregiverIds = caregivers.map((c) => c.external_id);
      }

      result.total_records = 0;

      // Fetch credentials for each caregiver
      for (const cgId of caregiverIds) {
        try {
          const credentials = await adapter.getCredentials(cgId);
          result.total_records! += credentials.length;

          for (const credential of credentials) {
            try {
              if (!options?.skipValidation) {
                if (!credential.credential_type || !credential.credential_name) {
                  throw new Error('Missing required credential fields');
                }
              }

              result.synced_records++;
            } catch (error) {
              result.error_records++;
              result.errors?.push({
                record_id: credential.external_id,
                error_message: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        } catch (error) {
          result.error_records++;
          result.errors?.push({
            error_message: `Failed to sync credentials for caregiver ${cgId}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          });
        }
      }

      result.status = 'completed';
      result.completed_at = new Date().toISOString();

      this.completeSync(syncId, true, result);
      return result;
    } catch (error) {
      result.status = 'failed';
      result.completed_at = new Date().toISOString();
      result.errors = [
        {
          error_message: error instanceof Error ? error.message : 'Unknown error',
        },
      ];

      this.completeSync(syncId, false, result);
      throw error;
    }
  }

  /**
   * Sync schedule entries from ERP to KodaConnect
   */
  async syncSchedule(
    adapter: ERPAdapter,
    companyId: string,
    dateRange: { start_date: string; end_date: string },
    options?: SyncOptions
  ): Promise<ERPSyncResult> {
    const syncId = this.generateSyncId();
    this.startSync(syncId);

    const result: ERPSyncResult = {
      sync_id: syncId,
      company_id: companyId,
      provider: adapter.provider,
      sync_type: 'schedule',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      synced_records: 0,
      skipped_records: 0,
      error_records: 0,
      errors: [],
    };

    try {
      if (!adapter.isConnected()) {
        throw new Error('Adapter is not connected');
      }

      // Fetch all caregivers
      const caregivers = await adapter.getCaregivers({ limit: 1000 });

      let totalSchedules = 0;

      // Fetch schedule for each caregiver
      for (const caregiver of caregivers) {
        try {
          const schedules = await adapter.getSchedule(caregiver.external_id, dateRange);
          totalSchedules += schedules.length;

          for (const schedule of schedules) {
            try {
              if (!options?.skipValidation) {
                if (!schedule.start_time || !schedule.end_time) {
                  throw new Error('Missing required schedule fields: start_time or end_time');
                }
              }

              result.synced_records++;
            } catch (error) {
              result.error_records++;
              result.errors?.push({
                record_id: schedule.external_id,
                error_message: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        } catch (error) {
          result.error_records++;
          result.errors?.push({
            error_message: `Failed to sync schedule for caregiver ${caregiver.external_id}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          });
        }
      }

      result.total_records = totalSchedules;
      result.status = 'completed';
      result.completed_at = new Date().toISOString();

      this.completeSync(syncId, true, result);
      return result;
    } catch (error) {
      result.status = 'failed';
      result.completed_at = new Date().toISOString();
      result.errors = [
        {
          error_message: error instanceof Error ? error.message : 'Unknown error',
        },
      ];

      this.completeSync(syncId, false, result);
      throw error;
    }
  }

  /**
   * Run a full synchronization (all data types)
   */
  async runFullSync(
    adapter: ERPAdapter,
    companyId: string,
    dateRange?: { start_date: string; end_date: string },
    options?: SyncOptions
  ): Promise<{ caregivers: ERPSyncResult; patients: ERPSyncResult; credentials: ERPSyncResult; schedule?: ERPSyncResult }> {
    const results: { caregivers: ERPSyncResult; patients: ERPSyncResult; credentials: ERPSyncResult; schedule?: ERPSyncResult } = {
      caregivers: await this.syncCaregivers(adapter, companyId, options),
      patients: await this.syncPatients(adapter, companyId, options),
      credentials: await this.syncCredentials(adapter, companyId, undefined, options),
    };

    if (dateRange) {
      results.schedule = await this.syncSchedule(adapter, companyId, dateRange, options);
    }

    return results;
  }

  /**
   * Get sync history
   */
  getSyncHistory(): SyncEvent[] {
    return [...this.syncEvents];
  }

  /**
   * Clear sync history
   */
  clearSyncHistory(): void {
    this.syncEvents = [];
  }
}

/**
 * Create a new sync manager instance
 */
export function createSyncManager(): ERPSyncManager {
  return new ERPSyncManager();
}
