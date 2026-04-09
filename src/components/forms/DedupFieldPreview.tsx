'use client';

import React, { useMemo } from 'react';
import { Link2, Copy } from 'lucide-react';

interface DedupLink {
  field_id: string;
  label: string;
  sections: string[];
  auto_fill_from?: string;
}

interface DedupFieldPreviewProps {
  definition: any;
}

export function DedupFieldPreview({ definition }: DedupFieldPreviewProps) {
  const dedupLinks = useMemo(() => {
    if (!definition?.metadata?.dedup_links) {
      return [];
    }

    // Group by field to find duplicates
    const fieldGroups: Record<string, DedupLink[]> = {};
    const dedupData = definition.metadata.dedup_links;

    if (Array.isArray(dedupData)) {
      dedupData.forEach((link: any) => {
        const fieldId = link.field_id || link.id;
        if (!fieldGroups[fieldId]) {
          fieldGroups[fieldId] = [];
        }
        fieldGroups[fieldId].push({
          field_id: fieldId,
          label: link.label || 'Untitled',
          sections: link.sections || [],
          auto_fill_from: link.auto_fill_from,
        });
      });
    }

    // Filter to only fields that appear in multiple sections
    return Object.values(fieldGroups)
      .filter((links) => links.length > 1 || links[0]?.auto_fill_from)
      .flat();
  }, [definition]);

  const getColorForSection = (index: number): string => {
    const colors = [
      '#006B63', // teal-900
      '#008B8B', // teal
      '#20B2AA', // light sea green
      '#48D1CC', // medium turquoise
      '#7FFFD4', // aquamarine
    ];
    return colors[index % colors.length];
  };

  if (!dedupLinks || dedupLinks.length === 0) {
    return (
      <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <Copy size={32} className="mx-auto mb-3 text-gray-300" />
        <p className="text-gray-600 font-medium mb-1">No Duplicated Fields</p>
        <p className="text-gray-500 text-sm">
          Each form field appears in only one section. No deduplication needed.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Summary Card */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-2">
          <Link2 size={20} className="text-teal-600" />
          <p className="font-semibold text-teal-900">
            {dedupLinks.length} Field{dedupLinks.length !== 1 ? 's' : ''} with Deduplication
          </p>
        </div>
        <p className="text-teal-700 text-sm">
          These fields appear in multiple sections or are linked with auto-fill rules
        </p>
      </div>

      {/* Dedup Fields Table/Cards */}
      <div className="space-y-3">
        {dedupLinks.map((link, idx) => (
          <div
            key={`${link.field_id}-${idx}`}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
          >
            {/* Card Header */}
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 text-base mb-1">{link.label}</h3>
              <p className="text-xs text-gray-600">ID: {link.field_id}</p>
            </div>

            {/* Card Content */}
            <div className="p-4 space-y-4">
              {/* Sections List */}
              <div>
                <p className="text-sm font-medium text-gray-900 mb-3">Appears In:</p>
                <div className="space-y-2">
                  {link.sections && link.sections.length > 0 ? (
                    link.sections.map((section: string, sectionIdx: number) => (
                      <div key={`${link.field_id}-section-${sectionIdx}`} className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getColorForSection(sectionIdx) }}
                        />
                        <span className="text-sm text-gray-700 px-3 py-1.5 bg-gray-100 rounded-md">
                          {section}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 italic">No sections specified</p>
                  )}
                </div>
              </div>

              {/* Auto-fill Chain */}
              {link.auto_fill_from && (
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-900 mb-2">Auto-fill Chain:</p>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex-1">
                      <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 font-medium">
                        {link.auto_fill_from}
                      </div>
                    </div>
                    <div className="text-gray-500 font-bold">→</div>
                    <div className="flex-1">
                      <div className="px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg text-teal-900 font-medium">
                        {link.label}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Value from "{link.auto_fill_from}" automatically populates this field
                  </p>
                </div>
              )}

              {/* Visual Indicator */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <Link2 size={16} className="text-teal-600" />
                  <span className="text-xs font-semibold text-teal-600">
                    Deduplicated Field
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-900 mb-3">Color Guide:</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {Array.from({ length: Math.min(5, dedupLinks[0]?.sections?.length || 0) }).map(
            (_, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getColorForSection(idx) }}
                />
                <span className="text-gray-700">Section Color {idx + 1}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-900 mb-2">About Deduplication:</p>
        <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
          <li>
            Deduplicated fields reduce repetitive data entry by reusing values across sections
          </li>
          <li>
            Auto-fill chains ensure consistency when a field value changes in any location
          </li>
          <li>Caregivers only see the field once, in its primary section</li>
        </ul>
      </div>
    </div>
  );
}
