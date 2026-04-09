'use client';

import { useState } from 'react';
import { Shield, CheckCircle2, FileText } from 'lucide-react';

export interface ESignConsentRecord {
  consent_type: 'esignature';
  consented_at: string;
  applicant_name: string;
  applicant_phone: string;
  consent_text: string;
}

const ESIGN_CONSENT_TEXT = `By checking the box below, I consent to the use of electronic signatures in connection with this application and any related documents. I understand and agree that:

1. My electronic signature has the same legal effect as a handwritten signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and the Uniform Electronic Transactions Act (UETA).

2. I consent to conduct this transaction electronically, including signing documents using my electronic signature captured on this device.

3. My electronic signature will be captured along with security metadata including the date, time, device information, and IP address for verification purposes.

4. I may withdraw this consent at any time by contacting the office, but withdrawal will not affect the validity of signatures already provided.

5. I have access to a device capable of displaying and signing electronic documents.`;

export default function ESignatureConsent({
  onConsent,
  applicantName,
  phone,
}: {
  onConsent: (data: ESignConsentRecord) => void;
  applicantName: string;
  phone: string;
}) {
  const [agreed, setAgreed] = useState(false);

  const handleContinue = () => {
    if (!agreed) return;
    onConsent({
      consent_type: 'esignature',
      consented_at: new Date().toISOString(),
      applicant_name: applicantName,
      applicant_phone: phone,
      consent_text: ESIGN_CONSENT_TEXT,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-teal-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            Electronic Signature Consent
          </h1>
          <p className="text-sm text-gray-500">
            Please review and accept before continuing
          </p>
        </div>

        <div className="mb-6 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-teal-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-900">E-SIGN Act & UETA Disclosure</span>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {ESIGN_CONSENT_TEXT}
          </p>
        </div>

        <label className="flex items-start gap-3 mb-6 cursor-pointer group">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
          />
          <span className="text-sm text-gray-700 group-hover:text-gray-900">
            I, <strong>{applicantName}</strong>, have read and agree to the electronic signature terms above.
          </span>
        </label>

        <button
          onClick={handleContinue}
          disabled={!agreed}
          className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          <CheckCircle2 className="w-5 h-5" />
          I Agree — Continue
        </button>

        <p className="mt-4 text-xs text-center text-gray-400">
          Your consent is recorded securely for compliance purposes.
        </p>
      </div>
    </div>
  );
}
