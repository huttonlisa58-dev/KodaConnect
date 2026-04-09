/**
 * AxisCare ERP Adapter
 * Implements ERPAdapter for AxisCare system
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
 * AxisCare HTTP client with rate limiting and retry logic
 */
class AxisCareClient {
  private baseUrl: string;
  private apiKey: string;
  private retryCount = 0;
  private maxRetries = 3;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
  }

  async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const fetchHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...headers,
    };

    try {
      const response = await fetch(url, {
        method,
        headers: fetchHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * Math.pow(2, this.retryCount);

        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          return this.request(method, endpoint, body, headers);
        }

        throw new ERPRateLimitError(
          'Rate limit exceeded after retries',
          waitTime,
          { url, retryAfter }
        );
      }

      // Handle authentication errors
      if (response.status === 401) {
        throw new ERPAuthError('Invalid API credentials', { url });
      }

      // Handle not found
      if (response.status === 404) {
        throw new ERPNotFoundError('Resource not found', { url, endpoint });
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`AxisCare API error: ${response.status} - ${errorBody}`);
      }

      this.retryCount = 0;
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.message.includes('AxisCare API error')) {
        throw error;
      }
      throw new Error(`AxisCare request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * AxisCare adapter implementation
 */
export class AxisCareAdapter extends BaseERPAdapter {
  name = 'AxisCare';
  provider: 'axiscare' = 'axiscare';

  private client?: AxisCareClient;

  protected async validateConnection(): Promise<void> {
    if (!this.config?.base_url || !this.config?.api_key) {
      throw new ERPValidationError('Missing required config: base_url and api_key');
    }

    this.client = new AxisCareClient(this.config.base_url, this.config.api_key);

    try {
      // Test connection by fetching employee count
      await this.client.request('GET', '/api/v1/employees?limit=1');
    } catch (error) {
      throw new ERPAuthError(`Failed to connect to AxisCare: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<void> {
    this.client = undefined;
    await super.disconnect();
  }

  /**
   * Fetch all caregivers (employees in AxisCare)
   */
  async getCaregivers(filters?: CaregiverFilter): Promise<ERPCaregiver[]> {
    if (!this.client) throw new Error('Not connected to AxisCare');

    const params = new URLSearchParams();
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    if (filters?.search) params.append('search', filters.search);
    if (filters?.active_only) params.append('active', 'true');

    const query = params.toString();
    const endpoint = `/api/v1/employees${query ? '?' + query : ''}`;

    const response = await this.client.request<{ employees: Record<string, unknown>[] }>('GET', endpoint);

    if (!Array.isArray(response.employees)) {
      return [];
    }

    return response.employees.map((emp) => {
      const normalized = normalizeCaregiver('axiscare', emp as Record<string, unknown>);
      return {
        external_id: normalized.external_id,
        source_system: 'axiscare',
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
        raw_data: emp,
      } as ERPCaregiver;
    });
  }

  /**
   * Fetch a single caregiver by external ID
   */
  async getCaregiver(externalId: string): Promise<ERPCaregiver> {
    if (!this.client) throw new Error('Not connected to AxisCare');

    const response = await this.client.request<Record<string, unknown>>(
      'GET',
      `/api/v1/employees/${externalId}`
    );

    const normalized = normalizeCaregiver('axiscare', response);
    return {
      external_id: normalized.external_id,
      source_system: 'axiscare',
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
    if (!this.client) throw new Error('Not connected to AxisCare');

    const payload = {
      FirstName: data.first_name,
      LastName: data.last_name,
      Email: data.email,
      PhoneNumber: data.phone,
      SSN: data.ssn,
      DateOfBirth: data.date_of_birth,
      Address: data.address,
      City: data.city,
      State: data.state,
      ZipCode: data.zip,
      LicenseNumber: data.license_number,
      IsActive: data.is_active ?? true,
    };

    const response = await this.client.request<Record<string, unknown>>(
      'POST',
      '/api/v1/employees',
      payload
    );

    const normalized = normalizeCaregiver('axiscare', response, data.specializations);
    return {
      external_id: normalized.external_id,
      source_system: 'axiscare',
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
    if (!this.client) throw new Error('Not connected to AxisCare');

    const payload: Record<string, unknown> = {};
    if (data.first_name) payload.FirstName = data.first_name;
    if (data.last_name) payload.LastName = data.last_name;
    if (data.email) payload.Email = data.email;
    if (data.phone) payload.PhoneNumber = data.phone;
    if (data.ssn) payload.SSN = data.ssn;
    if (data.date_of_birth) payload.DateOfBirth = data.date_of_birth;
    if (data.address) payload.Address = data.address;
    if (data.city) payload.City = data.city;
    if (data.state) payload.State = data.state;
    if (data.zip) payload.ZipCode = data.zip;
    if (data.license_number) payload.LicenseNumber = data.license_number;
    if (data.is_active !== undefined) payload.IsActive = data.is_active;

    const response = await this.client.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/employees/${externalId}`,
      payload
    );

    const normalized = normalizeCaregiver('axiscare', response, data.specializations);
    return {
      external_id: normalized.external_id,
      source_system: 'axiscare',
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
   * Fetch all patients (clients in AxisCare)
   */
  async getPatients(filters?: PatientFilter): Promise<ERPPatient[]> {
    if (!this.client) throw new Error('Not connected to AxisCare');

    const params = new URLSearchParams();
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    if (filters?.search) params.append('search', filters.search);
    if (filters?.active_only) params.append('active', 'true');

    const query = params.toString();
    const endpoint = `/api/v1/clients${query ? '?' + query : ''}`;

    const response = await this.client.request<{ clients: Record<string, unknown>[] }>('GET', endpoint);

    if (!Array.isArray(response.clients)) {
      return [];
    }

    return response.clients.map((client) => {
      const normalized = normalizePatient('axiscare', client as Record<string, unknown>);
      return {
        external_id: normalized.external_id,
        source_system: 'axiscare',
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
        raw_data: client,
      } as ERPPatient;
    });
  }

  /**
   * Fetch a single patient by external ID
   */
  async getPatient(externalId: string): Promise<ERPPatient> {
    if (!this.client) throw new Error('Not connected to AxisCare');

    const response = await this.client.request<Record<string, unknown>>(
      'GET',
      `/api/v1/clients/${externalId}`
    );

    const normalized = normalizePatient('axiscare', response);
    return {
      external_id: normalized.external_id,
      source_system: 'axiscare',
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
    if (!this.client) throw new Error('Not connected to AxisCare');

    const response = await this.client.request<{ credentials: Record<string, unknown>[] }>(
      'GET',
      `/api/v1/employees/${caregiverId}/credentials`
    );

    if (!Array.isArray(response.credentials)) {
      return [];
    }

    return response.credentials.map((cred) => {
      const normalized = normalizeCredential('axiscare', cred as Record<string, unknown>);
      return {
        external_id: normalized.external_id,
        source_system: 'axiscare',
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
    if (!this.client) throw new Error('Not connected to AxisCare');

    const payload: Record<string, unknown> = {};
    if (data.status) payload.Status = data.status;
    if (data.expiration_date) payload.ExpirationDate = data.expiration_date;
    if (data.issue_date) payload.IssueDate = data.issue_date;
    if (data.credential_number) payload.CredentialNumber = data.credential_number;
    if (data.issuing_body) payload.IssuingBody = data.issuing_body;

    const response = await this.client.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/credentials/${credentialId}`,
      payload
    );

    const normalized = normalizeCredential('axiscare', response);
    return {
      external_id: normalized.external_id,
      source_system: 'axiscare',
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
    if (!this.client) throw new Error('Not connected to AxisCare');

    const params = new URLSearchParams();
    params.append('startDate', dateRange.start_date);
    params.append('endDate', dateRange.end_date);

    const response = await this.client.request<{ schedules: Record<string, unknown>[] }>(
      'GET',
      `/api/v1/employees/${caregiverId}/schedules?${params.toString()}`
    );

    if (!Array.isArray(response.schedules)) {
      return [];
    }

    return response.schedules.map((schedule) => ({
      external_id: String(schedule.id || ''),
      source_system: 'axiscare',
      caregiver_external_id: caregiverId,
      patient_external_id: schedule.client_id ? String(schedule.client_id) : undefined,
      start_time: String(schedule.start_time || ''),
      end_time: String(schedule.end_time || ''),
      shift_type: schedule.shift_type ? String(schedule.shift_type) : undefined,
      status: schedule.status ? String(schedule.status) : undefined,
      raw_data: schedule,
    }));
  }

  /**
   * AxisCare supports webhooks
   */
  supportsWebhooks(): boolean {
    return true;
  }

  /**
   * Register a webhook
   */
  async registerWebhook(event: string, url: string): Promise<string> {
    if (!this.client) throw new Error('Not connected to AxisCare');

    const payload = {
      event,
      url,
    };

    const response = await this.client.request<{ webhook_id: string }>(
      'POST',
      '/api/v1/webhooks',
      payload
    );

    return response.webhook_id;
  }

  /**
   * Remove a webhook
   */
  async removeWebhook(webhookId: string): Promise<void> {
    if (!this.client) throw new Error('Not connected to AxisCare');

    await this.client.request('DELETE', `/api/v1/webhooks/${webhookId}`);
  }
}
