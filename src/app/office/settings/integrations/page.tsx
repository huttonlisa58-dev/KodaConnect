/**
 * ERP Integration Settings Page
 * Manages ERP connections, configuration, sync controls, and data import
 */

'use client';

import { useState, useEffect } from 'react';
import { SyncStatus } from '@/components/erp/SyncStatus';
import { DataImportWizard } from '@/components/erp/DataImportWizard';
import { ERPConfig } from '@/lib/erp/types';

type Provider = 'axiscare' | 'hhaexchange' | 'csv_import' | null;
type ActiveTab = 'connection' | 'sync' | 'import';

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  synced_records: number;
  completed_at: string;
}

export default function IntegrationsPage() {
  const [provider, setProvider] = useState<Provider>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('connection');
  const [config, setConfig] = useState<Partial<ERPConfig>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncLog[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string | undefined>(undefined);

  // Load existing configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/erp/config?company_id=current');
        if (response.ok) {
          const data = await response.json() as { config: { provider: string; connected: boolean; last_synced: string | null } };
          if (data.config.provider) {
            setProvider(data.config.provider as Provider);
            setIsConnected(data.config.connected);
            setLastSyncTime(data.config.last_synced ?? undefined);
          }
        }
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    };

    loadConfig();
  }, []);

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    setConfig({});
    setError(null);
  };

  const handleConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value,
      ...(provider ? { provider } : {}),
    }));
  };

  const handleTestConnection = async () => {
    if (!provider || !config) {
      setError('Please select a provider and fill in all required fields');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/erp/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          config: {
            provider,
            ...config,
          },
        }),
      });

      const data = await response.json() as { success: boolean; connected: boolean; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Connection test failed');
      }

      setIsConnected(data.connected);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!provider) {
      setError('Please select a provider');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/erp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: 'current',
          provider,
          config: {
            provider,
            ...config,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    if (!provider || !isConnected) {
      setError('ERP is not connected');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/erp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: 'current',
          provider,
          config: config,
          sync_type: 'full',
        }),
      });

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      const data = await response.json() as { data: unknown };
      setLastSyncTime(new Date().toISOString());
      // In production, would refresh sync history here
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
          <p className="mt-1 text-gray-600">Manage ERP system connections and data sync</p>
        </div>

        {/* Error alert */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex space-x-8">
            {(['connection', 'sync', 'import'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                {tab === 'connection' && 'Connection'}
                {tab === 'sync' && 'Sync Status'}
                {tab === 'import' && 'Import Data'}
              </button>
            ))}
          </nav>
        </div>

        {/* Connection Tab */}
        {activeTab === 'connection' && (
          <div className="space-y-6">
            {/* Provider Selection */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">ERP Provider</h2>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { id: 'axiscare', name: 'AxisCare', description: 'Token-based API' },
                  { id: 'hhaexchange', name: 'HHAeXchange', description: 'OAuth 2.0' },
                  { id: 'csv_import', name: 'Manual Upload', description: 'CSV/Excel' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProviderChange(p.id as Provider)}
                    className={`rounded-lg border-2 p-4 text-left transition-colors ${
                      provider === p.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <h3 className="font-medium text-gray-900">{p.name}</h3>
                    <p className="mt-1 text-sm text-gray-600">{p.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Configuration Form */}
            {provider && provider !== 'csv_import' && (
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Configuration</h2>

                <div className="space-y-4">
                  {provider === 'axiscare' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Base URL *
                        </label>
                        <input
                          type="url"
                          placeholder="https://api.axiscare.com"
                          value={config.base_url || ''}
                          onChange={(e) => handleConfigChange('base_url', e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          API Key *
                        </label>
                        <input
                          type="password"
                          placeholder="Your AxisCare API key"
                          value={config.api_key || ''}
                          onChange={(e) => handleConfigChange('api_key', e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                        />
                      </div>
                    </>
                  )}

                  {provider === 'hhaexchange' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Base URL *
                        </label>
                        <input
                          type="url"
                          placeholder="https://api.hhaexchange.com"
                          value={config.base_url || ''}
                          onChange={(e) => handleConfigChange('base_url', e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Client ID *
                        </label>
                        <input
                          type="text"
                          placeholder="Your client ID"
                          value={config.client_id || ''}
                          onChange={(e) => handleConfigChange('client_id', e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Client Secret *
                        </label>
                        <input
                          type="password"
                          placeholder="Your client secret"
                          value={config.client_secret || ''}
                          onChange={(e) => handleConfigChange('client_secret', e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          State Code *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., CA, NY, TX"
                          value={config.state_code || ''}
                          onChange={(e) => handleConfigChange('state_code', e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={handleTestConnection}
                      disabled={isLoading}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
                    >
                      {isLoading ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      onClick={handleSaveConfig}
                      disabled={isLoading}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sync Status Tab */}
        {activeTab === 'sync' && (
          <div className="space-y-6">
            <SyncStatus
              provider={provider || 'None'}
              isConnected={isConnected}
              lastSyncTime={lastSyncTime}
              recordsSynced={0}
              onSync={handleSync}
              isLoading={isLoading}
            />

            {/* Sync History */}
            {syncHistory.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Sync History</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Date</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Type</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Records</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncHistory.map((log) => (
                        <tr key={log.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-900">
                            {new Date(log.completed_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2 text-gray-900">{log.sync_type}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                log.status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-900">{log.synced_records}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import Data Tab */}
        {activeTab === 'import' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Import Data</h2>
            <DataImportWizard importType="caregivers" companyId="current" />
          </div>
        )}
      </div>
    </div>
  );
}
