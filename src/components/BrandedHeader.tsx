'use client';

/**
 * BrandedHeader Component
 * Displays company logo, name, and navigation with brand colors
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useSession } from './SessionProvider';
import { useBrand } from './BrandProvider';
import {
  Menu,
  X,
  Home,
  FileText,
  MessageSquare,
  Users,
  Settings,
  LogOut,
  Building2,
} from 'lucide-react';
import CompanySelector from './office/CompanySelector';

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
}

interface BrandedHeaderProps {
  title?: string;
  /** Companies for the selector dropdown (passed from parent page) */
  companies?: Company[];
  /** Currently selected company ID */
  selectedCompanyId?: string | null;
  /** Callback when user selects a different company */
  onCompanySelect?: (id: string) => void;
}

export function BrandedHeader({ title, companies, selectedCompanyId, onCompanySelect }: BrandedHeaderProps) {
  const { user, logout } = useSession();
  const brand = useBrand();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const baseNavItems = [
    { label: 'Dashboard', href: '/office', icon: Home },
    { label: 'Forms', href: '/office/form-manager', icon: FileText },
    { label: 'Messages', href: '/office/messages', icon: MessageSquare },
    { label: 'Caregivers', href: '/office/caregivers', icon: Users },
    { label: 'Settings', href: '/office/settings', icon: Settings },
  ];

  // Add Companies nav item for super_admins (support both auth schemas)
  const isSuperAdmin = user?.is_super_admin || user?.role === 'super_admin';
  const navItems = isSuperAdmin
    ? [...baseNavItems.slice(0, 2), { label: 'Companies', href: '/office/companies', icon: Building2 }, ...baseNavItems.slice(2)]
    : baseNavItems;

  const handleLogout = async () => {
    await logout();
  };

  return (
    <header
      style={{
        backgroundColor: brand.primary_color,
      }}
      className="text-white shadow-lg"
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
          <Link href="/office/dashboard" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div
              style={{
                backgroundColor: brand.secondary_color,
              }}
              className="w-10 h-10 rounded-lg flex items-center justify-center"
            >
              <img
                src={brand.logo_url}
                alt={brand.company_name}
                className="w-6 h-6 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'block';
                }}
              />
              <span className="text-white font-bold text-lg hidden">
                {brand.company_name.charAt(0)}
              </span>
            </div>
            <div>
              <h1 className="font-bold text-lg">{brand.company_name}</h1>
              {title && <p className="text-xs opacity-80">{title}</p>}
            </div>
          </Link>

          {/* Company Selector (when companies are passed from parent) */}
          {companies && companies.length > 0 && onCompanySelect && (
            <div className="hidden md:block">
              <CompanySelector
                companies={companies}
                selectedId={selectedCompanyId || null}
                onSelect={onCompanySelect}
                compact
              />
            </div>
          )}

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity text-sm"
                  style={{ color: 'inherit' }}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            {/* User Info */}
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs opacity-75">
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </p>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 hover:opacity-80 transition-opacity"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>

            {/* Logout Button - visible with contrasting style */}
            <button
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white bg-opacity-20 hover:bg-opacity-30 transition-all text-sm font-medium"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
            {/* Mobile logout - icon only */}
            <button
              onClick={handleLogout}
              className="sm:hidden p-2 rounded-lg bg-white bg-opacity-20 hover:bg-opacity-30 transition-all"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pt-4 border-t border-white border-opacity-20">
            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity text-sm"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
