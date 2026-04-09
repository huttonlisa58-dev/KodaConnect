export type Database = {
  public: {
    Tables: {
      states: {
        Row: {
          id: string;
          code: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      programs: {
        Row: {
          id: string;
          state_id: string;
          code: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          state_id: string;
          code: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          state_id?: string;
          code?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      document_templates: {
        Row: {
          id: string;
          program_id: string;
          name: string;
          slug: string;
          description: string | null;
          pdf_url: string;
          pdf_type: 'flat' | 'fillable';
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          name: string;
          slug: string;
          description?: string | null;
          pdf_url: string;
          pdf_type?: 'flat' | 'fillable';
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          pdf_url?: string;
          pdf_type?: 'flat' | 'fillable';
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      document_fields: {
        Row: {
          id: string;
          template_id: string;
          field_key: string;
          field_type: string;
          label: string;
          placeholder: string | null;
          help_text: string | null;
          is_required: boolean;
          validation_rules: Record<string, unknown>;
          pdf_page: number | null;
          pdf_x: number | null;
          pdf_y: number | null;
          pdf_width: number | null;
          pdf_height: number | null;
          pdf_font_size: number;
          pdf_field_name: string | null;
          section: string | null;
          sort_order: number;
          options: Array<{ label: string; value: string }>;
          show_if: { field: string; equals: string } | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          field_key: string;
          field_type: string;
          label: string;
          placeholder?: string | null;
          help_text?: string | null;
          is_required?: boolean;
          validation_rules?: Record<string, unknown>;
          pdf_page?: number | null;
          pdf_x?: number | null;
          pdf_y?: number | null;
          pdf_width?: number | null;
          pdf_height?: number | null;
          pdf_font_size?: number;
          pdf_field_name?: string | null;
          section?: string | null;
          sort_order?: number;
          options?: Array<{ label: string; value: string }>;
          show_if?: { field: string; equals: string } | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          field_key?: string;
          field_type?: string;
          label?: string;
          placeholder?: string | null;
          help_text?: string | null;
          is_required?: boolean;
          validation_rules?: Record<string, unknown>;
          pdf_page?: number | null;
          pdf_x?: number | null;
          pdf_y?: number | null;
          pdf_width?: number | null;
          pdf_height?: number | null;
          pdf_font_size?: number;
          pdf_field_name?: string | null;
          section?: string | null;
          sort_order?: number;
          options?: Array<{ label: string; value: string }>;
          show_if?: { field: string; equals: string } | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      staff: {
        Row: {
          id: string;
          auth_user_id: string | null;
          email: string;
          full_name: string;
          phone: string | null;
          is_super_admin: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          email: string;
          full_name: string;
          phone?: string | null;
          is_super_admin?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          email?: string;
          full_name?: string;
          phone?: string | null;
          is_super_admin?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      staff_permissions: {
        Row: {
          id: string;
          staff_id: string;
          template_id: string;
          permission: 'view' | 'download_pdf' | 'edit_until_approval' | 'edit_anytime';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          staff_id: string;
          template_id: string;
          permission?: 'view' | 'download_pdf' | 'edit_until_approval' | 'edit_anytime';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          staff_id?: string;
          template_id?: string;
          permission?: 'view' | 'download_pdf' | 'edit_until_approval' | 'edit_anytime';
          created_at?: string;
          updated_at?: string;
        };
      };
      applicants: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      submissions: {
        Row: {
          id: string;
          template_id: string;
          applicant_id: string;
          form_data: Record<string, unknown>;
          status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
          submitted_at: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          filled_pdf_url: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          applicant_id: string;
          form_data?: Record<string, unknown>;
          status?: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
          submitted_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          filled_pdf_url?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          applicant_id?: string;
          form_data?: Record<string, unknown>;
          status?: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
          submitted_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          filled_pdf_url?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      otp_codes: {
        Row: {
          id: string;
          phone: string;
          code: string;
          expires_at: string;
          used: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          phone: string;
          code: string;
          expires_at: string;
          used?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          code?: string;
          expires_at?: string;
          used?: boolean;
          created_at?: string;
        };
      };
      access_tokens: {
        Row: {
          id: string;
          token: string;
          submission_id: string;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          token: string;
          submission_id: string;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          token?: string;
          submission_id?: string;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      sms_log: {
        Row: {
          id: string;
          phone: string;
          message: string;
          sms_type: string;
          twilio_sid: string | null;
          status: string | null;
          related_submission_id: string | null;
          sent_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          phone: string;
          message: string;
          sms_type: string;
          twilio_sid?: string | null;
          status?: string | null;
          related_submission_id?: string | null;
          sent_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          message?: string;
          sms_type?: string;
          twilio_sid?: string | null;
          status?: string | null;
          related_submission_id?: string | null;
          sent_by?: string | null;
          created_at?: string;
        };
      };
      patients: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          email: string | null;
          date_of_birth: string | null;
          relationship: string | null;
          primary_insurance: string | null;
          auth_type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name?: string;
          phone: string;
          email?: string | null;
          date_of_birth?: string | null;
          relationship?: string | null;
          primary_insurance?: string | null;
          auth_type?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string;
          email?: string | null;
          date_of_birth?: string | null;
          relationship?: string | null;
          primary_insurance?: string | null;
          auth_type?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      caregivers: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          role: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      caregiver_assignments: {
        Row: {
          id: string;
          patient_id: string;
          caregiver_id: string;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          caregiver_id: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          caregiver_id?: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      care_plans: {
        Row: {
          id: string;
          patient_id: string;
          summary: string;
          description: string | null;
          start_date: string;
          next_visit_date: string | null;
          visit_frequency: string | null;
          special_instructions: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          summary: string;
          description?: string | null;
          start_date?: string;
          next_visit_date?: string | null;
          visit_frequency?: string | null;
          special_instructions?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          summary?: string;
          description?: string | null;
          start_date?: string;
          next_visit_date?: string | null;
          visit_frequency?: string | null;
          special_instructions?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      credentials: {
        Row: {
          id: string;
          company_id: string;
          staff_id: string;
          credential_type: string;
          status: string;
          expiry_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          staff_id: string;
          credential_type: string;
          status?: string;
          expiry_date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          staff_id?: string;
          credential_type?: string;
          status?: string;
          expiry_date?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      training_completions: {
        Row: {
          id: string;
          company_id: string;
          staff_id: string;
          module_id: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          staff_id: string;
          module_id: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          staff_id?: string;
          module_id?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      compliance_alerts: {
        Row: {
          id: string;
          company_id: string;
          severity: string;
          title: string;
          description: string;
          dismissed: boolean;
          dismissed_at: string | null;
          acknowledged: boolean;
          acknowledged_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          severity: string;
          title: string;
          description: string;
          dismissed?: boolean;
          dismissed_at?: string | null;
          acknowledged?: boolean;
          acknowledged_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          severity?: string;
          title?: string;
          description?: string;
          dismissed?: boolean;
          dismissed_at?: string | null;
          acknowledged?: boolean;
          acknowledged_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Enums: {
      permission_level: 'view' | 'download_pdf' | 'edit_until_approval' | 'edit_anytime';
      submission_status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
    };
  };
};

// Helper types
export type State = Database['public']['Tables']['states']['Row'];
export type Program = Database['public']['Tables']['programs']['Row'];
export type DocumentTemplate = Database['public']['Tables']['document_templates']['Row'];
export type DocumentField = Database['public']['Tables']['document_fields']['Row'];
export type Staff = Database['public']['Tables']['staff']['Row'];
export type StaffPermission = Database['public']['Tables']['staff_permissions']['Row'];
export type Applicant = Database['public']['Tables']['applicants']['Row'];
export type Submission = Database['public']['Tables']['submissions']['Row'];
export type OtpCode = Database['public']['Tables']['otp_codes']['Row'];
export type AccessToken = Database['public']['Tables']['access_tokens']['Row'];
export type SmsLog = Database['public']['Tables']['sms_log']['Row'];
export type Patient = Database['public']['Tables']['patients']['Row'];
export type Caregiver = Database['public']['Tables']['caregivers']['Row'];
export type CaregiverAssignment = Database['public']['Tables']['caregiver_assignments']['Row'];
export type CarePlan = Database['public']['Tables']['care_plans']['Row'];
export type Credential = Database['public']['Tables']['credentials']['Row'];
export type TrainingCompletion = Database['public']['Tables']['training_completions']['Row'];
export type ComplianceAlert = Database['public']['Tables']['compliance_alerts']['Row'];

export type PermissionLevel = Database['public']['Enums']['permission_level'];
export type SubmissionStatus = Database['public']['Enums']['submission_status'];
