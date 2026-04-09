/**
 * Brand configuration and utilities
 * Manages brand profiles for multi-brand theming
 */

import { createServerSupabaseClient } from './supabase';

export interface BrandProfile {
  company_id: string;
  company_name: string;
  slug: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  light_bg: string;
  dark_text: string;
  font_family: string;
}

/**
 * Brand presets for known companies
 */
export const BRAND_PRESETS: Record<string, BrandProfile> = {
  xtreme_care: {
    company_id: 'xtreme-care',
    company_name: 'Xtreme Care',
    slug: 'xtreme-care',
    logo_url: '/logos/Xtreme-Logo-Web2-1.png',
    primary_color: '#8DB600',
    secondary_color: '#6B8E23',
    accent_color: '#E8F5D4',
    light_bg: '#F5F9E8',
    dark_text: '#2D3A0F',
    font_family: 'system-ui, -apple-system, sans-serif',
  },
  complete_homecare: {
    company_id: 'complete-homecare',
    company_name: 'Complete Homecare',
    slug: 'complete-homecare',
    logo_url: '/logos/complete-home-care-logo2-1.png',
    primary_color: '#E87722',
    secondary_color: '#1B5E97',
    accent_color: '#E3F2FD',
    light_bg: '#FFF8F0',
    dark_text: '#1A1A1A',
    font_family: 'system-ui, -apple-system, sans-serif',
  },
};

/**
 * Default KodaConnect brand
 */
export function getDefaultBrand(): BrandProfile {
  return {
    company_id: 'kodaconnect',
    company_name: 'KodaConnect',
    slug: 'kodaconnect',
    logo_url: '/logo.svg',
    primary_color: '#0F766E',
    secondary_color: '#0D9488',
    accent_color: '#D1FAE5',
    light_bg: '#F0FDFA',
    dark_text: '#134E4A',
    font_family: 'system-ui, -apple-system, sans-serif',
  };
}

/**
 * Fetch brand profile from Supabase for a company
 */
export async function getBrandProfile(companyId: string): Promise<BrandProfile> {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('brand_profiles')
      .select('*')
      .eq('company_id', companyId)
      .single();

    if (error || !data) {
      // Return preset or default
      const preset = Object.values(BRAND_PRESETS).find(
        (b) => b.company_id === companyId
      );
      return preset || getDefaultBrand();
    }

    return data as BrandProfile;
  } catch (error) {
    console.error('Error fetching brand profile:', error);
    return getDefaultBrand();
  }
}

/**
 * Convert brand profile to CSS custom properties
 */
export function brandToCSSVariables(brand: BrandProfile): Record<string, string> {
  return {
    '--brand-primary': brand.primary_color,
    '--brand-secondary': brand.secondary_color,
    '--brand-accent': brand.accent_color,
    '--brand-light-bg': brand.light_bg,
    '--brand-dark-text': brand.dark_text,
    '--brand-font-family': brand.font_family,
  };
}

/**
 * Convert hex color to RGB tuple for PDF generation
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

/**
 * Get brand information for PDF generation
 */
export async function getBrandForPDF(companyId: string) {
  const brand = await getBrandProfile(companyId);

  return {
    logo_path: brand.logo_url,
    primary_rgb: hexToRgb(brand.primary_color),
    secondary_rgb: hexToRgb(brand.secondary_color),
    accent_rgb: hexToRgb(brand.accent_color),
    company_name: brand.company_name,
  };
}

/**
 * Create or update brand profile in Supabase
 */
export async function saveBrandProfile(brand: BrandProfile): Promise<BrandProfile | null> {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('brand_profiles')
      .upsert(brand, { onConflict: 'company_id' })
      .select()
      .single();

    if (error) {
      console.error('Error saving brand profile:', error);
      return null;
    }

    return data as BrandProfile;
  } catch (error) {
    console.error('Error in saveBrandProfile:', error);
    return null;
  }
}

/**
 * Upload brand logo to Supabase Storage
 */
export async function uploadBrandLogo(
  companyId: string,
  file: File
): Promise<string | null> {
  try {
    const supabase = createServerSupabaseClient();
    const fileName = `${companyId}-${Date.now()}-${file.name}`;
    const filePath = `logos/${fileName}`;

    const { error } = await supabase.storage
      .from('brand-assets')
      .upload(filePath, file, { upsert: true });

    if (error) {
      console.error('Error uploading logo:', error);
      return null;
    }

    const { data } = supabase.storage
      .from('brand-assets')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Error in uploadBrandLogo:', error);
    return null;
  }
}
