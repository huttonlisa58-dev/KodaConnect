/**
 * Abstract ERP Adapter Interface
 * All ERP system integrations must implement this interface
 */

import {
  ERPConfig,
  CaregiverFilter,
  PatientFilter,
  CaregiverCreateInput,
  CaregiverUpdateInput,
  ERPCaregiver,
  ERPPatient,
  ERPCredential,
  ERPScheduleEntry,
  DateRange,
  CredentialUpdateInput,
} from './types';

export interface ERPAdapter {
  /**
   * Adapter metadata
   */
  name: string;
  provider: 'axiscare' | 'hhaexchange' | 'csv_import';

  /**
   * Connection lifecycle methods
   */
  connect(config: ERPConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  /**
   * Caregiver operations
   */
  getCaregivers(filters?: CaregiverFilter): Promise<ERPCaregiver[]>;
  getCaregiver(externalId: string): Promise<ERPCaregiver>;
  createCaregiver(data: CaregiverCreateInput): Promise<ERPCaregiver>;
  updateCaregiver(externalId: string, data: CaregiverUpdateInput): Promise<ERPCaregiver>;

  /**
   * Patient operations
   */
  getPatients(filters?: PatientFilter): Promise<ERPPatient[]>;
  getPatient(externalId: string): Promise<ERPPatient>;

  /**
   * Credential operations
   */
  getCredentials(caregiverId: string): Promise<ERPCredential[]>;
  updateCredential(credentialId: string, data: CredentialUpdateInput): Promise<ERPCredential>;

  /**
   * Schedule operations
   */
  getSchedule(caregiverId: string, dateRange: DateRange): Promise<ERPScheduleEntry[]>;

  /**
   * Webhook support (optional)
   */
  supportsWebhooks(): boolean;
  registerWebhook?(event: string, url: string): Promise<string>;
  removeWebhook?(webhookId: string): Promise<void>;
}

/**
 * Abstract base class providing common functionality
 */
export abstract class BaseERPAdapter implements ERPAdapter {
  abstract name: string;
  abstract provider: 'axiscare' | 'hhaexchange' | 'csv_import';

  protected connected: boolean = false;
  protected config?: ERPConfig;

  async connect(config: ERPConfig): Promise<void> {
    this.config = config;
    await this.validateConnection();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = undefined;
  }

  isConnected(): boolean {
    return this.connected;
  }

  supportsWebhooks(): boolean {
    return false;
  }

  /**
   * Validate connection to ERP system
   * Must be implemented by subclasses
   */
  protected abstract validateConnection(): Promise<void>;

  /**
   * All CRUD operations must be implemented by subclasses
   */
  abstract getCaregivers(filters?: CaregiverFilter): Promise<ERPCaregiver[]>;
  abstract getCaregiver(externalId: string): Promise<ERPCaregiver>;
  abstract createCaregiver(data: CaregiverCreateInput): Promise<ERPCaregiver>;
  abstract updateCaregiver(externalId: string, data: CaregiverUpdateInput): Promise<ERPCaregiver>;

  abstract getPatients(filters?: PatientFilter): Promise<ERPPatient[]>;
  abstract getPatient(externalId: string): Promise<ERPPatient>;

  abstract getCredentials(caregiverId: string): Promise<ERPCredential[]>;
  abstract updateCredential(credentialId: string, data: CredentialUpdateInput): Promise<ERPCredential>;

  abstract getSchedule(caregiverId: string, dateRange: DateRange): Promise<ERPScheduleEntry[]>;
}
