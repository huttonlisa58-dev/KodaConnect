'use client';

import DOMPurify from 'dompurify';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { FormSection, FormSubmissionData, getVisibleFields } from '@/lib/form-engine';
import { FieldRenderer } from './FieldRenderer';

interface FormStepRendererProps {
  section: FormSection;
  formData: FormSubmissionData;
  fieldErrors: Record<string, string>;
  onChange: (fieldId: string, value: any) => void;
  onExpandGroup: (groupId: string) => void;
  expandedContent: Record<string, boolean>;
  onToggleContent: (sectionId: string, expanded: boolean) => void;
  expandedInstances: Record<string, number>;
  expandedCheckboxGroups?: Record<string, boolean>;
  onToggleCheckboxGroup?: (groupId: string) => void;
  brandColor: string;
  readOnly?: boolean;
  /** Field IDs that should be individually read-only (e.g. staff-filled fields in client view) */
  readOnlyFieldIds?: string[];
}

export function FormStepRenderer({
  section,
  formData,
  fieldErrors,
  onChange,
  onExpandGroup,
  expandedContent,
  onToggleContent,
  expandedInstances,
  expandedCheckboxGroups = {},
  onToggleCheckboxGroup,
  brandColor,
  readOnly,
  readOnlyFieldIds,
}: FormStepRendererProps) {
  // Build a Set for O(1) lookup of per-field read-only status
  const readOnlySet = readOnlyFieldIds ? new Set(readOnlyFieldIds) : null;
  const sectionId = section.section_id;
  const isCollapsible = (section as any).content_collapsible;
  const summary = (section as any).content_summary;
  const isExpanded = expandedContent[sectionId] || !isCollapsible;

  // Get visible fields and repeating group info
  const allVisibleFields = getVisibleFields(section, formData).filter((f) => !(f as any).hidden);
  const repeatingGroups = (section as any)?.repeating_groups || [];

  // Helper: get the number of visible instances for a group
  function getVisibleInstanceCount(groupId: string): number {
    const group = repeatingGroups.find((g: any) => g.group_id === groupId);
    if (!group) return 999;
    return expandedInstances[groupId] ?? group.min_visible;
  }

  // Filter fields based on repeating group visibility
  const visibleFields = allVisibleFields.filter((f) => {
    const field = f as any;
    if (!field._group || field._instance === undefined) return true;
    const visCount = getVisibleInstanceCount(field._group);
    return field._instance < visCount;
  });

  // Collect "Add More" buttons
  const addMoreButtons: Map<string, { afterFieldId: string; groupId: string; label: string }> = new Map();
  const endOfSectionButtons: { groupId: string; label: string }[] = [];

  for (const group of repeatingGroups) {
    const visCount = getVisibleInstanceCount(group.group_id);
    const maxCount = group.instance_keys.length;
    if (visCount >= maxCount) continue;

    const buttonLabel = group.add_label || `+ Add ${group.labels?.[visCount] || 'More'}`;

    const groupFields = visibleFields.filter((f) => (f as any)._group === group.group_id);
    if (groupFields.length > 0) {
      const lastField = groupFields[groupFields.length - 1];
      addMoreButtons.set(lastField.field_id, {
        afterFieldId: lastField.field_id,
        groupId: group.group_id,
        label: buttonLabel,
      });
    } else {
      const allSectionFields = section?.fields || [];
      const firstGroupFieldIdx = allSectionFields.findIndex((f) => (f as any)._group === group.group_id);
      if (firstGroupFieldIdx > 0) {
        let anchorFieldId: string | null = null;
        for (let j = firstGroupFieldIdx - 1; j >= 0; j--) {
          const candidate = allSectionFields[j];
          if (visibleFields.some((vf) => vf.field_id === candidate.field_id)) {
            anchorFieldId = candidate.field_id;
            break;
          }
        }
        if (anchorFieldId) {
          addMoreButtons.set(anchorFieldId, {
            afterFieldId: anchorFieldId,
            groupId: group.group_id,
            label: buttonLabel,
          });
        } else {
          endOfSectionButtons.push({ groupId: group.group_id, label: buttonLabel });
        }
      } else {
        endOfSectionButtons.push({ groupId: group.group_id, label: buttonLabel });
      }
    }
  }

  // Detect content-only training screens: have content but no fields
  const isContentOnlyScreen = !!(section?.content && (!section.fields || section.fields.length === 0));

  return (
    <>
      {/* Section title — hide for content-only training screens (title is already in the HTML content) */}
      {!isContentOnlyScreen && (
        <div
          className="rounded-xl px-4 py-3 mb-5 flex items-start gap-3"
          style={{ backgroundColor: `${brandColor}08`, border: `1px solid ${brandColor}20` }}
        >
          <FileText className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: brandColor }} />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 leading-snug">
              {section?.title || 'Complete This Section'}
            </h2>
            {section?.description && !/^pages?\s+\d/i.test(section.description) && (
              <p className="text-sm text-gray-500 mt-0.5">
                {section.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Section content (if any policy text in this section) */}
      {section?.content && (
        <div
          className={`rounded-xl text-gray-700 mb-5 ${isContentOnlyScreen ? 'p-0 text-base leading-relaxed' : 'p-4 text-sm'}`}
          style={isContentOnlyScreen ? {} : { backgroundColor: `${brandColor}08`, borderLeft: `3px solid ${brandColor}40` }}
        >
          {isCollapsible && !isExpanded ? (
            <>
              <p className="text-gray-600">{summary}</p>
              <button
                type="button"
                onClick={() => onToggleContent(sectionId, true)}
                className="mt-2 flex items-center gap-1 text-xs font-semibold"
                style={{ color: brandColor }}
              >
                Read Full Text <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <div className="form-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(
                // Replace {{field_id}} placeholders in content with actual form data values
                // FIX 2026-03-01: Validate field IDs to prevent prototype property access
                section.content.replace(/\{\{([^}]+)\}\}/g, (_match: string, fieldId: string) => {
                  const trimmed = fieldId.trim();
                  // Only allow alphanumeric + underscore field IDs (prevents {{constructor}}, {{__proto__}}, etc.)
                  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return '__________';
                  const value = formData[trimmed];
                  return value ? String(value) : '__________';
                }),
                // FIX 2026-03-01: Restrict allowed HTML tags for form content (defense-in-depth)
                {
                  ALLOWED_TAGS: ['p', 'b', 'i', 'u', 'strong', 'em', 'br', 'ul', 'ol', 'li',
                    'h1', 'h2', 'h3', 'h4', 'a', 'table', 'tr', 'td', 'th', 'thead', 'tbody',
                    'span', 'div', 'hr', 'blockquote', 'sup', 'sub'],
                  ALLOWED_ATTR: ['href', 'target', 'class', 'style'],
                }
              ) }} />
              {isCollapsible && (
                <button
                  type="button"
                  onClick={() => onToggleContent(sectionId, false)}
                  className="mt-2 flex items-center gap-1 text-xs font-semibold"
                  style={{ color: brandColor }}
                >
                  Collapse <ChevronUp className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Fields — group consecutive checkboxes into compact inline rows */}
      <div className="space-y-5">
        {(() => {
          const groups: { type: 'single'; field: typeof visibleFields[0] }[] | { type: 'checkbox-row'; fields: typeof visibleFields }[] = [];
          let i = 0;
          while (i < visibleFields.length) {
            const field = visibleFields[i];
            if (field.type === 'checkbox') {
              const batch: typeof visibleFields = [field];
              while (i + 1 < visibleFields.length && visibleFields[i + 1].type === 'checkbox') {
                i++;
                batch.push(visibleFields[i]);
              }
              if (batch.length >= 2) {
                (groups as any[]).push({ type: 'checkbox-row', fields: batch });
              } else {
                (groups as any[]).push({ type: 'single', field: batch[0] });
              }
            } else {
              (groups as any[]).push({ type: 'single', field });
            }
            i++;
          }

          const elements: React.ReactNode[] = [];

          groups.forEach((group: any, gIdx: number) => {
            if (group.type === 'checkbox-row') {
              // Check if this checkbox batch has a select_all_group (collapsible consent pattern)
              const selectAllField = group.fields.find((f: any) => f.select_all_group);
              const groupId = selectAllField?.select_all_group;
              const memberFields = groupId
                ? group.fields.filter((f: any) => f.group === groupId)
                : [];
              const hasCollapsibleGroup = selectAllField && memberFields.length > 0 && onToggleCheckboxGroup;
              const isGroupExpanded = groupId ? expandedCheckboxGroups[groupId] : true;

              if (hasCollapsibleGroup) {
                // Render collapsible consent checkbox group
                const selectAllChecked = formData[selectAllField.field_id] === true || formData[selectAllField.field_id] === 'true';
                const checkedCount = memberFields.filter((f: any) => formData[f.field_id] === true || formData[f.field_id] === 'true').length;

                elements.push(
                  <div key={`cg-${gIdx}`} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
                    {/* Select All checkbox */}
                    <label
                      className="flex items-center gap-3 cursor-pointer py-1"
                    >
                      <input
                        type="checkbox"
                        checked={selectAllChecked}
                        onChange={(e) => onChange(selectAllField.field_id, e.target.checked)}
                        className="w-5 h-5 rounded"
                        style={{ accentColor: brandColor }}
                        disabled={readOnly}
                      />
                      <span className="text-sm font-semibold text-gray-800">{selectAllField.label}</span>
                    </label>

                    {/* Expand/collapse toggle */}
                    <button
                      type="button"
                      onClick={() => onToggleCheckboxGroup!(groupId)}
                      className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
                      style={{ color: brandColor }}
                    >
                      {isGroupExpanded ? (
                        <>Hide individual forms <ChevronUp className="w-3.5 h-3.5" /></>
                      ) : (
                        <>View all forms ({memberFields.length}){checkedCount > 0 && !selectAllChecked ? ` · ${checkedCount} selected` : ''} <ChevronDown className="w-3.5 h-3.5" /></>
                      )}
                    </button>

                    {/* Individual checkboxes (collapsible) */}
                    {isGroupExpanded && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {memberFields.map((f: any) => {
                          const isChecked = formData[f.field_id] === true || formData[f.field_id] === 'true';
                          return (
                            <label
                              key={f.field_id}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all text-sm font-medium"
                              style={{
                                borderColor: isChecked ? brandColor : '#e5e7eb',
                                backgroundColor: isChecked ? `${brandColor}10` : 'white',
                                color: isChecked ? brandColor : '#374151',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => onChange(f.field_id, e.target.checked)}
                                className="w-4 h-4 rounded"
                                style={{ accentColor: brandColor }}
                                disabled={readOnly}
                              />
                              {f.label}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {group.fields.some((f: any) => fieldErrors[f.field_id]) && (
                      <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {group.fields.map((f: any) => fieldErrors[f.field_id]).filter(Boolean)[0]}
                      </p>
                    )}
                  </div>
                );
              } else {
                // Standard checkbox row (no collapsible group)
                elements.push(
                  <div key={`cg-${gIdx}`} className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex flex-wrap gap-2">
                      {group.fields.map((f: any) => {
                        const isChecked = formData[f.field_id] === true || formData[f.field_id] === 'true';
                        return (
                          <label
                            key={f.field_id}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all text-sm font-medium"
                            style={{
                              borderColor: isChecked ? brandColor : '#e5e7eb',
                              backgroundColor: isChecked ? `${brandColor}10` : 'white',
                              color: isChecked ? brandColor : '#374151',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => onChange(f.field_id, e.target.checked)}
                              className="w-4 h-4 rounded"
                              style={{ accentColor: brandColor }}
                              disabled={readOnly}
                            />
                            {f.label}
                          </label>
                        );
                      })}
                    </div>
                    {group.fields.some((f: any) => fieldErrors[f.field_id]) && (
                      <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {group.fields.map((f: any) => fieldErrors[f.field_id]).filter(Boolean)[0]}
                      </p>
                    )}
                  </div>
                );
              }

              for (const f of group.fields) {
                const addMore = addMoreButtons.get(f.field_id);
                if (addMore) {
                  elements.push(
                    <button
                      key={`add-${addMore.groupId}`}
                      type="button"
                      onClick={() => onExpandGroup(addMore.groupId)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors hover:bg-gray-50"
                      style={{ borderColor: `${brandColor}40`, color: brandColor }}
                    >
                      <Plus className="w-4 h-4" />
                      {addMore.label}
                    </button>
                  );
                }
              }
            } else {
              const field = group.field;
              const isAutoFilled = formData[`${field.field_id}__auto_filled`] === true;
              const isFieldLocked = readOnly || (readOnlySet?.has(field.field_id) ?? false);
              const isStaffField = readOnlySet?.has(field.field_id) ?? false;
              elements.push(
                <div key={field.field_id} className={`bg-white rounded-xl p-4 shadow-sm ${isStaffField ? 'border border-gray-200 bg-gray-50/50' : ''}`} style={{ backgroundColor: isAutoFilled ? `${brandColor}05` : isStaffField ? '#f9fafb' : 'white' }}>
                  {field.type !== 'checkbox' && (
                    <div className="flex items-start justify-between mb-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        {field.label}
                        {field.required && !isStaffField && <span className="text-red-400 ml-1">*</span>}
                      </label>
                      {isStaffField ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                          Pre-filled by staff
                        </span>
                      ) : isAutoFilled ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: `${brandColor}15`, color: brandColor }}>
                          Auto-filled
                        </span>
                      ) : null}
                    </div>
                  )}
                  <FieldRenderer
                    field={field}
                    value={formData[field.field_id]}
                    onChange={(val) => onChange(field.field_id, val)}
                    error={fieldErrors[field.field_id]}
                    brandColor={brandColor}
                    readOnly={isFieldLocked}
                  />
                  {fieldErrors[field.field_id] && (
                    <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {fieldErrors[field.field_id]}
                    </p>
                  )}
                  {field.help_text && (
                    <p className="text-gray-400 text-xs mt-2">{field.help_text}</p>
                  )}
                </div>
              );

              const addMore = addMoreButtons.get(field.field_id);
              if (addMore) {
                elements.push(
                  <button
                    key={`add-${addMore.groupId}`}
                    type="button"
                    onClick={() => onExpandGroup(addMore.groupId)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors hover:bg-gray-50"
                    style={{ borderColor: `${brandColor}40`, color: brandColor }}
                  >
                    <Plus className="w-4 h-4" />
                    {addMore.label}
                  </button>
                );
              }
            }
          });

          return elements;
        })()}

        {endOfSectionButtons.map((btn) => (
          <button
            key={`add-end-${btn.groupId}`}
            type="button"
            onClick={() => onExpandGroup(btn.groupId)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors hover:bg-gray-50"
            style={{ borderColor: `${brandColor}40`, color: brandColor }}
          >
            <Plus className="w-4 h-4" />
            {btn.label}
          </button>
        ))}
      </div>

      {visibleFields.length === 0 && endOfSectionButtons.length === 0 && !section?.content && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-base">No fields in this section</p>
        </div>
      )}
    </>
  );
}
