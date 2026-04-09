/**
 * Shared TypeScript types for the Onboarding Bundles system
 * Used across all onboarding components
 */

export type BundleStatus = 'not_started' | 'in_progress' | 'pending_review' | 'complete';
export type OnboardingRole = 'applicant' | 'rn_evaluator' | 'hr_admin';
export type PacketStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'needs_revision';
export type RenderMode = 'generated' | 'replica';

/**
 * Template configuration that defines which packets are included in an onboarding flow
 */
export interface Template {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  description?: string;
  state: string;
  is_active: boolean;
  packet_count: number;
  packets: TemplatePacket[];
  created_at: string;
  updated_at: string;
}

/**
 * A packet included in a template with its role assignment
 */
export interface TemplatePacket {
  id: string;
  form_packet_id: string;
  packet_name: string;
  render_mode: RenderMode;
  assigned_to_role: OnboardingRole;
  sort_order: number;
  is_required: boolean;
}

/**
 * Onboarding bundle for a specific applicant
 */
export interface Bundle {
  id: string;
  applicant_id: string;
  applicant_name: string;
  phone?: string;
  email?: string;
  template_name: string;
  company_name: string;
  company_id: string;
  status: BundleStatus;
  progress: BundleProgress;
  created_at: string;
  created_by_id: string;
  created_by_name: string;
  notes: BundleNote[];
}

/**
 * Applicant information within a bundle
 */
export interface BundleApplicant {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
}

/**
 * Progress tracking for a bundle
 */
export interface BundleProgress {
  total_packets: number;
  completed_packets: number;
  packets: BundlePacketStatus[];
}

/**
 * Individual packet status within a bundle
 */
export interface BundlePacketStatus {
  id: string;
  packet_id: string;
  packet_name: string;
  render_mode: RenderMode;
  assigned_to_role: OnboardingRole;
  is_required: boolean;
  status: PacketStatus;
  submission_id?: string;
  submitted_at?: string;
  submitted_by_role?: OnboardingRole;
}

/**
 * Note attached to a bundle
 */
export interface BundleNote {
  id: string;
  content: string;
  created_at: string;
  created_by_name: string;
  created_by_id: string;
}

/**
 * API Response types for common endpoints
 */
export interface BundlesListResponse {
  bundles: Bundle[];
  total: number;
  page: number;
  limit: number;
}

export interface BundleDetailResponse {
  bundle: Bundle;
  applicant: BundleApplicant;
}

export interface CreateBundlePayload {
  company_id: string;
  template_id: string;
  applicant_first_name: string;
  applicant_last_name: string;
  applicant_phone: string;
  applicant_email?: string;
  send_sms_invitation: boolean;
  notes?: string;
}

export interface CreateTemplatePayload {
  company_id: string;
  name: string;
  state: string;
  description?: string;
  packets: {
    form_packet_id: string;
    assigned_to_role: OnboardingRole;
    is_required: boolean;
    sort_order: number;
  }[];
}

/**
 * Filter state for bundles list
 */
export interface BundlesFilter {
  company_id?: string;
  status?: BundleStatus | 'all';
  search?: string;
  date_from?: string;
  date_to?: string;
  page: number;
  limit: number;
}

/**
 * Company information
 */
export interface Company {
  id: string;
  name: string;
  state?: string;
}

/**
 * Bundle packet as returned by the bundles API (used in mobile flow)
 */
export interface BundlePacket {
  packet_id: string;
  sort_order?: number;
  packet?: {
    display_name: string;
    form_package_id: string;
    role: string;
  };
}

/**
 * Full onboarding bundle response from the API (used in mobile flow)
 */
export interface OnboardingBundle {
  id: string;
  template_id: string;
  applicant_id: string;
  company_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
  bundle_packets?: BundlePacket[];
}
