/**
 * AlertsList Component
 * Displays compliance alerts organized by severity
 */

'use client';

import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Bell, X } from 'lucide-react';

interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  affectedPerson?: string;
  actionUrl?: string;
}

interface AlertsListProps {
  alerts: Alert[];
}

export default function AlertsList({ alerts }: AlertsListProps) {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const handleDismiss = (alertId: string) => {
    const newDismissed = new Set(dismissedAlerts);
    newDismissed.add(alertId);
    setDismissedAlerts(newDismissed);

    // TODO: Call API to dismiss alert
    // fetch(`/api/compliance/alerts/${alertId}`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ action: 'dismiss' }),
    // });
  };

  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));

  const groupedAlerts = {
    critical: visibleAlerts.filter((a) => a.severity === 'critical'),
    warning: visibleAlerts.filter((a) => a.severity === 'warning'),
    info: visibleAlerts.filter((a) => a.severity === 'info'),
  };

  const severityConfig = {
    critical: {
      icon: AlertCircle,
      bgColor: 'bg-red-50',
      borderColor: 'border-l-red-600',
      textColor: 'text-red-900',
      badgeBg: 'bg-red-100',
      badgeText: 'text-red-700',
      label: 'Critical',
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-yellow-50',
      borderColor: 'border-l-yellow-600',
      textColor: 'text-yellow-900',
      badgeBg: 'bg-yellow-100',
      badgeText: 'text-yellow-700',
      label: 'Warning',
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-50',
      borderColor: 'border-l-blue-600',
      textColor: 'text-blue-900',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-700',
      label: 'Information',
    },
  };

  return (
    <div className="space-y-6">
      {Object.entries(groupedAlerts).map(([severity, alertList]) => {
        const config = severityConfig[severity as keyof typeof severityConfig];
        const Icon = config.icon;

        if (alertList.length === 0) return null;

        return (
          <div key={severity}>
            <h3 className={`text-sm font-bold ${config.textColor} mb-3 flex items-center gap-2`}>
              <Icon className="w-5 h-5" />
              {config.label} ({alertList.length})
            </h3>

            <div className="space-y-2">
              {alertList.map((alert) => (
                <div
                  key={alert.id}
                  className={`border-l-4 rounded-r-lg p-4 flex items-start justify-between ${config.bgColor} ${config.borderColor}`}
                  role="alert"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`font-semibold ${config.textColor}`}>{alert.title}</h4>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${config.badgeBg} ${config.badgeText}`}>
                        {config.label}
                      </span>
                    </div>
                    <p className={`text-sm ${config.textColor} opacity-90 mb-1`}>{alert.description}</p>
                    {alert.affectedPerson && (
                      <p className={`text-xs ${config.textColor} opacity-75`}>
                        Affected: <span className="font-semibold">{alert.affectedPerson}</span>
                      </p>
                    )}
                    {alert.actionUrl && (
                      <button className={`text-sm font-semibold mt-2 hover:opacity-75 transition ${config.textColor}`}>
                        → Take Action
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className={`flex-shrink-0 p-1 hover:opacity-75 transition ${config.textColor}`}
                    title="Dismiss alert"
                    aria-label={`Dismiss ${alert.title} alert`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {visibleAlerts.length === 0 && (
        <div className="text-center py-8">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-semibold">No active alerts</p>
          <p className="text-gray-500 text-sm">Your compliance status is good!</p>
        </div>
      )}
    </div>
  );
}
