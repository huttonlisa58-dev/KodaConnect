'use client';

/**
 * StatsCard Component
 * Reusable stats card with icon, value, label, and trend indicator
 */

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  onClick?: () => void;
}

const colorClasses = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  orange: 'bg-orange-100 text-orange-600',
  red: 'bg-red-100 text-red-600',
  purple: 'bg-purple-100 text-purple-600',
};

const trendClasses = {
  positive: 'text-green-600',
  negative: 'text-red-600',
};

export function StatsCard({
  icon,
  value,
  label,
  trend,
  color = 'blue',
  onClick,
}: StatsCardProps) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>

          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${
              trend.isPositive ? trendClasses.positive : trendClasses.negative
            }`}>
              {trend.isPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{trend.value}% from last month</span>
            </div>
          )}
        </div>

        <div className={`rounded-lg p-3 ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
