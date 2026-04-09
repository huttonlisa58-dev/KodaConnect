'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  User,
  Phone,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Edit3,
  Save,
  Download,
  Eye,
  Shield,
  AlertCircle,
  Loader2,
  Building2,
  History,
  Briefcase,
  GraduationCap,
  Users,
  FileCheck,
  DollarSign,
  Heart,
  Gift,
  PenTool,
  Check,
  X,
} from 'lucide-react';

interface Submission {
  id: string;
  applicant_id: string;
  template_id: string;
  company_id: string | null;
  status: string;
  form_data: Record<string, string>;
  signature_data?: Record<string, string>;
  current_step: number;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  approved_at?: string;
  approved_by?: string;
  last_saved_at?: string;
}

interface Applicant {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  slug: string;
  pdf_url: string;
  company_id: string | null;
  is_fillable_pdf: boolean;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface DocumentField {
  id: string;
  field_key: string;
  field_type: string;
  label: string;
  is_required: boolean;
  sort_order: number;
  section: string | null;
  pdf_field_name?: string;
  help_text?: string;
  placeholder?: string;
}

interface ConsentRecord {
  id: string;
  esignature_consent: boolean;
  staff_edit_consent: boolean;
  accuracy_certification: boolean;
  ip_address?: string;
  user_agent?: string;
  device_info?: Record<string, unknown>;
  consent_timestamp: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  field_name?: string;
  old_value?: unknown;
  new_value?: unknown;
  user_id?: string;
  created_at: string;
}

// Tab configuration matching demo
const TABS = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'position', label: 'Position & Skills', icon: Briefcase },
  { id: 'employment', label: 'Employment', icon: Building2 },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'references', label: 'References', icon: Users },
  { id: 'background', label: 'Background', icon: FileCheck },
  { id: 'wotc', label: 'WOTC', icon: DollarSign },
  { id: 'tax', label: 'Tax & Payment', icon: DollarSign },
  { id: 'health', label: 'Health', icon: Heart },
  { id: 'benefits', label: 'Benefits', icon: Gift },
  { id: 'signatures', label: 'Signatures', icon: PenTool },
];

// Map sections to tabs
const SECTION_TO_TAB: Record<string, string> = {
  'Personal Information': 'personal',
  'Position & Availability': 'position',
  'Employment History': 'employment',
  'Education & References': 'education',
  'Background Information': 'background',
  'WOTC Eligibility': 'wotc',
  'Tax & Payment': 'tax',
  'Health & TB Screening': 'health',
  'Benefits': 'benefits',
  'Policy Acknowledgments': 'benefits',
  'Applicant Signatures': 'signatures',
  'Office Only - Reference Verification': 'references',
  'Office Only - Internal': 'signatures',
};

export default function SubmissionDetailPage() {
  const params = useParams();
  const submissionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [fields, setFields] = useState<DocumentField[]>([]);
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('personal');

  // Office signature
  const [officeSignature, setOfficeSignature] = useState<string | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    loadSubmission();
  }, [submissionId]);

  // Initialize signature canvas
  useEffect(() => {
    if (activeTab === 'signatures' && signatureCanvasRef.current) {
      const canvas = signatureCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
      }
    }
  }, [activeTab]);

  async function loadSubmission() {
    setLoading(true);

    try {
      // Load submission
      const { data: submissionData, error: submissionError } = await getSupabase()
        .from('submissions')
        .select('*')
        .eq('id', submissionId)
        .single();

      if (submissionError || !submissionData) {
        console.error('Failed to load submission:', submissionError);
        return;
      }

      setSubmission(submissionData);
      setEditedData(submissionData.form_data || {});

      // Load applicant
      const { data: applicantData } = await getSupabase()
        .from('applicants')
        .select('*')
        .eq('id', submissionData.applicant_id)
        .single();

      if (applicantData) setApplicant(applicantData);

      // Load template
      const { data: templateData } = await getSupabase()
        .from('document_templates')
        .select('*')
        .eq('id', submissionData.template_id)
        .single();

      if (templateData) {
        setTemplate(templateData);

        // Load company
        if (templateData.company_id) {
          const { data: companyData } = await getSupabase()
            .from('companies')
            .select('*')
            .eq('id', templateData.company_id)
            .single();

          if (companyData) setCompany(companyData);
        }
      }

      // Load fields
      const { data: fieldsData } = await getSupabase()
        .from('document_fields')
        .select('*')
        .eq('template_id', submissionData.template_id)
        .order('sort_order');

      if (fieldsData) setFields(fieldsData);

      // Load consent record
      const { data: consentData } = await getSupabase()
        .from('consent_records')
        .select('*')
        .eq('submission_id', submissionId)
        .single();

      if (consentData) setConsent(consentData);

      // Load audit log
      const { data: auditData } = await getSupabase()
        .from('submission_audit_log')
        .select('*')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false });

      if (auditData) setAuditLog(auditData);

    } catch (error) {
      console.error('Error loading submission:', error);
    } finally {
      setLoading(false);
    }
  }

  async function logChange(action: string, fieldName?: string, oldValue?: unknown, newValue?: unknown) {
    try {
      await getSupabase()
        .from('submission_audit_log')
        .insert({
          submission_id: submissionId,
          action,
          field_name: fieldName,
          old_value: oldValue ? JSON.stringify(oldValue) : null,
          new_value: newValue ? JSON.stringify(newValue) : null,
        });
    } catch (err) {
      console.error('Failed to log change:', err);
    }
  }

  async function handleSave() {
    if (!submission) return;

    setSaving(true);

    try {
      // Find changed fields for audit log
      const changes: { field: string; oldVal: string; newVal: string }[] = [];
      for (const key of Object.keys(editedData)) {
        const oldVal = submission.form_data?.[key] || '';
        const newVal = editedData[key] || '';
        if (oldVal !== newVal) {
          changes.push({ field: key, oldVal, newVal });
        }
      }

      const { error } = await getSupabase()
        .from('submissions')
        .update({
          form_data: editedData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', submission.id);

      if (error) throw error;

      // Log each change
      for (const change of changes) {
        const field = fields.find(f => f.field_key === change.field);
        await logChange('field_updated', field?.label || change.field, change.oldVal, change.newVal);
      }

      setSubmission({ ...submission, form_data: editedData });
      setEditMode(false);

      // Reload audit log
      const { data: auditData } = await getSupabase()
        .from('submission_audit_log')
        .select('*')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false });
      if (auditData) setAuditLog(auditData);

      alert('Changes saved!');

    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!submission) return;

    const oldStatus = submission.status;

    try {
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === 'approved') {
        updateData.approved_at = new Date().toISOString();
      }

      const { error } = await getSupabase()
        .from('submissions')
        .update(updateData)
        .eq('id', submission.id);

      if (error) throw error;

      await logChange('status_changed', 'status', oldStatus, newStatus);

      setSubmission({ ...submission, status: newStatus });

      // Reload audit log
      const { data: auditData } = await getSupabase()
        .from('submission_audit_log')
        .select('*')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false });
      if (auditData) setAuditLog(auditData);

    } catch (error) {
      console.error('Status update error:', error);
      alert('Failed to update status');
    }
  }

  async function downloadFilledPdf() {
    if (!submission) return;

    setDownloading(true);

    try {
      const response = await fetch(`/api/generate-filled-pdf?submission_id=${submission.id}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate PDF');
      }

      // Get the blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template?.name || 'form'}_${applicant?.full_name || 'applicant'}_filled.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Download error:', error);
      alert(error instanceof Error ? error.message : 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  }

  // Signature drawing functions
  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    setIsDrawing(true);
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    setOfficeSignature(null);
  }

  function saveSignature() {
    const canvas = signatureCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      setOfficeSignature(dataUrl);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Draft';
      case 'submitted': return 'Ready for Review';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  // Get fields for current tab
  const getFieldsForTab = (tabId: string) => {
    return fields.filter(f => {
      const section = f.section || 'Personal Information';
      const mappedTab = SECTION_TO_TAB[section];
      return mappedTab === tabId;
    });
  };

  // Render field in view or edit mode
  function renderField(field: DocumentField) {
    const value = editMode ? (editedData[field.field_key] || '') : (submission?.form_data?.[field.field_key] || '');

    if (!editMode) {
      // View mode
      if (field.field_type === 'checkbox') {
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm ${
            value === 'true' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {value === 'true' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {value === 'true' ? 'Yes' : 'No'}
          </span>
        );
      }
      return (
        <span className="text-gray-900">
          {value || <span className="text-gray-400 italic">Not provided</span>}
        </span>
      );
    }

    // Edit mode
    const inputClasses = "w-full px-3 py-2 border border-amber-300 rounded-lg bg-amber-50 focus:ring-2 focus:ring-amber-500 focus:border-transparent";

    switch (field.field_type) {
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => setEditedData({ ...editedData, [field.field_key]: e.target.value })}
            className={`${inputClasses} min-h-[80px]`}
            placeholder={field.placeholder || ''}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => setEditedData({ ...editedData, [field.field_key]: e.target.value })}
            className={inputClasses}
          />
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value === 'true'}
              onChange={(e) => setEditedData({ ...editedData, [field.field_key]: String(e.target.checked) })}
              className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
            />
            <span className="text-gray-700">Yes</span>
          </label>
        );
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => setEditedData({ ...editedData, [field.field_key]: e.target.value })}
            className={inputClasses}
          >
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        );
      default:
        return (
          <input
            type={field.field_type === 'email' ? 'email' : field.field_type === 'tel' ? 'tel' : 'text'}
            value={value}
            onChange={(e) => setEditedData({ ...editedData, [field.field_key]: e.target.value })}
            className={inputClasses}
            placeholder={field.placeholder || ''}
          />
        );
    }
  }

  // Render tab content
  function renderTabContent() {
    const tabFields = getFieldsForTab(activeTab);

    // Special rendering for signatures tab
    if (activeTab === 'signatures') {
      return (
        <div className="space-y-6">
          {/* Office Signature Capture */}
          <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-2 border-sky-200 rounded-xl p-6">
            <h4 className="text-sky-800 font-semibold mb-3 flex items-center gap-2">
              <PenTool className="w-5 h-5" />
              Your Office Signature
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Create your signature below. Use it to sign documents requiring office authorization.
            </p>
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-2">
              <canvas
                ref={signatureCanvasRef}
                width={500}
                height={100}
                className="w-full border border-gray-200 rounded cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            <div className="flex gap-3 mt-3">
              <button
                onClick={clearSignature}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Clear
              </button>
              <button
                onClick={saveSignature}
                className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700"
              >
                Save Signature
              </button>
            </div>
            {officeSignature && (
              <div className="mt-4 p-3 bg-white rounded-lg flex items-center gap-4">
                <img src={officeSignature} alt="Your signature" className="max-h-12 border rounded p-1" />
                <div>
                  <p className="font-medium text-sm">Your Saved Signature</p>
                  <p className="text-xs text-gray-500">Ready to apply to documents</p>
                </div>
              </div>
            )}
          </div>

          {/* Applicant Signature */}
          {submission?.signature_data && Object.keys(submission.signature_data).length > 0 && (
            <div className="bg-white border rounded-xl">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-gray-900">Applicant Signatures</h3>
              </div>
              <div className="p-4 space-y-4">
                {Object.entries(submission.signature_data).map(([key, value]) => {
                  const field = fields.find(f => f.field_key === key);
                  return (
                    <div key={key} className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
                      <img
                        src={value}
                        alt={`Signature: ${field?.label || key}`}
                        className="max-h-16 bg-white border rounded p-2"
                      />
                      <div>
                        <p className="font-medium">{field?.label || key}</p>
                        <p className="text-xs text-gray-500">
                          Signed: {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Regular signature fields */}
          {tabFields.length > 0 && (
            <div className="bg-white border rounded-xl">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-gray-900">Office Signature Fields</h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  {tabFields.map(field => (
                    <div key={field.id} className="space-y-1">
                      <label className="block text-xs text-gray-500 uppercase font-medium">
                        {field.label}
                        {field.is_required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {renderField(field)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Group fields by subsection if needed
    const groupedFields: Record<string, DocumentField[]> = {};
    tabFields.forEach(field => {
      const group = field.section || 'General';
      if (!groupedFields[group]) groupedFields[group] = [];
      groupedFields[group].push(field);
    });

    return (
      <div className="space-y-6">
        {Object.entries(groupedFields).map(([section, sectionFields]) => (
          <div key={section} className="bg-white border rounded-xl">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-900">{section}</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {sectionFields.map(field => (
                  <div
                    key={field.id}
                    className={`space-y-1 ${
                      field.field_type === 'textarea' ? 'md:col-span-2' : ''
                    }`}
                  >
                    <label className="block text-xs text-gray-500 uppercase font-medium">
                      {field.label}
                      {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderField(field)}
                    {field.help_text && (
                      <p className="text-xs text-gray-400">{field.help_text}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {tabFields.length === 0 && (
          <div className="bg-white border rounded-xl p-8 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>No fields in this section.</p>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900">Submission Not Found</h1>
          <Link href="/office" className="text-blue-600 hover:underline mt-4 inline-block">
            ← Back to Office Portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Edit Mode Banner */}
      {editMode && (
        <div className="fixed top-0 left-0 right-0 bg-amber-100 border-b border-amber-300 px-4 py-3 flex items-center justify-between z-50">
          <p className="text-amber-800 font-medium flex items-center gap-2">
            <Edit3 className="w-4 h-4" />
            Edit Mode - Make changes to any field
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditedData(submission.form_data || {});
                setEditMode(false);
              }}
              className="px-4 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`bg-white shadow-sm border-b ${editMode ? 'mt-14' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link
            href="/office"
            className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Applications
          </Link>

          {/* Applicant Header */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-2xl font-bold text-blue-600">
              {applicant?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{applicant?.full_name || 'Unknown Applicant'}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-1">
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {applicant?.phone || 'N/A'}
                </span>
                {submission.form_data?.email && (
                  <span className="flex items-center gap-1">
                    ✉️ {submission.form_data.email}
                  </span>
                )}
                {submission.form_data?.position_applied && (
                  <span className="flex items-center gap-1">
                    💼 {submission.form_data.position_applied}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(submission.status)}`}>
                {getStatusLabel(submission.status)}
              </span>
              <button
                onClick={() => setEditMode(!editMode)}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Edit Application
              </button>
              {submission.status === 'submitted' && (
                <>
                  <button
                    onClick={() => updateStatus('rejected')}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => updateStatus('approved')}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="bg-white rounded-xl p-1 flex flex-wrap gap-1 mb-6 shadow-sm">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mb-6">
          {renderTabContent()}
        </div>

        {/* Bottom Actions & Info */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Consent Record */}
          {consent && (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-gray-500" />
                  Consent & Acknowledgments
                </h2>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>E-Signature Consent</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Staff Edit Consent</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Accuracy Certification</span>
                </div>
                <div className="mt-3 pt-3 border-t text-xs text-gray-500">
                  <p>Timestamp: {new Date(consent.consent_timestamp).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-500" />
                Timeline
              </h2>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Created:</span>
                <span>{new Date(submission.created_at).toLocaleDateString()}</span>
              </div>
              {submission.submitted_at && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-yellow-500" />
                  <span className="text-gray-500">Submitted:</span>
                  <span>{new Date(submission.submitted_at).toLocaleDateString()}</span>
                </div>
              )}
              {submission.approved_at && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-gray-500">Approved:</span>
                  <span>{new Date(submission.approved_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-900">Actions</h2>
            </div>
            <div className="p-4 space-y-3">
              <a
                href={template?.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                <Eye className="w-4 h-4" />
                View Original PDF
              </a>
              {template?.is_fillable_pdf && submission.status !== 'draft' && (
                <button
                  onClick={downloadFilledPdf}
                  disabled={downloading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download Filled PDF
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Audit Log */}
        {auditLog.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <History className="w-5 h-5 text-gray-500" />
                Change History
              </h2>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto">
              <div className="space-y-3">
                {auditLog.map(entry => (
                  <div key={entry.id} className="text-sm border-b pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{entry.action.replace('_', ' ')}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    {entry.field_name && (
                      <p className="text-gray-600 mt-1">
                        Field: <strong>{entry.field_name}</strong>
                      </p>
                    )}
                    {entry.old_value !== undefined && entry.new_value !== undefined && (
                      <p className="text-xs text-gray-500 mt-1">
                        Changed from &quot;{String(entry.old_value).replace(/"/g, '')}&quot; to &quot;{String(entry.new_value).replace(/"/g, '')}&quot;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
