/**
 * ComplianceGauge Component
 * Displays an animated circular progress indicator with compliance score
 */

'use client';

import React, { useEffect, useState } from 'react';

interface ComplianceGaugeProps {
  score: number;
  size?: number;
}

export default function ComplianceGauge({ score, size = 200 }: ComplianceGaugeProps) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let animationFrame: number;
    let currentValue = 0;
    const increment = score / 30; // Animate over 30 frames

    const animate = () => {
      currentValue += increment;
      if (currentValue < score) {
        setDisplayScore(Math.min(currentValue, score));
        animationFrame = requestAnimationFrame(animate);
      } else {
        setDisplayScore(score);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [score]);

  const getColor = (value: number) => {
    if (value >= 80) return '#16a34a'; // green
    if (value >= 60) return '#eab308'; // yellow
    return '#dc2626'; // red
  };

  const getLabel = (value: number) => {
    if (value >= 80) return 'Excellent';
    if (value >= 60) return 'Good';
    return 'At Risk';
  };

  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;
  const color = getColor(score);

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
        />

        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.5s ease-in-out',
          }}
        />
      </svg>

      {/* Score Display */}
      <div className="absolute flex flex-col items-center">
        <div className="text-5xl font-bold" style={{ color }}>
          {Math.round(displayScore)}%
        </div>
        <div className="text-sm font-semibold text-gray-600 mt-2">
          {getLabel(score)}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-8 space-y-2 text-center">
        <div className="flex items-center gap-2 justify-center">
          <div className="w-3 h-3 rounded-full bg-green-600"></div>
          <span className="text-sm text-gray-600">80-100%: Excellent</span>
        </div>
        <div className="flex items-center gap-2 justify-center">
          <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
          <span className="text-sm text-gray-600">60-79%: Good</span>
        </div>
        <div className="flex items-center gap-2 justify-center">
          <div className="w-3 h-3 rounded-full bg-red-600"></div>
          <span className="text-sm text-gray-600">&lt;60%: At Risk</span>
        </div>
      </div>
    </div>
  );
}
