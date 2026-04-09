'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  Trash2,
  MessageSquare,
  Save,
  Building2,
  FileCheck,
  FileWarning,
} from 'lucide-react';

// PDF.js will be loaded dynamically to avoid SSR issues
type PDFJSLib = typeof import('pdfjs-dist');
let pdfjsLib: PDFJSLib | null = null;

async function loadPdfJs(): Promise<PDFJSLib> {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  // Use self-hosted worker to comply with Vercel CSP (script-src 'self')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  pdfjsLib = pdfjs;
  return pdfjs;
}

interface DetectedField {
  field_key: string;
  field_type: string;
  label: string;
  page_numbers: number[];
  is_required: boolean;
  similar_labels: string[];
  options?: string[];
  approved?: boolean;
  developer_comment?: string;
  pdf_field_name?: string; // Original PDF field name for fillable PDFs
}

interface Template {
  id: string;
  name: string;
  slug: string;
  pdf_url: string;
  company_id: string | null;
  detected_fields: {
    detected_fields: DetectedField[];
    raw_fields_by_page: { page: number; fields: unknown[] }[];
    status: string;
  } | null;
  detection_status: string;
  summary: string | null;
  summary_approved: boolean;
  is_fillable_pdf: boolean;
  pdf_form_fields: { name: string; type: string }[] | null;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  active: boolean;
}

export default function DeveloperPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [editedFields, setEditedFields] = useState<DetectedField[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [newDocName, setNewDocName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [uploadMode, setUploadMode] = useState<'flat' | 'fillable'>('fillable');
  const [extractingFields, setExtractingFields] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    // Load companies
    const { data: companiesData } = await getSupabase()
      .from('companies')
      .select('*')
      .eq('active', true)
      .order('name');

    if (companiesData) {
      setCompanies(companiesData as Company[]);
    }

    // Load templates
    const { data: templatesData } = await getSupabase()
      .from('document_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (templatesData) {
      setTemplates(templatesData as Template[]);
    }

    setLoading(false);
  }

  async function handleUploadDocument() {
    if (!uploadFile || !selectedCompany || !newDocName.trim()) {
      alert('Please fill in all fields');
      return;
    }

    setUploading(true);

    try {
      // Upload PDF to Supabase Storage
      const fileName = `${Date.now()}-${uploadFile.name}`;
      const { error: uploadError } = await getSupabase().storage
        .from('documents')
        .upload(fileName, uploadFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = getSupabase().storage
        .from('documents')
        .getPublicUrl(fileName);

      // Create document template record
      const slug = newDocName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const { data: newTemplate, error: insertError } = await getSupabase()
        .from('document_templates')
        .insert({
          company_id: selectedCompany,
          name: newDocName,
          slug,
          pdf_url: urlData.publicUrl,
          pdf_type: uploadMode,
          is_fillable_pdf: uploadMode === 'fillable',
          detection_status: 'not_started',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // If fillable PDF, extract form fields automatically
      if (uploadMode === 'fillable' && newTemplate) {
        setExtractingFields(true);
        await extractFillableFields(newTemplate.id, uploadFile);
      }

      // Refresh data
      await loadData();
      setShowUploadModal(false);
      setUploadFile(null);
      setNewDocName('');
      setSelectedCompany('');

    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload document');
    } finally {
      setUploading(false);
      setExtractingFields(false);
    }
  }

  async function extractFillableFields(templateId: string, file: File) {
    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Call API to extract PDF form fields
      const response = await fetch('/api/extract-pdf-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          pdf_base64: base64,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to extract fields');
      }

      console.log('Extracted fields:', result);

    } catch (error) {
      console.error('Field extraction error:', error);
      alert('Failed to extract PDF form fields. You may need to analyze manually.');
    }
  }

  async function analyzeDocument(template: Template) {
    setSelectedTemplate(template);
    setAnalyzing(true);

    try {
      // Load PDF.js dynamically
      console.log('Loading PDF.js...');
      const pdfjs = await loadPdfJs();

      // Fetch PDF through our proxy to avoid CORS issues
      console.log('Fetching PDF:', template.pdf_url);
      const proxyUrl = `/api/proxy-pdf?url=${encodeURIComponent(template.pdf_url)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch PDF: ${response.status} - ${errorText}`);
      }

      const pdfData = await response.arrayBuffer();
      console.log('PDF fetched, size:', pdfData.byteLength);

      // Load PDF with PDF.js
      console.log('Loading PDF with PDF.js...');
      const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
      const totalPages = pdf.numPages;
      console.log('PDF loaded, pages:', totalPages);
      setAnalysisProgress({ current: 0, total: totalPages });

      // Render each page to an image
      const pageImages: { page: number; image: string }[] = [];

      for (let i = 1; i <= totalPages; i++) {
        setAnalysisProgress({ current: i, total: totalPages });

        const page = await pdf.getPage(i);
        const scale = 2; // Higher scale for better OCR
        const viewport = page.getViewport({ scale });

        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render page
        await page.render({ canvasContext: context, viewport }).promise;

        // Convert to base64 (remove data:image/png;base64, prefix)
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        pageImages.push({ page: i, image: base64 });
      }

      // Send to API for analysis
      const analysisResponse = await fetch('/api/analyze-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          page_images: pageImages,
        }),
      });

      const result = await analysisResponse.json();

      if (!analysisResponse.ok) {
        throw new Error(result.error || 'Analysis failed');
      }

      // Refresh data
      await loadData();

      // Select the updated template
      const { data: updatedTemplate } = await getSupabase()
        .from('document_templates')
        .select('*')
        .eq('id', template.id)
        .single();

      if (updatedTemplate) {
        setSelectedTemplate(updatedTemplate as Template);
        setEditedFields(updatedTemplate.detected_fields?.detected_fields || []);
        setEditedSummary(updatedTemplate.summary || '');
      }

    } catch (error) {
      console.error('Analysis error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to analyze document: ${errorMessage}`);
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleFieldExpanded(fieldKey: string) {
    const newExpanded = new Set(expandedFields);
    if (newExpanded.has(fieldKey)) {
      newExpanded.delete(fieldKey);
    } else {
      newExpanded.add(fieldKey);
    }
    setExpandedFields(newExpanded);
  }

  function updateField(fieldKey: string, updates: Partial<DetectedField>) {
    setEditedFields(fields =>
      fields.map(f => f.field_key === fieldKey ? { ...f, ...updates } : f)
    );
  }

  async function saveSummary(approve = false) {
    if (!selectedTemplate) return;

    try {
      const { error } = await getSupabase()
        .from('document_templates')
        .update({
          summary: editedSummary,
          summary_approved: approve,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedTemplate.id);

      if (error) throw error;

      alert(approve ? 'Summary approved!' : 'Summary saved!');
      await loadData();

      // Update local state
      setSelectedTemplate({
        ...selectedTemplate,
        summary: editedSummary,
        summary_approved: approve,
      });

    } catch (error) {
      console.error('Save summary error:', error);
      alert('Failed to save summary');
    }
  }

  async function saveFieldApprovals() {
    if (!selectedTemplate) return;

    try {
      // Treat undefined/true as approved, only false means not approved
      const allApproved = editedFields.every(f => f.approved !== false);

      const updatedDetectedFields = {
        ...selectedTemplate.detected_fields,
        detected_fields: editedFields.map(f => ({ ...f, approved: f.approved !== false })),
        status: allApproved ? 'approved' : 'pending_review',
      };

      const { error } = await getSupabase()
        .from('document_templates')
        .update({
          detected_fields: updatedDetectedFields,
          detection_status: allApproved ? 'approved' : 'pending_review',
        })
        .eq('id', selectedTemplate.id);

      if (error) throw error;

      alert('Saved successfully!');
      await loadData();

    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save');
    }
  }

  async function approveAndGenerateForm() {
    if (!selectedTemplate) return;

    // First save all approvals
    await saveFieldApprovals();

    // Delete existing fields for this template to prevent duplicates
    await getSupabase()
      .from('document_fields')
      .delete()
      .eq('template_id', selectedTemplate.id);

    // Then create document_fields records from approved fields
    const approvedFields = editedFields.filter(f => f.approved !== false);

    for (let i = 0; i < approvedFields.length; i++) {
      const field = approvedFields[i];

      await getSupabase().from('document_fields').insert({
        template_id: selectedTemplate.id,
        field_key: field.field_key,
        field_type: field.field_type,
        label: field.label,
        is_required: field.is_required,
        sort_order: i,
        options: field.options ? JSON.stringify(field.options.map(o => ({ label: o, value: o }))) : '[]',
        pdf_field_name: field.pdf_field_name || null, // Store original PDF field name
      });
    }

    alert(`Form generated with ${approvedFields.length} fields!`);
    await loadData();
  }

  function getCompanyName(companyId: string | null) {
    if (!companyId) return 'Unassigned';
    const company = companies.find(c => c.id === companyId);
    return company?.name || 'Unknown';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">KodaConnect Developer Portal</h1>
            <p className="text-sm text-gray-400">PDF Field Detection & Form Configuration</p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload Document
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar - Document List */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Documents by Company
            </h2>
            {companies.length === 0 ? (
              <p className="text-gray-500 text-sm">No companies configured. Run the database migration first.</p>
            ) : templates.length === 0 ? (
              <p className="text-gray-500 text-sm">No documents yet. Upload one to get started.</p>
            ) : (
              <div className="space-y-4">
                {companies.map(company => {
                  const companyTemplates = templates.filter(t => t.company_id === company.id);
                  if (companyTemplates.length === 0) return null;

                  return (
                    <div key={company.id}>
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                        <Building2 className="w-4 h-4" />
                        {company.name}
                      </div>
                      <div className="space-y-2 ml-6">
                        {companyTemplates.map(template => (
                          <button
                            key={template.id}
                            onClick={() => {
                              setSelectedTemplate(template);
                              setEditedFields(template.detected_fields?.detected_fields || []);
                              setEditedSummary(template.summary || '');
                            }}
                            className={`w-full text-left p-3 rounded-lg transition-colors ${
                              selectedTemplate?.id === template.id
                                ? 'bg-blue-600'
                                : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {template.is_fillable_pdf ? (
                                <FileCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-400" />
                              ) : (
                                <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{template.name}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {template.is_fillable_pdf && (
                                    <span className="text-green-400 mr-2">Fillable PDF</span>
                                  )}
                                  {template.detection_status === 'approved' && (
                                    <span className="text-green-400 flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" /> Approved
                                    </span>
                                  )}
                                  {template.detection_status === 'pending_review' && (
                                    <span className="text-yellow-400">Pending Review</span>
                                  )}
                                  {template.detection_status === 'not_started' && (
                                    <span className="text-gray-500">Not Analyzed</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Unassigned templates */}
                {templates.filter(t => !t.company_id).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                      <FileWarning className="w-4 h-4" />
                      Unassigned
                    </div>
                    <div className="space-y-2 ml-6">
                      {templates.filter(t => !t.company_id).map(template => (
                        <button
                          key={template.id}
                          onClick={() => {
                            setSelectedTemplate(template);
                            setEditedFields(template.detected_fields?.detected_fields || []);
                            setEditedSummary(template.summary || '');
                          }}
                          className={`w-full text-left p-3 rounded-lg transition-colors ${
                            selectedTemplate?.id === template.id
                              ? 'bg-blue-600'
                              : 'bg-gray-700 hover:bg-gray-600'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{template.name}</p>
                              <p className="text-xs text-yellow-500 mt-1">
                                Needs company assignment
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedTemplate ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <FileText className="w-16 h-16 mb-4" />
              <p>Select a document to view or analyze</p>
            </div>
          ) : analyzing ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
              <p className="text-lg font-medium">Analyzing Document...</p>
              <p className="text-gray-400 mt-2">
                Page {analysisProgress.current} of {analysisProgress.total}
              </p>
              <div className="w-64 bg-gray-700 rounded-full h-2 mt-4">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">{selectedTemplate.name}</h2>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-sm text-gray-400 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {getCompanyName(selectedTemplate.company_id)}
                    </span>
                    {selectedTemplate.is_fillable_pdf && (
                      <span className="text-sm text-green-400 flex items-center gap-1">
                        <FileCheck className="w-3 h-3" />
                        Fillable PDF
                      </span>
                    )}
                    <a
                      href={selectedTemplate.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline text-sm flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> View PDF
                    </a>
                  </div>
                </div>
                <div className="flex gap-3">
                  {selectedTemplate.detection_status === 'not_started' && (
                    <button
                      onClick={() => analyzeDocument(selectedTemplate)}
                      className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg flex items-center gap-2"
                    >
                      <Loader2 className="w-4 h-4" />
                      Analyze Fields
                    </button>
                  )}
                  {editedFields.length > 0 && (
                    <>
                      <button
                        onClick={saveFieldApprovals}
                        className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        Save Changes
                      </button>
                      <button
                        onClick={approveAndGenerateForm}
                        className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve & Generate Form
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Document Summary Section */}
              {selectedTemplate.summary && (
                <div className="bg-gray-800 rounded-lg p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Document Summary
                      {selectedTemplate.summary_approved ? (
                        <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs ml-2">
                          Approved
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded text-xs ml-2">
                          Pending Approval
                        </span>
                      )}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveSummary(false)}
                        className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                      >
                        Save Draft
                      </button>
                      <button
                        onClick={() => saveSummary(true)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Approve Summary
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={editedSummary}
                    onChange={(e) => setEditedSummary(e.target.value)}
                    placeholder="Document summary will appear here after analysis..."
                    className="w-full bg-gray-700 rounded-lg px-4 py-3 text-sm min-h-[150px] resize-y"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    This summary will be shown to applicants before they fill out the form. Edit as needed.
                  </p>
                </div>
              )}

              {/* PDF Form Fields (for fillable PDFs) */}
              {selectedTemplate.is_fillable_pdf && selectedTemplate.pdf_form_fields && (
                <div className="bg-gray-800 rounded-lg p-6 mb-6">
                  <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <FileCheck className="w-5 h-5 text-green-400" />
                    PDF Form Fields Detected
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedTemplate.pdf_form_fields.map((field, i) => (
                      <div key={i} className="bg-gray-700 rounded px-3 py-2 text-sm">
                        <span className="font-medium">{field.name}</span>
                        <span className="text-gray-400 ml-2">({field.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {editedFields.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-8 text-center">
                  <AlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-400">
                    {selectedTemplate.is_fillable_pdf
                      ? 'Fillable PDF fields detected. Click "Analyze Fields" to map them to form inputs.'
                      : 'No fields detected yet. Click "Analyze Fields" to start.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-gray-400 mb-4">
                    <span>{editedFields.length} unique fields detected</span>
                    <span>
                      {editedFields.filter(f => f.approved).length} approved
                    </span>
                  </div>

                  {editedFields.map(field => (
                    <div
                      key={field.field_key}
                      className={`bg-gray-800 rounded-lg border ${
                        field.approved ? 'border-green-500/50' : 'border-gray-700'
                      }`}
                    >
                      <div
                        className="p-4 cursor-pointer flex items-center gap-4"
                        onClick={() => toggleFieldExpanded(field.field_key)}
                      >
                        {expandedFields.has(field.field_key) ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}

                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{field.label}</span>
                            <span className="px-2 py-0.5 bg-gray-700 rounded text-xs">
                              {field.field_type}
                            </span>
                            {field.is_required && (
                              <span className="px-2 py-0.5 bg-red-900/50 text-red-400 rounded text-xs">
                                Required
                              </span>
                            )}
                            {field.pdf_field_name && (
                              <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">
                                PDF: {field.pdf_field_name}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Pages: {field.page_numbers.join(', ')}
                          </p>
                        </div>

                        <label className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={field.approved ?? true}
                            onChange={e => updateField(field.field_key, { approved: e.target.checked })}
                            className="w-4 h-4 rounded"
                          />
                          <span className="text-sm">Approve</span>
                        </label>
                      </div>

                      {expandedFields.has(field.field_key) && (
                        <div className="px-4 pb-4 pt-2 border-t border-gray-700 space-y-3">
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Field Key</label>
                            <input
                              type="text"
                              value={field.field_key}
                              onChange={e => updateField(field.field_key, { field_key: e.target.value })}
                              className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Label</label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={e => updateField(field.field_key, { label: e.target.value })}
                              className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Field Type</label>
                            <select
                              value={field.field_type}
                              onChange={e => updateField(field.field_key, { field_type: e.target.value })}
                              className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                            >
                              <option value="text">Text</option>
                              <option value="textarea">Text Area</option>
                              <option value="date">Date</option>
                              <option value="phone">Phone</option>
                              <option value="email">Email</option>
                              <option value="ssn">SSN</option>
                              <option value="checkbox">Checkbox</option>
                              <option value="checkbox_group">Checkbox Group</option>
                              <option value="radio">Radio</option>
                              <option value="signature">Signature</option>
                              <option value="initial">Initials</option>
                              <option value="number">Number</option>
                              <option value="currency">Currency</option>
                            </select>
                          </div>

                          {field.pdf_field_name && (
                            <div>
                              <label className="block text-sm text-gray-400 mb-1">
                                PDF Field Name (auto-mapped)
                              </label>
                              <input
                                type="text"
                                value={field.pdf_field_name}
                                onChange={e => updateField(field.field_key, { pdf_field_name: e.target.value })}
                                className="w-full bg-gray-700 rounded px-3 py-2 text-sm text-green-400"
                              />
                            </div>
                          )}

                          {field.similar_labels.length > 1 && (
                            <div>
                              <label className="block text-sm text-gray-400 mb-1">
                                Similar Labels (de-duplicated)
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {field.similar_labels.map(label => (
                                  <span key={label} className="px-2 py-1 bg-gray-700 rounded text-xs">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="block text-sm text-gray-400 mb-1">
                              <MessageSquare className="w-3 h-3 inline mr-1" />
                              Developer Comment
                            </label>
                            <textarea
                              value={field.developer_comment || ''}
                              onChange={e => updateField(field.field_key, { developer_comment: e.target.value })}
                              placeholder="Add notes about this field..."
                              className="w-full bg-gray-700 rounded px-3 py-2 text-sm h-20"
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() => {
                                setEditedFields(fields => fields.filter(f => f.field_key !== field.field_key));
                              }}
                              className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              Remove Field
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Upload Document</h3>

            <div className="space-y-4">
              {/* PDF Type Selection */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">PDF Type</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setUploadMode('fillable')}
                    className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                      uploadMode === 'fillable'
                        ? 'border-green-500 bg-green-900/20'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <FileCheck className={`w-6 h-6 mx-auto mb-2 ${uploadMode === 'fillable' ? 'text-green-400' : 'text-gray-400'}`} />
                    <p className="text-sm font-medium">Fillable PDF</p>
                    <p className="text-xs text-gray-500 mt-1">Has form fields</p>
                  </button>
                  <button
                    onClick={() => setUploadMode('flat')}
                    className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                      uploadMode === 'flat'
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <FileText className={`w-6 h-6 mx-auto mb-2 ${uploadMode === 'flat' ? 'text-blue-400' : 'text-gray-400'}`} />
                    <p className="text-sm font-medium">Flat PDF</p>
                    <p className="text-xs text-gray-500 mt-1">Image/scanned</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Company</label>
                <select
                  value={selectedCompany}
                  onChange={e => setSelectedCompany(e.target.value)}
                  className="w-full bg-gray-700 rounded px-3 py-2"
                >
                  <option value="">Select company...</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Document Name</label>
                <input
                  type="text"
                  value={newDocName}
                  onChange={e => setNewDocName(e.target.value)}
                  placeholder="e.g., PTO Request Form"
                  className="w-full bg-gray-700 rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">PDF File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowUploadModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadDocument}
                disabled={uploading || extractingFields}
                className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center justify-center gap-2"
              >
                {(uploading || extractingFields) && <Loader2 className="w-4 h-4 animate-spin" />}
                {extractingFields ? 'Extracting Fields...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
