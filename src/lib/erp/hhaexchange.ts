/**
 * HHAeXchange ERP Adapter
 * Implements ERPAdapter for HHAeXchange system with OAuth 2.0
 */

import { BaseERPAdapter } from './adapter';
import {
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
  ERPConfig,
  ERPAuthError,
  ERPRateLimitError,
  ERPNotFoundError,
  ERPValidationError,
} from './types';
import { normalizeCaregiver, normalizePatient, normalizeCredential } from './normalizer';

/**
 * HHAeXchange OAuth token state
 */
interface HHAeXchangeToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
}

/**
 * HHAeXchange HTTP client with OAuth 2.0 and rate limiting
 */
class HHAeXchangeClient {
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private stateCode: string;
  private token?: HHAeXchangeToken;

  constructor(baseUrl: string, clientId: string, clientSecret: string, stateCode: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.stateCode = stateCode;
  }

  /**
   * Get or refresh OAuth token
   */
  async getToken(): Promise<string> {
    // Check if token is still valid
    if (this.token && this.token.expires_at > Date.now()) {
      return this.token.access_token;
    }

    // Request new token
    const tokenUrl = `${this.baseUrl}/oauth/token`;
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        state: this.stateCode,
      }).toString(),
    });

    if (!response.ok) {
      throw new ERPAuthError('Failed to obtain OAuth token', {
        status: response.status,
        body: await response.text(),
      });
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    this.token = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      expires_at: Date.now() + data.expires_in * 1000 - 60000, // 1 minute buffer
    };

    return this.token.access_token;
  }

  async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const token = await this.getToken();
    const url = `${this.baseUrl}${endpoint}`;
    const fetchHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...headers,
    };

    try {
      const response = await fetch(url, {
        method,
        headers: fetchHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        throw new ERPRateLimitError('Rate limit exceeded', waitTime, { url });
      }

      // Handle authentication errors
      if (response.status === 401) {
        // Clear token and retry once
        this.token = undefined;
        const retryToken = await this.getToken();
        const retryHeaders: HeadersInit = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${retryToken}`,
          ...headers,
        };

        const retryResponse = await fetch(url, {
          method,
          headers: retryHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!retryResponse.ok) {
          throw new ERPAuthError('Invalid credentials', { url });
        }

        return (await retryResponse.json()) as T;
      }

      // Handle not found
      if (response.status === 404) {
        throw new ERPNotFoundError('Resource not found', { url, endpoint });
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HHAeXchange API error: ${response.status} - ${errorBody}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (
        error instanceof ERPAuthError ||
        error instanceof ERPRateLimitError ||
        error instanceof ERPNotFoundError
      ) {
        throw error;
      }
      throw new Error(
        `HHAeXchange request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * HHAeXchange adapter implementation
 */
export class HHAeXchangeAdapter extends BaseERPAdapter {
  name = 'HHAeXchange';
  provider: 'hhaexchange' = 'hhaexchange';

  private client?: HHAeXchangeClient;

  protected async validateConnection(): Promise<void> {
    if (
      !this.config?.base_url ||
      !this.config?.client_id ||
      !this.config?.client_secret ||
      !this.config?.state_code
    ) {
      throw new ERPValidationError(
        'Missing required config: base_url, client_id, client_secret, state_code'
      );
    }

    this.client = new HHAeXchangeClient(
      this.config.base_url,
      this.config.client_id,
      this.config.client_secret,
      this.config.state_code
    );

    try {
      // Test connection by fetching token
      await this.client.getToken();
    } catch (error) {
      throw new ERPAuthError(
        `Failed to connect to HHAeXchange: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async disconnect(): Promise<void> {
    this.client = undefined;
    await super.disconnect();
  }

  /**
   * Fetch all caregivers
   */
  async getCaregivers(filters?: CaregiverFilter): Promise<ERPCaregiver[]> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const params = new URLSearchParams();
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    if (filters?.search) params.append('search', filters.search);
    if (filters?.active_only) params.append('status', 'Active');

    const stateCode = this.config?.state_code || 'US';
    const query = params.toString();
    const endpoint = `/api/v1/${stateCode}/caregivers${query ? '?' + query : ''}`;

    const response = await this.client.request<{ caregivers: Record<string, unknown>[] }>(
      'GET',
      endpoint
    );

    if (!Array.isArray(response.caregivers)) {
      return [];
    }

    return response.caregivers.map((caregiver) => {
      const normalized = normalizeCaregiver('hhaexchange', caregiver as Record<string, unknown>);
      return {
        external_id: normalized.external_id,
        source_system: 'hhaexchange',
        first_name: normalized.first_name,
        last_name: normalized.last_name,
        email: normalized.email,
        phone: normalized.phone,
        ssn: normalized.ssn,
        date_of_birth: normalized.date_of_birth,
        address: normalized.address,
        city: normalized.city,
        state: normalized.state,
        zip: normalized.zip,
        license_number: normalized.license_number,
        specializations: normalized.specializations,
        is_active: normalized.is_active,
        hire_date: normalized.hire_date,
        termination_date: normalized.termination_date,
        raw_data: caregiver,
      } as ERPCaregiver;
    });
  }

  /**
   * Fetch a single caregiver by external ID
   */
  async getCaregiver(externalId: string): Promise<ERPCaregiver> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const stateCode = this.config?.state_code || 'US';
    const response = await this.client.request<Record<string, unknown>>(
      'GET',
      `/api/v1/${stateCode}/caregivers/${externalId}`
    );

    const normalized = normalizeCaregiver('hhaexchange', response);
    return {
      external_id: normalized.external_id,
      source_system: 'hhaexchange',
      first_name: normalized.first_name,
      last_name: normalized.last_name,
      email: normalized.email,
      phone: normalized.phone,
      ssn: normalized.ssn,
      date_of_birth: normalized.date_of_birth,
      address: normalized.address,
      city: normalized.city,
      state: normalized.state,
      zip: normalized.zip,
      license_number: normalized.license_number,
      specializations: normalized.specializations,
      is_active: normalized.is_active,
      hire_date: normalized.hire_date,
      termination_date: normalized.termination_date,
      raw_data: response,
    };
  }

  /**
   * Create a new caregiver
   */
  async createCaregiver(data: CaregiverCreateInput): Promise<ERPCaregiver> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const payload = {
      CaregiverFirstName: data.first_name,
      CaregiverLastName: data.last_name,
      CaregiverEmail: data.email,
      CaregiverPhone: data.phone,
      CaregiverSSN: data.ssn,
      CaregiverDOB: data.date_of_birth,
      CaregiverAddress: data.address,
      CaregiverCity: data.city,
      CaregiverState: data.state,
      CaregiverZip: data.zip,
      LicenseNo: data.license_number,
      Status: data.is_active ? 'Active' : 'Inactive',
    };

    const stateCode = this.config?.state_code || 'US';
    const response = await this.client.request<Record<string, unknown>>(
      'POST',
      `/api/v1/${stateCode}/caregivers`,
      payload
    );

    const normalized = normalizeCaregiver('hhaexchange', response, data.specializations);
    return {
      external_id: normalized.external_id,
      source_system: 'hhaexchange',
      first_name: normalized.first_name,
      last_name: normalized.last_name,
      email: normalized.email,
      phone: normalized.phone,
      ssn: normalized.ssn,
      date_of_birth: normalized.date_of_birth,
      address: normalized.address,
      city: normalized.city,
      state: normalized.state,
      zip: normalized.zip,
      license_number: normalized.license_number,
      specializations: normalized.specializations,
      is_active: normalized.is_active,
      hire_date: normalized.hire_date,
      termination_date: normalized.termination_date,
      raw_data: response,
    };
  }

  /**
   * Update an existing caregiver
   */
  async updateCaregiver(externalId: string, data: CaregiverUpdateInput): Promise<ERPCaregiver> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const payload: Record<string, unknown> = {};
    if (data.first_name) payload.CaregiverFirstName = data.first_name;
    if (data.last_name) payload.CaregiverLastName = data.last_name;
    if (data.email) payload.CaregiverEmail = data.email;
    if (data.phone) payload.CaregiverPhone = data.phone;
    if (data.ssn) payload.CaregiverSSN = data.ssn;
    if (data.date_of_birth) payload.CaregiverDOB = data.date_of_birth;
    if (data.address) payload.CaregiverAddress = data.address;
    if (data.city) payload.CaregiverCity = data.city;
    if (data.state) payload.CaregiverState = data.state;
    if (data.zip) payload.CaregiverZip = data.zip;
    if (data.license_number) payload.LicenseNo = data.license_number;
    if (data.is_active !== undefined) {
      payload.Status = data.is_active ? 'Active' : 'Inactive';
    }

    const stateCode = this.config?.state_code || 'US';
    const response = await this.client.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/${stateCode}/caregivers/${externalId}`,
      payload
    );

    const normalized = normalizeCaregiver('hhaexchange', response, data.specializations);
    return {
      external_id: normalized.external_id,
      source_system: 'hhaexchange',
      first_name: normalized.first_name,
      last_name: normalized.last_name,
      email: normalized.email,
      phone: normalized.phone,
      ssn: normalized.ssn,
      date_of_birth: normalized.date_of_birth,
      address: normalized.address,
      city: normalized.city,
      state: normalized.state,
      zip: normalized.zip,
      license_number: normalized.license_number,
      specializations: normalized.specializations,
      is_active: normalized.is_active,
      hire_date: normalized.hire_date,
      termination_date: normalized.termination_date,
      raw_data: response,
    };
  }

  /**
   * Fetch all patients
   */
  async getPatients(filters?: PatientFilter): Promise<ERPPatient[]> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const params = new URLSearchParams();
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    if (filters?.search) params.append('search', filters.search);
    if (filters?.active_only) params.append('status', 'Active');

    const stateCode = this.config?.state_code || 'US';
    const query = params.toString();
    const endpoint = `/api/v1/${stateCode}/patients${query ? '?' + query : ''}`;

    const response = await this.client.request<{ patients: Record<string, unknown>[] }>(
      'GET',
      endpoint
    );

    if (!Array.isArray(response.patients)) {
      return [];
    }

    return response.patients.map((patient) => {
      const normalized = normalizePatient('hhaexchange', patient as Record<string, unknown>);
      return {
        external_id: normalized.external_id,
        source_system: 'hhaexchange',
        first_name: normalized.first_name,
        last_name: normalized.last_name,
        date_of_birth: normalized.date_of_birth,
        phone: normalized.phone,
        email: normalized.email,
        address: normalized.address,
        city: normalized.city,
        state: normalized.state,
        zip: normalized.zip,
        is_active: normalized.is_active,
        raw_data: patient,
      } as ERPPatient;
    });
  }

  /**
   * Fetch a single patient by external ID
   */
  async getPatient(externalId: string): Promise<ERPPatient> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const stateCode = this.config?.state_code || 'US';
    const response = await this.client.request<Record<string, unknown>>(
      'GET',
      `/api/v1/${stateCode}/patients/${externalId}`
    );

    const normalized = normalizePatient('hhaexchange', response);
    return {
      external_id: normalized.external_id,
      source_system: 'hhaexchange',
      first_name: normalized.first_name,
      last_name: normalized.last_name,
      date_of_birth: normalized.date_of_birth,
      phone: normalized.phone,
      email: normalized.email,
      address: normalized.address,
      city: normalized.city,
      state: normalized.state,
      zip: normalized.zip,
      is_active: normalized.is_active,
      raw_data: response,
    };
  }

  /**
   * Fetch credentials for a caregiver
   */
  async getCredentials(caregiverId: string): Promise<ERPCredential[]> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const stateCode = this.config?.state_code || 'US';
    const response = await this.client.request<{ credentials: Record<string, unknown>[] }>(
      'GET',
      `/api/v1/${stateCode}/caregivers/${caregiverId}/credentials`
    );

    if (!Array.isArray(response.credentials)) {
      return [];
    }

    return response.credentials.map((cred) => {
      const normalized = normalizeCredential('hhaexchange', cred as Record<string, unknown>);
      return {
        external_id: normalized.external_id,
        source_system: 'hhaexchange',
        caregiver_external_id: normalized.caregiver_external_id,
        credential_type: normalized.credential_type,
        credential_name: normalized.credential_name,
        status: normalized.status,
        expiration_date: normalized.expiration_date,
        issue_date: normalized.issue_date,
        credential_number: normalized.credential_number,
        issuing_body: normalized.issuing_body,
        raw_data: cred,
      } as ERPCredential;
    });
  }

  /**
   * Update a credential
   */
  async updateCredential(credentialId: string, data: CredentialUpdateInput): Promise<ERPCredential> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const payload: Record<string, unknown> = {};
    if (data.status) payload.Status = data.status;
    if (data.expiration_date) payload.ExpirationDate = data.expiration_date;
    if (data.issue_date) payload.IssueDate = data.issue_date;
    if (data.credential_number) payload.CredentialNumber = data.credential_number;
    if (data.issuing_body) payload.IssuingBody = data.issuing_body;

    const stateCode = this.config?.state_code || 'US';
    const response = await this.client.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/${stateCode}/credentials/${credentialId}`,
      payload
    );

    const normalized = normalizeCredential('hhaexchange', response);
    return {
      external_id: normalized.external_id,
      source_system: 'hhaexchange',
      caregiver_external_id: normalized.caregiver_external_id,
      credential_type: normalized.credential_type,
      credential_name: normalized.credential_name,
      status: normalized.status,
      expiration_date: normalized.expiration_date,
      issue_date: normalized.issue_date,
      credential_number: normalized.credential_number,
      issuing_body: normalized.issuing_body,
      raw_data: response,
    };
  }

  /**
   * Fetch schedule entries for a caregiver within a date range
   */
  async getSchedule(caregiverId: string, dateRange: DateRange): Promise<ERPScheduleEntry[]> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const stateCode = this.config?.state_code || 'US';
    const params = new URLSearchParams();
    params.append('startDate', dateRange.start_date);
    params.append('endDate', dateRange.end_date);

    const response = await this.client.request<{ schedules: Record<string, unknown>[] }>(
      'GET',
      `/api/v1/${stateCode}/caregivers/${caregiverId}/schedule?${params.toString()}`
    );

    if (!Array.isArray(response.schedules)) {
      return [];
    }

    return response.schedules.map((schedule) => ({
      external_id: String(schedule.id || ''),
      source_system: 'hhaexchange',
      caregiver_external_id: caregiverId,
      patient_external_id: schedule.patient_id ? String(schedule.patient_id) : undefined,
      start_time: String(schedule.start_time || ''),
      end_time: String(schedule.end_time || ''),
      shift_type: schedule.shift_type ? String(schedule.shift_type) : undefined,
      status: schedule.status ? String(schedule.status) : undefined,
      raw_data: schedule,
    }));
  }

  /**
   * HHAeXchange supports webhooks
   */
  supportsWebhooks(): boolean {
    return true;
  }

  /**
   * Register a webhook
   */
  async registerWebhook(event: string, url: string): Promise<string> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const payload = {
      event,
      url,
    };

    const stateCode = this.config?.state_code || 'US';
    const response = await this.client.request<{ webhook_id: string }>(
      'POST',
      `/api/v1/${stateCode}/webhooks`,
      payload
    );

    return response.webhook_id;
  }

  /**
   * Remove a webhook
   */
  async removeWebhook(webhookId: string): Promise<void> {
    if (!this.client) throw new Error('Not connected to HHAeXchange');

    const stateCode = this.config?.state_code || 'US';
    await this.client.request('DELETE', `/api/v1/${stateCode}/webhooks/${webhookId}`);
  }
}
