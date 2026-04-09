'use client';

/**
 * Session Timeout Warning Modal
 * Displays countdown when session is about to expire
 * Allows user to stay logged in or logout
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, LogOut, Check } from 'lucide-react';

interface TimeoutWarningProps {
  timeRemaining: number; // milliseconds
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

/**
 * TimeoutWarning Component
 * Shows a modal with countdown and action buttons
 */
export function TimeoutWarning({
  timeRemaining,
  onStayLoggedIn,
  onLogout,
}: TimeoutWarningProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(Math.ceil(timeRemaining / 1000));
  const [isAutoLoggingOut, setIsAutoLoggingOut] = useState(false);

  /**
   * Convert seconds to MM:SS format
   */
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Update countdown timer
   */
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          // Time's up, auto logout
          setIsAutoLoggingOut(true);
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onLogout]);

  return (
    <>
      {/* Dark overlay */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white rounded-lg shadow-lg p-8 animate-in">
          {/* Header with icon */}
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-full bg-amber-100 p-2">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isAutoLoggingOut ? 'Logging out...' : 'Session Timeout Warning'}
            </h2>
          </div>

          {/* Message */}
          <p className="text-gray-600 mb-6">
            {isAutoLoggingOut
              ? 'Your session has expired. You are being logged out.'
              : 'Your session is about to expire due to inactivity.'}
          </p>

          {/* Countdown timer */}
          {!isAutoLoggingOut && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Time remaining:</p>
              <p className="text-3xl font-mono font-bold text-amber-600">
                {formatTime(secondsRemaining)}
              </p>
            </div>
          )}

          {/* Action buttons */}
          {!isAutoLoggingOut && (
            <div className="flex gap-3">
              {/* Stay logged in button */}
              <button
                onClick={onStayLoggedIn}
                className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 active:bg-green-800 transition-colors flex items-center justify-center gap-2"
              >
                <Check className="h-4 w-4" />
                Stay Logged In
              </button>

              {/* Logout button */}
              <button
                onClick={onLogout}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-medium hover:bg-gray-300 active:bg-gray-400 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          )}

          {/* Auto logout message */}
          {isAutoLoggingOut && (
            <div className="flex justify-center pt-4">
              <div className="animate-spin">
                <div className="h-5 w-5 border-2 border-gray-300 border-t-green-600 rounded-full" />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
