'use client';

import React, { useEffect, useState } from 'react';
import { OnboardingBundle, BundlePacket } from './types';

interface BundleMobileFlowProps {
  bundleId: string;
  applicantId: string;
  authToken?: string;
}

interface PacketProgress {
  packetId: string;
  completed: boolean;
  submittedAt?: string;
}

type ScreenState = 'loading' | 'packet-form' | 'packet-complete' | 'all-complete' | 'error';

export default function BundleMobileFlow({
  bundleId,
  applicantId,
  authToken,
}: BundleMobileFlowProps) {
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [bundle, setBundle] = useState<OnboardingBundle | null>(null);
  const [packets, setPackets] = useState<BundlePacket[]>([]);
  const [currentPacketIndex, setCurrentPacketIndex] = useState(0);
  const [completedPackets, setCompletedPackets] = useState<PacketProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Load progress from localStorage
  useEffect(() => {
    const savedProgress = localStorage.getItem(`bundle-progress-${bundleId}`);
    if (savedProgress) {
      try {
        const progress = JSON.parse(savedProgress);
        setCompletedPackets(progress.completedPackets || []);
        setCurrentPacketIndex(progress.currentPacketIndex || 0);
      } catch (e) {
        console.warn('Failed to parse saved progress:', e);
      }
    }
  }, [bundleId]);

  // Fetch bundle and packets
  useEffect(() => {
    const fetchBundle = async () => {
      try {
        setScreenState('loading');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`;
        }

        const response = await fetch(`/api/onboarding/bundles/${bundleId}`, {
          headers,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch bundle: ${response.statusText}`);
        }

        const data: OnboardingBundle = await response.json();
        setBundle(data);

        // Filter to applicant-role packets only and sort by order
        const applicantPackets = (data.bundle_packets || [])
          .filter(
            (bp) =>
              bp.packet &&
              bp.packet.role === 'applicant' &&
              bp.packet.form_package_id
          )
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        setPackets(applicantPackets);

        // Initialize completed packets tracking
        if (applicantPackets.length > 0 && completedPackets.length === 0) {
          setCompletedPackets(
            applicantPackets.map((p) => ({
              packetId: p.packet_id,
              completed: false,
            }))
          );
          setScreenState('packet-form');
        } else {
          setScreenState('packet-form');
        }
      } catch (err) {
        console.error('Error fetching bundle:', err);
        setError(err instanceof Error ? err.message : 'Failed to load onboarding');
        setScreenState('error');
      }
    };

    fetchBundle();
  }, [bundleId, authToken]);

  // Save progress to localStorage
  useEffect(() => {
    const progress = {
      currentPacketIndex,
      completedPackets,
      lastSaved: new Date().toISOString(),
    };
    localStorage.setItem(`bundle-progress-${bundleId}`, JSON.stringify(progress));
  }, [currentPacketIndex, completedPackets, bundleId]);

  const handlePacketSubmit = async () => {
    // Mark current packet as completed
    const updatedCompleted = [...completedPackets];
    if (updatedCompleted[currentPacketIndex]) {
      updatedCompleted[currentPacketIndex].completed = true;
      updatedCompleted[currentPacketIndex].submittedAt = new Date().toISOString();
    }
    setCompletedPackets(updatedCompleted);

    // Check if there are more incomplete packets
    const nextIncompleteIndex = updatedCompleted.findIndex((p) => !p.completed);

    setIsTransitioning(true);

    if (nextIncompleteIndex !== -1) {
      // Show transition screen for next packet
      setScreenState('packet-complete');
    } else {
      // All packets complete
      setScreenState('all-complete');
    }
  };

  const handleContinueToNext = () => {
    const nextIncompleteIndex = completedPackets.findIndex((p) => !p.completed);
    if (nextIncompleteIndex !== -1) {
      setCurrentPacketIndex(nextIncompleteIndex);
    }
    setIsTransitioning(false);
    setScreenState('packet-form');
  };

  const handleViewProgress = () => {
    // Show packet list/overview
    // This could open a modal or side panel showing all packets and their status
    console.log('View progress - implement packet list modal');
  };

  const currentPacket = packets[currentPacketIndex];
  const totalPackets = packets.length;
  const completedCount = completedPackets.filter((p) => p.completed).length;

  if (screenState === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (screenState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your onboarding forms...</p>
        </div>
      </div>
    );
  }

  if (screenState === 'packet-complete' && currentPacket) {
    const nextPacketNumber = currentPacketIndex + 2;
    const nextPacket = packets[currentPacketIndex + 1];
    const nextPacketName =
      nextPacket?.packet?.display_name || `Form ${nextPacketNumber}`;

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="mb-6">
              <div className="flex justify-center">
                <div className="relative w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {currentPacket?.packet?.display_name} — Complete!
            </h1>

            <p className="text-gray-600 mb-8">
              {nextPacketNumber <= totalPackets ? (
                <>
                  Next: <span className="font-semibold">{nextPacketName}</span> (
                  {nextPacketNumber} of {totalPackets})
                </>
              ) : (
                'All forms complete!'
              )}
            </p>

            <button
              onClick={handleContinueToNext}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
            >
              Continue
            </button>

            <button
              onClick={handleViewProgress}
              className="w-full mt-3 px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 font-semibold transition-colors"
            >
              View Progress
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screenState === 'all-complete') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="mb-6">
              <div className="flex justify-center">
                <div className="relative w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">All Done!</h1>

            <p className="text-gray-600 mb-8 text-lg">
              Your onboarding forms have been submitted.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
              <p className="text-gray-700">
                Your employer will review your submissions and follow up with you
                soon.
              </p>
            </div>

            <button
              onClick={() => window.location.href = '/'}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main packet form screen
  if (!currentPacket || !currentPacket.packet) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">No packets available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Progress Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              Form {currentPacketIndex + 1} of {totalPackets}:{' '}
              {currentPacket.packet.display_name}
            </h2>
            <button
              onClick={handleViewProgress}
              className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
            >
              View Progress
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((currentPacketIndex + 1) / totalPackets) * 100}%`,
              }}
            ></div>
          </div>
        </div>
      </div>

      {/* Form Content — TODO: Integrate MobileFormWizard once form definition loading is implemented */}
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500 text-sm mb-4">
            Form: {currentPacket.packet?.display_name || 'Loading...'}
          </p>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <p className="text-gray-400 mb-2">Form rendering will appear here</p>
            <p className="text-xs text-gray-300">Packet ID: {currentPacket.packet_id}</p>
          </div>
          <button
            onClick={handlePacketSubmit}
            className="mt-6 w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
          >
            Submit Form
          </button>
        </div>
      </div>
    </div>
  );
}
