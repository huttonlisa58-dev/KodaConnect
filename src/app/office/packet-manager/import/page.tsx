'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ImportPackagePage() {
  const router = useRouter();
  const [step, setStep] = useState<'upload' | 'configure' | 'complete'>('upload');
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [renderMode, setRenderMode] = useState<'generated' | 'replica' | 'unified'>('generated');
  const [company, setCompany] = useState('');
  const [companies, setCompanies] = useState<{id:string;name:string}[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/companies').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setCompanies(d);
      else if (d.companies) setCompanies(d.companies);
    }).catch(() => {});
  }, []);

  const handleJsonDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.json')) setJsonFile(file);
  }, []);

  const handleImport = async () => {
    if (!jsonFile) return;
    setImporting(true);
    setError('');
    try {
      const jsonText = await jsonFile.text();
      const jsonPackage = JSON.parse(jsonText);
      let pdfBase64 = null;
      if (pdfFile) {
        const buf = await pdfFile.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        bytes.forEach(b => binary += String.fromCharCode(b));
        pdfBase64 = btoa(binary);
      }
      const fields = jsonPackage?.sub_forms?.[0]?.fields || [];
      const reconstituted = fields.map((f: any) => ({
        field_id: f.id, label: f.label, type: f.type,
        page: f.page != null ? f.page : 1,
        pos: f.pos,
        required: f.required, entity: f.entity,
        placeholder: f.placeholder, help_text: f.help_text,
        options: f.options, show_if: f.show_if, validation: f.validation,
        semantic_type: f.semantic_type, auto_fill_from: f.auto_fill_from,
        hidden: f.hidden, signer_role: f.signer_role,
      }));
      const res = await fetch('/api/packets/import-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json_package: jsonPackage,
          pdf_base64: pdfBase64,
          render_mode: renderMode,
          company_id: company || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Import failed'); return; }
      setResult(data);
      setStep('complete');
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (step === 'complete' && result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Successful!</h2>
            <p className="text-gray-600 mb-6">Form package has been imported successfully.</p>
            <div className="bg-gray-50 rounded-lg p-4 text-left mb-6 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Form ID</span><span className="font-mono text-xs text-gray-700">{result.form_id}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Render Mode</span><span className="capitalize">{result.render_mode}</span></div>
              {result.stats && <>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Sections</span><span>{result.stats.total_sub_forms}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Fields</span><span>{result.stats.total_fields}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Positioned</span><span>{result.stats.positioned_fields}</span></div>
              </>}
            </div>
            <div className="flex gap-3">
              <Link href={'/office/form-manager/' + result.form_id} className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-center font-medium">View Form</Link>
              <button onClick={() => { setStep('upload'); setJsonFile(null); setPdfFile(null); setResult(null); }} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">Import Another</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-4">
            {(['upload','configure','complete'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ' + (step === s ? 'bg-teal-600 text-white' : step === 'complete' || (step === 'configure' && i === 0) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600')}>
                  {i + 1}
                </div>
                <span className="text-sm font-medium capitalize text-gray-700">{s}</span>
                {i < 2 && <div className="w-8 h-px bg-gray-300" />}
              </div>
            ))}
          </div>
        </div>

        {step === 'upload' && (
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Upload Package</h2>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">JSON Package <span className="text-red-500">*</span></label>
              <div onDrop={handleJsonDrop} onDragOver={e => e.preventDefault()} onClick={() => jsonRef.current?.click()} className={'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ' + (jsonFile ? 'border-teal-400 bg-teal-50' : 'border-gray-300 hover:border-teal-400')}>
                {jsonFile ? <div className="flex items-center justify-center gap-2 text-teal-700"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg><span className="font-medium">{jsonFile.name}</span><span className="text-sm text-gray-500">({(jsonFile.size/1024).toFixed(1)} KB)</span></div> : <div className="text-gray-500"><svg className="w-10 h-10 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><p>Drop JSON file here or click to browse</p></div>}
                <input ref={jsonRef} type="file" accept=".json" className="hidden" onChange={e => setJsonFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <button onClick={() => { if (jsonFile) { setStep('configure'); setError(''); } else setError('Please select a JSON file'); }} className="w-full px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">Continue</button>
          </div>
        )}

        {step === 'configure' && (
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Configure Import</h2>
            <p className="text-gray-600 text-sm">Set up company assignment and rendering options before importing.</p>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}
            {companies.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Company <span className="text-red-500">*</span></label>
                <select value={company} onChange={e => setCompany(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500">
                  <option value="">Select company...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">This form will be available to caregivers in the selected company.</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Render Mode</label>
              <div className="grid grid-cols-3 gap-3">
                {([['generated','Smart Form','Clean mobile-friendly layout. Best for most forms — policies, applications, acknowledgments.'],['replica','PDF Replica','Original PDF as background with inputs overlaid. Only for legally required layouts.'],['unified','Unified','Mixed mode — clean web forms for all screens, combined PDF with government forms filled on original templates.']] as const).map(([mode, title, desc]) => (
                  <div key={mode} onClick={() => setRenderMode(mode)} className={'border-2 rounded-lg p-4 cursor-pointer transition-all ' + (renderMode === mode ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300')}>
                    <div className="font-medium text-gray-900 text-sm mb-1">{title}</div>
                    <div className="text-xs text-gray-500">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
            {(renderMode === 'replica' || renderMode === 'unified') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Original PDF Template <span className="text-red-500">*</span></label>
                <div onClick={() => pdfRef.current?.click()} className={'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ' + (pdfFile ? 'border-teal-400 bg-teal-50' : 'border-gray-300 hover:border-teal-400')}>
                  {pdfFile ? <div className="flex items-center justify-center gap-2 text-teal-700"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg><span className="font-medium">{pdfFile.name}</span><span className="text-sm text-gray-500">({(pdfFile.size/1024).toFixed(1)} MB)</span></div> : <p className="text-gray-500 text-sm">Click to upload PDF template</p>}
                  <input ref={pdfRef} type="file" accept=".pdf" className="hidden" onChange={e => setPdfFile(e.target.files?.[0] || null)} />
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep('upload')} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Back</button>
              <button onClick={handleImport} disabled={importing} className="flex-1 px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {importing ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Importing...</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>Import Package</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
