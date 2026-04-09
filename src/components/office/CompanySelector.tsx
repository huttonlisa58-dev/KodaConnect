'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Building2 } from 'lucide-react';
import { getCompanyInitials, getLogoUrl, getInitialsColor } from '@/lib/logo-utils';

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
}

interface CompanySelectorProps {
  companies: Company[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Compact mode for header integration */
  compact?: boolean;
}

/**
 * CompanySelector — shows company name for single-company users,
 * or a dropdown for super_admins with multiple companies.
 */
export default function CompanySelector({
  companies,
  selectedId,
  onSelect,
  compact = false,
}: CompanySelectorProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = companies.find(c => c.id === selectedId) || companies[0];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (companies.length === 0) return null;

  // Single company — just display, no dropdown
  if (companies.length === 1) {
    return (
      <div className="flex items-center gap-2">
        <CompanyLogo company={companies[0]} size={compact ? 'sm' : 'md'} />
        <span className={`font-medium text-gray-700 ${compact ? 'text-sm' : 'text-base'}`}>
          {companies[0].name}
        </span>
      </div>
    );
  }

  // Multiple companies — dropdown
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors ${
          compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
        }`}
      >
        {selected && <CompanyLogo company={selected} size="sm" />}
        <span className={`font-medium text-gray-700 max-w-[160px] truncate ${compact ? 'text-sm' : 'text-base'}`}>
          {selected?.name || 'Select company'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
          {companies.map(company => (
            <button
              key={company.id}
              onClick={() => {
                onSelect(company.id);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                company.id === selectedId ? 'bg-teal-50 text-teal-700' : 'text-gray-700'
              }`}
            >
              <CompanyLogo company={company} size="sm" />
              <span className="text-sm font-medium truncate">{company.name}</span>
              {company.id === selectedId && (
                <span className="ml-auto text-teal-600 text-xs font-semibold">Active</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * CompanyLogo — renders logo image with initials fallback
 */
function CompanyLogo({ company, size = 'md' }: { company: Company; size?: 'sm' | 'md' }) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = getLogoUrl(company.logo_url);
  const initials = getCompanyInitials(company.name);
  const colors = getInitialsColor(company.name);

  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={company.name}
        className={`${sizeClass} rounded object-contain flex-shrink-0`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded flex items-center justify-center font-bold flex-shrink-0`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {initials}
    </div>
  );
}
