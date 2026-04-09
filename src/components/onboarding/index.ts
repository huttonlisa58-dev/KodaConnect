/**
 * Onboarding UI Components - Main Export
 *
 * Import all components and types from this index file for convenience.
 *
 * Example:
 * import { OnboardingDashboard, NewOnboardingForm, BundleDetail, TemplateManager } from '@/ui-components/onboarding';
 * import type { Bundle, Template, BundleStatus } from '@/ui-components/onboarding';
 */

// Components
export { default as OnboardingDashboard } from './OnboardingDashboard';
export { default as NewOnboardingForm } from './NewOnboardingForm';
export { default as BundleDetail } from './BundleDetail';
export { default as TemplateManager } from './TemplateManager';

// Types
export type {
  BundleStatus,
  OnboardingRole,
  PacketStatus,
  RenderMode,
  Template,
  TemplatePacket,
  Bundle,
  BundleApplicant,
  BundleProgress,
  BundlePacketStatus,
  BundleNote,
  BundlesListResponse,
  BundleDetailResponse,
  CreateBundlePayload,
  CreateTemplatePayload,
  BundlesFilter,
  Company,
} from './types';
