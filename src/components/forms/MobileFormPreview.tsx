'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MobileFormPreviewProps {
  definition: any;
  brandColors?: { primary?: string; secondary?: string };
}

export function MobileFormPreview({
  definition,
  brandColors = { primary: '#008B8B', secondary: '#20B2AA' },
}: MobileFormPreviewProps) {
  const [activeSection, setActiveSection] = useState(0);

  if (!definition || !definition.sections) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-gray-50 rounded-xl">
        <p className="text-gray-500">No form definition available</p>
      </div>
    );
  }

  const sections = definition.sections || [];
  const currentSection = sections[activeSection] || {};

  const hasFields = currentSection.fields && currentSection.fields.length > 0;

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-gray-50 p-8">
      {/* Phone Frame */}
      <div
        className="relative bg-black rounded-3xl shadow-2xl"
        style={{ width: '320px', height: '640px', padding: '12px' }}
      >
        {/* Notch */}
        <div
          className="absolute top-0 left-1/2 transform -translate-x-1/2 bg-black rounded-b-3xl"
          style={{ width: '120px', height: '28px', zIndex: 10 }}
        />

        {/* Screen Content */}
        <div
          className="w-full h-full rounded-2xl bg-white overflow-hidden flex flex-col"
          style={{ backgroundColor: '#fafafa' }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 text-white font-semibold text-sm"
            style={{ backgroundColor: brandColors.primary }}
          >
            {currentSection.title || 'Form Section'}
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
            {hasFields ? (
              <>
                {/* Content if any */}
                {currentSection.content && (
                  <div className="text-xs text-gray-600 mb-3 leading-relaxed">
                    {currentSection.content}
                  </div>
                )}

                {/* Field Previews */}
                {currentSection.fields.map((field: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-white border border-gray-200 rounded-lg p-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {field.label || 'Untitled Field'}
                      </span>
                      {field.required && (
                        <span className="text-red-500 text-xs font-bold">*</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <span
                        className="px-2 py-1 rounded text-xs font-medium text-white"
                        style={{
                          backgroundColor:
                            field.type === 'text'
                              ? '#3B82F6'
                              : field.type === 'signature'
                                ? '#8B5CF6'
                                : field.type === 'date'
                                  ? '#10B981'
                                  : field.type === 'checkbox'
                                    ? '#F59E0B'
                                    : field.type === 'select'
                                      ? '#EC4899'
                                      : '#6B7280',
                        }}
                      >
                        {field.type}
                      </span>
                      {field.placeholder && (
                        <span className="text-gray-400 italic">
                          {field.placeholder}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                {/* Content-only Section */}
                {currentSection.content && (
                  <div className="bg-white rounded-lg p-3 text-sm text-gray-700 leading-relaxed border border-gray-200">
                    {currentSection.content}
                  </div>
                )}
                {!currentSection.content && (
                  <div className="text-center text-gray-400 text-xs py-8">
                    No content for this section
                  </div>
                )}
              </>
            )}
          </div>

          {/* Section Navigation Dots */}
          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => setActiveSection(Math.max(0, activeSection - 1))}
              disabled={activeSection === 0}
              className="p-1 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} className="text-gray-600" />
            </button>

            <div className="flex gap-1">
              {sections.map((_: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setActiveSection(idx)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    idx === activeSection ? 'bg-gray-800' : 'bg-gray-300'
                  }`}
                  aria-label={`Go to section ${idx + 1}`}
                />
              ))}
            </div>

            <button
              onClick={() => setActiveSection(Math.min(sections.length - 1, activeSection + 1))}
              disabled={activeSection === sections.length - 1}
              className="p-1 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Info Below Phone */}
      <div className="mt-4 text-center text-xs text-gray-600">
        <p>
          Section {activeSection + 1} of {sections.length}
        </p>
      </div>
    </div>
  );
}
