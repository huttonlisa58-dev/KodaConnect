'use client';

export const dynamic = 'force-dynamic';

import { SessionProvider } from '@/components/SessionProvider';
import { BrandProvider } from '@/components/BrandProvider';
import OfficeNavigation from '@/components/office/OfficeNavigation';

export default function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <BrandProvider>
        <OfficeNavigation />
        {children}
      </BrandProvider>
    </SessionProvider>
  );
}
