'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getOfficeUser, type OfficeUser } from '@/lib/auth';
import {
  FileText,
  AlertCircle,
  FileCheck,
  Loader2,
  Building2,
  Plus,
  Download,
  Settings,
  Upload,
  Sparkles,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface CompanyOption {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

type Step = 0 | 1 | 2;
type UploadMode = 'json' | 'pdf';

// ─── Main Component ─────────────────────────────────────────────────

export default function ImportWizardPage() {
  const router = useRouter();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const directPdfInputRef = useRef<HTMLInputElement>(null);
  const [currentUser, setCurrentUser] = useState<OfficeUser | null>(null);

  // Upload mode: json or pdf
  const [uploadMode, setUploadMode] = useState<UploadMode>('json');

  // Company selection
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companiesError, setCompaniesError] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  // JSON Package
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonPackage, setJsonPackage] = useState<any>(null);
  const [jsonPreview, setJsonPreview] = useState<{
    subFormCount: number;
    fieldCount: number;
    pageCount: number;
    renderMode: string;
    subForms: Array<{ id: string; name: string; pages: number[]; fieldCount: number }>;
  } | null>(null);

  // PDF direct upload + AI analysis
  const [directPdfFile, setDirectPdfFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');

  // PDF (optional for generated, required for replica/unified)
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [renderMode, setRenderMode] = useState<'generated' | 'replica' | 'unified'>('generated');

  // Import state
  const [importing, setImporting] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>(0);
  const [error, setError] = useState('');

  // Completion state
  const [generatedFormId, setGeneratedFormId] = useState('');
  const [generatedFormName, setGeneratedFormName] = useState('');
  const [generatedPacketId, setGeneratedPacketId] = useState('');
  const [hasTemplate, setHasTemplate] = useState(false);
  const [stats, setStats] = useState({ total_sub_forms: 0, total_fields: 0, positioned_fields: 0, auto_fill_fields: 0 });

  // ─── Init: Auth + Companies ─────────────────────────────────────

  useEffect(() => {
    const user = getOfficeUser();
    setCurrentUser(user);
    if (!user) {
      router.push('/office/login');
      return;
    }

    setCompaniesLoading(true);
    fetch('/api/companies/list', {
      headers: { 'x-office-user-id': user.id },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch companies');
        return res.json();
      })
      .then((data) => {
        const list: CompanyOption[] = data.companies || [];
        setCompanies(list);
        if (user?.company_id) {
          setSelectedCompanyId(user.company_id);
        } else if (list.length > 0) {
          setSelectedCompanyId(list[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch companies:', err);
        setCompaniesError('Failed to load companies. Please refresh the page.');
      })
      .finally(() => setCompaniesLoading(false));
  }, []);

  // ─── File Handlers ──────────────────────────────────────────────

  async function handleJsonFileSelect(file: File | null) {
    setError('');
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setError('Please select a valid JSON file');
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.form_package || !parsed.sub_forms) {
        setError('Invalid JSON package: missing form_package or sub_forms');
        return;
      }

      setJsonFile(file);
      setJsonPackage(parsed);

      const detectedMode = parsed.form_package.render_mode || 'generated';
      setRenderMode(detectedMode);

      const totalFields = parsed.sub_forms.reduce(
        (sum: number, sf: any) => sum + (sf.fields?.length || 0),
        0
      );
      setJsonPreview({
        subFormCount: parsed.sub_forms.length,
        fieldCount: totalFields,
        pageCount: parsed.form_package.total_pages || 0,
        renderMode: detectedMode,
        subForms: parsed.sub_forms.map((sf: any) => ({
          id: sf.id,
          name: sf.name,
          pages: sf.pages || [],
          fieldCount: sf.fields?.length || 0,
        })),
      });
    } catch {
      setError('Failed to parse JSON file. Make sure it is valid JSON.');
    }
  }

  function handlePdfSelect(file: File | null) {
    setError('');
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
    } else if (file) {
      setError('Please select a valid PDF file');
    }
  }

  // ─── PDF Direct Upload → Claude AI Analysis ─────────────────────

  async function handleDirectPdfSelect(file: File | null) {
    setError('');
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Please select a valid PDF file');
      return;
    }
    setDirectPdfFile(file);
    setJsonPackage(null);
    setJsonPreview(null);
  }

  async function analyzeAndConvert() {
    if (!directPdfFile) return;
    setError('');
    setAnalyzing(true);
    setAnalysisProgress('Reading PDF...');

    try {
      // Convert PDF to base64
      const base64 = await fileToBase64(directPdfFile);
      setAnalysisProgress('Claude AI analyzing form fields...');

      // Call new pdf-to-form API
      const res = await fetch('/api/packets/pdf-to-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdf_base64: base64,
          document_name: directPdfFile.name.replace(/\.pdf$/i, ''),
          company: 'Complete Homecare',
        }),
      });

      setAnalysisProgress('Building form package...');

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Analysis failed (${res.status})`);
      }

      const data = await res.json();
      const pkg = data.json_package;

      if (!pkg || !pkg.sub_forms) {
        throw new Error('AI analysis failed. Please try again or use JSON upload.');
      }

      // Set package and keep PDF as template
      setJsonPackage(pkg);
      setPdfFile(directPdfFile);

      const totalFields = pkg.sub_forms.reduce(
        (sum: number, sf: any) => sum + (sf.fields?.length || 0),
        0
      );
      const detectedMode = pkg.form_package?.render_mode || 'generated';
      setRenderMode(detectedMode);

      setJsonPreview({
        subFormCount: pkg.sub_forms.length,
        fieldCount: totalFields,
        pageCount: pkg.form_package?.total_pages || 1,
        renderMode: detectedMode,
        subForms: pkg.sub_forms.map((sf: any) => ({
          id: sf.id,
          name: sf.name,
          pages: sf.pages || [],
          fieldCount: sf.fields?.length || 0,
        })),
      });

      setAnalysisProgress('Done!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze PDF');
      setAnalysisProgress('');
    } finally {
      setAnalyzing(false);
    }
  }

  // Build a basic JSON package from detected fields (fallback)
  function buildPackageFromFields(fields: any[], formName: string, pageCount: number): any {
    const safeId = formName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    return {
      form_package: {
        version: '1.0',
        form_name: formName,
        render_mode: 'generated',
        total_pages: pageCount,
        page_sizes: Object.fromEntries(
          Array.from({ length: pageCount }, (_, i) => [String(i + 1), [612.0, 792.0]])
        ),
        coordinate_system: 'top-left',
      },
      sub_forms: [
        {
          id: safeId,
          name: formName,
          pages: Array.from({ length: pageCount }, (_, i) => i + 1),
          always_show: true,
          fields: fields.map((f: any, idx: number) => ({
            id: `${safeId}__field_${idx + 1}`,
            label: f.label || `Field ${idx + 1}`,
            type: f.type || 'text',
            entity: f.entity || 'employee',
            page: f.page != null ? f.page : 1,
            pos: f.pos || { x: 0, y: 0, w: 0, h: 0 },
            required: f.required || false,
            ...(f.options ? { options: f.options } : {}),
          })),
        },
      ],
    };
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ─── Import Handler ─────────────────────────────────────────────

  async function handleImport() {
    if (!jsonPackage) return;

    if (!selectedCompanyId) {
      setError('Please select a company before importing.');
      return;
    }

    if ((renderMode === 'replica' || renderMode === 'unified') && !pdfFile) {
      setError('This mode requires the original PDF file. Please upload it or switch to Smart Form mode.');
      return;
    }

    setImporting(true);
    setError('');

    try {
      let pdfBase64: string | undefined;
      if (pdfFile) {
        pdfBase64 = await fileToBase64(pdfFile);
      }

      const response = await fetch('/api/packets/import-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json_package: jsonPackage,
          pdf_base64: pdfBase64,
          render_mode: renderMode,
          company_id: selectedCompanyId,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to import package');

      setGeneratedFormId(data.form_id || '');
      setGeneratedFormName(
        jsonPackage.form_package?.form_name ||
          jsonPackage.form_package?.pdf_template?.replace(/\.pdf$/i, '') ||
          'Imported Form'
      );
      setGeneratedPacketId(data.packet_id || '');
      setHasTemplate(!!pdfBase64);
      setStats(data.stats || {});
      setCurrentStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import package');
    } finally {
      setImporting(false);
    }
  }

  // ─── Step Definitions ───────────────────────────────────────────

  const steps = [
    { num: 0, label: 'Upload' },
    { num: 1, label: 'Configure' },
    { num: 2, label: 'Complete' },
  ];

  // ─── Render ─────────────────────────────────────────────────────

  const renderStep = () => {
    switch (currentStep) {
      // ── Step 0: Upload ──────────────────────────────────────────
      case 0:
        return (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Form Package</h2>
              <p className="text-gray-600 mb-6">
                Upload a PDF directly (AI will auto-detect fields) or upload a pre-processed JSON package.
              </p>

              {/* ── Mode Toggle ── */}
              <div className="flex gap-2 mb-8 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => { setUploadMode('pdf'); setError(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                    uploadMode === 'pdf'
                      ? 'bg-white text-teal-700 shadow-sm border border-teal-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Upload PDF (AI Auto-detect)
                </button>
                <button
                  onClick={() => { setUploadMode('json'); setError(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                    uploadMode === 'json'
                      ? 'bg-white text-teal-700 shadow-sm border border-teal-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  Upload JSON Package
                </button>
              </div>

              {/* ── PDF Direct Upload Mode ── */}
              {uploadMode === 'pdf' && (
                <div>
                  <div className="mb-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      PDF File <span className="text-red-400">*</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Claude AI will automatically detect all form fields, labels, checkboxes, and signatures.
                    </p>
                  </div>

                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                      directPdfFile
                        ? 'border-teal-400 bg-teal-50'
                        : 'border-gray-300 hover:border-teal-400'
                    }`}
                    onClick={() => directPdfInputRef.current?.click()}
                  >
                    <input
                      ref={directPdfInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handleDirectPdfSelect(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {directPdfFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileText className="w-6 h-6 text-teal-600" />
                        <div className="text-left">
                          <p className="font-medium text-gray-900">{directPdfFile.name}</p>
                          <p className="text-sm text-gray-500">
                            {(directPdfFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-700">Click to select PDF file</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Any form PDF — Claude AI will extract all fields automatically
                        </p>
                      </>
                    )}
                  </div>

                  {/* Analyze Button */}
                  {directPdfFile && !jsonPackage && (
                    <button
                      onClick={analyzeAndConvert}
                      disabled={analyzing}
                      className="mt-4 w-full bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {analyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {analysisProgress || 'Analyzing...'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Analyze with Claude AI
                        </>
                      )}
                    </button>
                  )}

                  {/* Analysis Result Preview */}
                  {jsonPreview && uploadMode === 'pdf' && (
                    <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        <h3 className="font-semibold text-gray-900">AI Detection Complete!</h3>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-purple-600">{jsonPreview.pageCount}</p>
                          <p className="text-xs text-gray-500">Pages</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-purple-600">{jsonPreview.subFormCount}</p>
                          <p className="text-xs text-gray-500">Sections</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-purple-600">{jsonPreview.fieldCount}</p>
                          <p className="text-xs text-gray-500">Fields</p>
                        </div>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {jsonPreview.subForms.map((sf) => (
                          <div key={sf.id} className="flex items-center justify-between text-sm py-1">
                            <span className="text-gray-800">{sf.name}</span>
                            <span className="text-gray-500">{sf.fieldCount} fields</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── JSON Upload Mode ── */}
              {uploadMode === 'json' && (
                <div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      JSON Package File <span className="text-red-400">*</span>
                    </label>
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-teal-400 transition-colors cursor-pointer"
                      onClick={() => jsonInputRef.current?.click()}
                    >
                      <input
                        ref={jsonInputRef}
                        type="file"
                        accept=".json"
                        onChange={(e) => handleJsonFileSelect(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      {jsonFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <Settings className="w-5 h-5 text-teal-600" />
                          <span className="font-medium text-gray-900">{jsonFile.name}</span>
                          <span className="text-sm text-gray-500">
                            ({(jsonFile.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                      ) : (
                        <>
                          <Settings className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">Click to select JSON package file</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Pre-processed with Claude using the KodaConnect prompt
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* JSON Preview */}
                  {jsonPreview && uploadMode === 'json' && (
                    <div className="mb-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                      <h3 className="font-semibold text-gray-900 mb-2">Package Preview</h3>
                      <div className="grid grid-cols-4 gap-4 mb-3">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-teal-600">{jsonPreview.pageCount}</p>
                          <p className="text-xs text-gray-500">Pages</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-teal-600">{jsonPreview.subFormCount}</p>
                          <p className="text-xs text-gray-500">Sub-forms</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-teal-600">{jsonPreview.fieldCount}</p>
                          <p className="text-xs text-gray-500">Fields</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-teal-600 capitalize">
                            {jsonPreview.renderMode}
                          </p>
                          <p className="text-xs text-gray-500">Mode</p>
                        </div>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {jsonPreview.subForms.map((sf) => (
                          <div key={sf.id} className="flex items-center justify-between text-sm py-1">
                            <span className="text-gray-800">{sf.name}</span>
                            <span className="text-gray-500">
                              p{sf.pages.join(',')} &bull; {sf.fieldCount} fields
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Continue Button */}
              <div className="flex gap-3 mt-8">
                <Link
                  href="/office/packet-manager"
                  className="flex-1 px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors text-center"
                >
                  Cancel
                </Link>
                <button
                  onClick={() => {
                    if (!jsonPackage) {
                      setError(
                        uploadMode === 'pdf'
                          ? 'Please upload a PDF and click "Analyze with Claude AI" first.'
                          : 'Please select a JSON package file first.'
                      );
                      return;
                    }
                    setCurrentStep(1);
                  }}
                  disabled={!jsonPackage || analyzing}
                  className="flex-1 bg-teal-600 text-white px-6 py-2.5 rounded-lg hover:bg-teal-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  Continue
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );

      // ── Step 1: Configure ───────────────────────────────────────
      case 1:
        return (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Configure Import</h2>
              <p className="text-gray-600 mb-6">
                Set up company assignment and rendering options before importing.
              </p>

              {/* Company Selector */}
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  Assign to Company <span className="text-red-400">*</span>
                </label>
                {companiesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading companies...
                  </div>
                ) : companiesError ? (
                  <div className="text-sm text-red-600 py-2">{companiesError}</div>
                ) : companies.length === 0 ? (
                  <div className="text-sm text-gray-500 py-2">
                    No companies found.{' '}
                    <Link href="/office/settings/companies" className="text-teal-600 hover:underline">
                      Add a company first
                    </Link>
                    .
                  </div>
                ) : (
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">Select a company...</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  This form will be available to caregivers in the selected company.
                </p>
              </div>

              {/* Render Mode Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Render Mode
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setRenderMode('generated')}
                    className={`p-4 border-2 rounded-lg text-left transition-colors ${
                      renderMode === 'generated'
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">Smart Form</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Clean mobile-friendly layout. Best for most forms — policies,
                      applications, acknowledgments.
                    </p>
                  </button>
                  <button
                    onClick={() => setRenderMode('replica')}
                    className={`p-4 border-2 rounded-lg text-left transition-colors ${
                      renderMode === 'replica'
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">PDF Replica</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Original PDF as background with inputs overlaid. Only for legally
                      required layouts.
                    </p>
                  </button>
                  <button
                    onClick={() => setRenderMode('unified')}
                    className={`p-4 border-2 rounded-lg text-left transition-colors ${
                      renderMode === 'unified'
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">Unified</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Mixed mode — clean web forms for all screens, combined PDF with
                      government forms filled on original templates.
                    </p>
                  </button>
                </div>
              </div>

              {/* PDF Upload for replica/unified */}
              {(renderMode === 'replica' || renderMode === 'unified') && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Original PDF Template <span className="text-red-400">*</span>
                  </label>
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-teal-400 transition-colors cursor-pointer"
                    onClick={() => pdfInputRef.current?.click()}
                  >
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handlePdfSelect(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {pdfFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileText className="w-5 h-5 text-teal-600" />
                        <span className="font-medium text-gray-900">{pdfFile.name}</span>
                        <span className="text-sm text-gray-500">
                          ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                    ) : (
                      <>
                        <FileText className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">
                          Click to upload the original PDF file
                        </p>
                        <p className="text-xs text-red-400 mt-1">
                          Required for PDF Replica and Unified modes
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {renderMode === 'generated' && (
                <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Smart Form mode:</strong> No PDF upload needed. The system generates
                    a clean mobile form from the JSON package content.
                  </p>
                </div>
              )}

              {renderMode === 'unified' && !pdfFile && (
                <div className="mb-6 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-sm text-purple-800">
                    <strong>Unified mode:</strong> Please upload the original PDF above.
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setCurrentStep(0)}
                  className="flex-1 px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={!jsonPackage || !selectedCompanyId || importing || ((renderMode === 'replica' || renderMode === 'unified') && !pdfFile)}
                  className="flex-1 bg-teal-600 text-white px-6 py-2.5 rounded-lg hover:bg-teal-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      Import Package
                      <Download className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );

      // ── Step 2: Complete ────────────────────────────────────────
      case 2:
        return (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border p-8">
              <div className="text-center mb-8">
                <FileCheck className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900">Form Imported Successfully!</h2>
              </div>

              <div className="space-y-4 mb-8">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="font-medium text-gray-900">{generatedFormName}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {stats.total_sub_forms} sections &bull; {stats.total_fields} fields
                    {stats.auto_fill_fields > 0 && (
                      <span className="text-teal-600">
                        {' '}
                        &bull; {stats.auto_fill_fields} auto-fill links
                      </span>
                    )}
                  </p>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <p className="font-medium mb-1">
                    {renderMode === 'unified' ? 'Unified Mode' : renderMode === 'replica' ? 'PDF Replica Mode' : 'Smart Form Mode'}
                  </p>
                  <p>
                    {renderMode === 'unified'
                      ? `Clean web forms for applicants. PDF output combines generated pages with government forms filled on original templates. ${stats.positioned_fields} fields positioned on replica templates.`
                      : renderMode === 'replica'
                      ? `${stats.positioned_fields} field positions mapped to the original PDF layout.`
                      : 'The applicant will see each form section as a clean mobile-friendly layout with swipeable screens for policy text.'}
                  </p>
                </div>

                {hasTemplate && (renderMode === 'replica' || renderMode === 'unified') && (
                  <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-teal-900">PDF Template Stored</p>
                        <p className="text-sm text-teal-700 mt-1">
                          The original PDF has been stored for field overlay rendering.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {generatedFormId && (
                  <Link
                    href={`/office/form-manager/${generatedFormId}`}
                    className="block w-full bg-teal-600 text-white px-6 py-2.5 rounded-lg hover:bg-teal-700 font-medium transition-colors text-center"
                  >
                    View & Edit Form
                  </Link>
                )}
                <Link
                  href="/office/form-manager"
                  className="block w-full bg-white text-gray-700 px-6 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium transition-colors text-center"
                >
                  Go to Form Manager
                </Link>
                <Link
                  href="/office/packet-manager/import"
                  onClick={() => window.location.reload()}
                  className="block w-full bg-teal-50 text-teal-700 px-6 py-2.5 rounded-lg hover:bg-teal-100 font-medium transition-colors text-center"
                >
                  Import Another
                </Link>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Import Form Package</h1>
          <p className="text-sm text-gray-500 mt-1">
            Step {currentStep + 1} of {steps.length}
          </p>
        </div>
      </header>

      {/* Step indicator */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex gap-2">
            {steps.map((step, idx) => (
              <div key={step.num} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                    step.num === currentStep
                      ? 'bg-teal-600 text-white'
                      : step.num < currentStep
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {step.num < currentStep ? '✓' : idx + 1}
                </div>
                <span className="text-sm font-medium text-gray-700">{step.label}</span>
                {idx < steps.length - 1 && <div className="w-4 h-0.5 bg-gray-300 mx-1" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 max-w-3xl mx-auto p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}
        {renderStep()}
      </div>
    </div>
  );
}
