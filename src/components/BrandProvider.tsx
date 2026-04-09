'use client';

/**
 * Brand Provider
 * React context for managing brand theming across the application
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { BrandProfile, getBrandProfile, getDefaultBrand, brandToCSSVariables } from '@/lib/brand';
import { useSession } from './SessionProvider';

interface BrandContextType {
  brand: BrandProfile;
  isLoading: boolean;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

interface BrandProviderProps {
  children: ReactNode;
}

/**
 * BrandProvider component
 * Fetches and applies brand configuration based on current user's company
 */
export function BrandProvider({ children }: BrandProviderProps) {
  const { user } = useSession();
  const [brand, setBrand] = useState<BrandProfile>(getDefaultBrand());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadBrand() {
      try {
        setIsLoading(true);

        if (!user) {
          setBrand(getDefaultBrand());
          setIsLoading(false);
          return;
        }

        // For now, load default brand
        // In the future, this would fetch from user's company_id
        const loadedBrand = getDefaultBrand();
        setBrand(loadedBrand);

        // Apply CSS variables to root element
        const root = document.documentElement;
        const cssVars = brandToCSSVariables(loadedBrand);
        Object.entries(cssVars).forEach(([key, value]) => {
          root.style.setProperty(key, value);
        });
      } catch (error) {
        console.error('Error loading brand:', error);
        setBrand(getDefaultBrand());
      } finally {
        setIsLoading(false);
      }
    }

    loadBrand();
  }, [user]);

  const value: BrandContextType = {
    brand,
    isLoading,
  };

  return (
    <BrandContext.Provider value={value}>
      {children}
    </BrandContext.Provider>
  );
}

/**
 * Hook to use the brand context
 */
export function useBrand(): BrandProfile {
  const context = useContext(BrandContext);
  if (!context) {
    throw new Error('useBrand must be used within BrandProvider');
  }
  return context.brand;
}
