import { FormDefinition, FormSubmissionData } from '@/lib/form-engine'
import { FormSubmission } from '@/lib/submissions'

export interface EditHistoryEntry {
  id: string
  field_id: string
  field_label: string | null
  old_value: any
  new_value: any
  edited_by: string
  edited_at: string
}

export interface UnifiedPart {
  formId: string
  formName: string
  sortOrder: number
  assignedRole: string
  submission: FormSubmission | null
  formDefinition: FormDefinition | null
}

export interface PartState {
  editMode: boolean
  editedFormData: Record<string, any> | null
  editedFields: Set<string>
  currentView: 'current' | 'original'
  editHistory: EditHistoryEntry[]
  showPDFDropdown: boolean
  showDeleteConfirm: boolean
  deleteConfirmText: string
  isSaving: boolean
  isFinalizing: boolean
  isDeleting: boolean
  isGeneratingPDF: boolean
  isGeneratingChangesPDF: boolean
  isLoadingDetails: boolean
  error: string | null
  successMessage: string | null
  fullSubmission: FormSubmission | null
  /** Staff Review & Sign mode */
  reviewMode: boolean
  reviewStaffData: Record<string, any> | null
  isApproving: boolean
}

export function createInitialPartState(): PartState {
  return {
    editMode: false,
    editedFormData: null,
    editedFields: new Set(),
    currentView: 'current',
    editHistory: [],
    showPDFDropdown: false,
    showDeleteConfirm: false,
    deleteConfirmText: '',
    isSaving: false,
    isFinalizing: false,
    isDeleting: false,
    isGeneratingPDF: false,
    isGeneratingChangesPDF: false,
    isLoadingDetails: false,
    error: null,
    successMessage: null,
    fullSubmission: null,
    reviewMode: false,
    reviewStaffData: null,
    isApproving: false,
  }
}
