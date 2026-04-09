'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getOfficeUser, clearOfficeUser, canManageUsers, getRoleLabel, getRoleColor, type OfficeUser } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  requiresAdmin?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/office', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Forms', href: '/office/form-manager', icon: <FileText className="w-4 h-4" /> },
  { label: 'Submissions', href: '/office/submissions', icon: <ClipboardList className="w-4 h-4" /> },
  { label: 'Users', href: '/office/users', icon: <Users className="w-4 h-4" />, requiresAdmin: true },
  { label: 'Settings', href: '/office/settings', icon: <Settings className="w-4 h-4" /> },
];

export default function OfficeNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<OfficeUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const officeUser = getOfficeUser();
    setUser(officeUser);
  }, []);

  // Don't render nav on login page
  if (pathname === '/office/login' || pathname === '/office/change-password') {
    return null;
  }

  function isActive(href: string): boolean {
    if (href === '/office') {
      return pathname === '/office' || pathname === '/office/dashboard';
    }
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    try {
      await getSupabase().auth.signOut();
    } catch (e) {
      // Continue even if sign out fails
    }
    clearOfficeUser();
    router.push('/office/login');
  }

  const visibleNavItems = navItems.filter(item => {
    if (item.requiresAdmin) return canManageUsers(user);
    return true;
  });

  return (
    <nav className="bg-white shadow-sm border-b sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Left: Brand */}
          <Link href="/office" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            <span className="font-semibold text-gray-900 hidden sm:inline">KodaConnect</span>
          </Link>

          {/* Center: Nav Links (desktop) */}
          <div className="hidden md:flex items-center gap-1">
            {visibleNavItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right: User info + logout (desktop) */}
          <div className="hidden md:flex items-center gap-3">
            {user && (
              <>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 leading-tight">{user.name}</p>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getRoleColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-white">
          <div className="px-4 py-3 space-y-1">
            {visibleNavItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
            <hr className="my-2" />
            {user && (
              <div className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getRoleColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
