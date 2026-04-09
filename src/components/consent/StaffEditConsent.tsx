'use client';

import { useState } from 'react';
import { Edit3, CheckCircle2, Users } from 'lucide-react';

export interface StaffEditConsentRecord {
  consent_type: 'staff_edit';
  consented_at: string;
  applicant_name: string;
  applicant_phone: string;
  consent_text: string;
}

const STAFF_EDIT_CONSENT_TEXT = `By checking the box below, I acknowledge and consent to the following:

1. Office staff may review my submitted application and supporting documents for accuracy and completeness.

2. Office staff may make corrections to my submission, including but not limited to: fixing typographical errors, standardizing formatting, completing fields that were left blank or incomplete, and updating information based on verified records.

3. Any changes made by office staff will be tracked and recorded in an audit trail. The original submission data I provided will be preserved separately and can be referenced at any time.

4. I understand that I may request a copy of both my original submission and any modified version at any time by contacting the office.

5. Material changes to my submission (beyond formatting and corrections) will require my additional consent or notification.`;

export default function StaffEditConsent({
  onConsent,
  applicantName,
  phone,
}: {
  onConsent: (data: StaffEditConsentRecord) => void;
  applicantName: string;
  phone: string;
}) {
  const [agreed, setAgreed] = useState(false);

  const handleContinue = () => {
    if (!agreed) return;
    onConsent({
      consent_type: 'staff_edit',
      consented_at: new Date().toISOString(),
      applicant_name: applicantName,
      applicant_phone: phone,
      consent_text: STAFF_EDIT_CONSENT_TEXT,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-teal-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            Office Staff Review Consent
          </h1>
          <p className="text-sm text-gray-500">
            Your submission may be reviewed for accuracy
          </p>
        </div>

        <div className="mb-6 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <Edit3 className="w-4 h-4 text-teal-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-900">Staff Review & Correction Policy</span>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {STAFF_EDIT_CONSENT_TEXT}
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
            I, <strong>{applicantName}</strong>, understand and consent to office staff reviewing and correcting my submission as described above.
          </span>
        </label>

        <button
          onClick={handleContinue}
          disabled={!agreed}
          className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          <CheckCircle2 className="w-5 h-5" />
          I Agree — Continue to Form
        </button>

        <p className="mt-4 text-xs text-center text-gray-400">
          A record of your consent is stored securely. You can request a copy at any time.
        </p>
      </div>
    </div>
  );
}
