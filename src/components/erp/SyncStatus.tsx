/**
 * Sync Status Component
 * Displays connection status, last sync time, and sync controls
 */

'use client';

import { useState, useEffect } from 'react';

interface SyncStatusProps {
  provider: string;
  lastSyncTime?: string;
  recordsSynced?: number;
  isConnected?: boolean;
  onSync?: () => Promise<void>;
  isLoading?: boolean;
}

export function SyncStatus({
  provider,
  lastSyncTime,
  recordsSynced,
  isConnected = false,
  onSync,
  isLoading = false,
}: SyncStatusProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsSyncing(isLoading);
  }, [isLoading]);

  const handleSync = async () => {
    if (!onSync) return;

    try {
      setIsSyncing(true);
      setError(null);
      await onSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const lastSyncDate = lastSyncTime ? new Date(lastSyncTime) : null;
  const lastSyncDisplay = lastSyncDate
    ? lastSyncDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Never';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Connection indicator */}
          <div className="flex items-center space-x-2">
            <div
              className={`h-3 w-3 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm font-medium text-gray-700">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Provider name */}
          <div className="border-l border-gray-300 pl-4">
            <p className="text-sm text-gray-600">Provider</p>
            <p className="font-medium text-gray-900">{provider}</p>
          </div>

          {/* Last sync time */}
          <div className="border-l border-gray-300 pl-4">
            <p className="text-sm text-gray-600">Last Sync</p>
            <p className="font-medium text-gray-900">{lastSyncDisplay}</p>
          </div>

          {/* Records synced */}
          {recordsSynced !== undefined && (
            <div className="border-l border-gray-300 pl-4">
              <p className="text-sm text-gray-600">Records Synced</p>
              <p className="font-medium text-gray-900">{recordsSynced.toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={isSyncing || !isConnected}
          className={`rounded-md px-4 py-2 font-medium text-white transition-colors ${
            isSyncing || !isConnected
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isSyncing ? (
            <span className="flex items-center space-x-2">
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Syncing...</span>
            </span>
          ) : (
            'Sync Now'
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
