import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCertificatePdf } from '@/lib/certificate-generator';

export const dynamic = 'force-dynamic';

function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * POST /api/certificates
 * Generate a certificate for a submission
 * Body: { submission_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { submission_id } = body;

    if (!submission_id || typeof submission_id !== 'string') {
      return NextResponse.json({ error: 'Invalid request: submission_id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Fetch submission
    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('submission_id', submission_id)
      .single();

    if (submissionError || !submission) {
      console.error('Submission fetch error:', submissionError);
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Fetch form definition separately
    const { data: formDef } = await supabase
      .from('form_definitions')
      .select('form_id, form_name, company_id, metadata')
      .eq('form_id', submission.form_id)
      .single();

    // Fetch applicant details
    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('id, full_name, phone, email')
      .eq('id', submission.applicant_id)
      .single();

    if (applicantError || !applicant) {
      console.error('Applicant fetch error:', applicantError);
      return NextResponse.json({ error: 'Applicant not found' }, { status: 404 });
    }

    // Get company_id from form definition
    const formCompanyId = formDef ? (formDef as any).company_id : null;

    // Extract certificate config from form metadata
    const metadata = formDef?.metadata || {};
    const certificateConfig = (metadata as any).certificate_config || {};

    const courseName = certificateConfig.course_name || (metadata as any).course_name || 'Training Course';
    const courseHours = String(certificateConfig.hours || certificateConfig.course_hours || (metadata as any).course_hours || '0');
    const formId = submission.form_id;

    // Format completion date
    const completionDate = new Date(submission.submitted_at || new Date());
    const formattedDate = completionDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Generate certificate ID
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 9).toUpperCase();
    const certificateId = `CERT-${timestamp}-${randomSuffix}`;

    // Fetch company details
    let companyData: any = null;
    let logoBytes: Uint8Array | undefined;
    if (formCompanyId) {
      const { data: company } = await supabase
        .from('companies')
        .select('id, name, slug, logo_url')
        .eq('id', formCompanyId)
        .single();
      companyData = company;

      // Fetch brand profile logo
      const { data: brandProfile } = await supabase
        .from('brand_profiles')
        .select('logo_url')
        .eq('company_id', formCompanyId)
        .single();

      const logoUrl = brandProfile?.logo_url || company?.logo_url;
      if (logoUrl) {
        try {
          const logoResponse = await fetch(logoUrl);
          if (logoResponse.ok) {
            logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
          }
        } catch (logoError) {
          console.warn('Failed to fetch logo:', logoError);
        }
      }
    }

    // Fetch per-form certificate config (representative name, title, signature)
    let configRepName = certificateConfig.representative_name || '';
    let configRepTitle = certificateConfig.representative_title || '';
    let signatureBytes: Uint8Array | undefined;

    // Try per-form config first, then global
    const configPaths = [
      `certificates/config/${formId}/settings.json`,
      'certificates/config/settings.json',
    ];

    for (const configPath of configPaths) {
      try {
        const { data: configData } = await supabase.storage
          .from('filled-pdfs')
          .download(configPath);

        if (configData) {
          const text = await configData.text();
          const parsed = JSON.parse(text);
          if (parsed.representative_name) configRepName = parsed.representative_name;
          if (parsed.representative_title) configRepTitle = parsed.representative_title;
          break; // Found config, stop looking
        }
      } catch {
        // Try next path
      }
    }

    // Fetch signature — per-form first, then global
    const signaturePaths = [
      `certificates/config/${formId}/signature.png`,
      'certificates/config/signature.png',
    ];

    for (const sigPath of signaturePaths) {
      try {
        const { data: sigData } = await supabase.storage
          .from('filled-pdfs')
          .download(sigPath);

        if (sigData) {
          signatureBytes = new Uint8Array(await sigData.arrayBuffer());
          break;
        }
      } catch {
        // Try next path
      }
    }

    const regulationText = certificateConfig.regulation_text;
    const retentionText = certificateConfig.retention_text;

    // Prepare certificate data
    const certificateData = {
      caregiver_name: applicant.full_name || 'Unknown',
      course_name: courseName,
      course_hours: courseHours,
      completion_date: formattedDate,
      certificate_id: certificateId,
      company_name: companyData?.name || certificateConfig.company_name || 'Complete Homecare GA',
      company_tagline: certificateConfig.company_tagline || 'We deliver Complete Care to you',
      representative_name: configRepName,
      representative_title: configRepTitle,
      logo_image_bytes: logoBytes,
      signature_image_bytes: signatureBytes,
      regulation_text: regulationText,
      retention_text: retentionText,
    };

    // Generate certificate PDF
    const pdfBytes = await generateCertificatePdf(certificateData);

    // Upload PDF to Supabase storage
    const pdfPath = `certificates/${submission_id}/certificate.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('filled-pdfs')
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('PDF upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to store certificate' }, { status: 500 });
    }

    // Create or update certificate record in database
    // First try to delete any existing record for this submission
    await supabase.from('certificates').delete().eq('submission_id', submission_id);

    const { error: insertError } = await supabase.from('certificates').insert({
      certificate_id: certificateId,
      submission_id: submission_id,
      form_id: formId,
      applicant_id: submission.applicant_id,
      issued_at: new Date().toISOString(),
      pdf_url: pdfPath,
      status: 'issued',
    });

    if (insertError) {
      console.error('Certificate record insert error:', insertError);
      // Don't fail — PDF was uploaded
    }

    // Generate signed download URL
    const { data: urlData } = await supabase.storage
      .from('filled-pdfs')
      .createSignedUrl(pdfPath, 3600);

    return NextResponse.json(
      {
        success: true,
        certificate_id: certificateId,
        submission_id: submission_id,
        pdf_url: urlData?.signedUrl || null,
        issued_at: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/certificates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/certificates?submission_id=xxx
 * Check if a certificate exists for a submission
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get('submission_id');

    if (!submissionId) {
      return NextResponse.json({ error: 'Missing required query parameter: submission_id' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: certificate, error: certificateError } = await supabase
      .from('certificates')
      .select('certificate_id, submission_id, form_id, applicant_id, issued_at, pdf_url, status')
      .eq('submission_id', submissionId)
      .single();

    if (certificateError || !certificate) {
      return NextResponse.json({ error: 'Certificate not found for this submission' }, { status: 404 });
    }

    let downloadUrl: string | null = null;
    if (certificate.pdf_url) {
      try {
        const { data: urlData } = await supabase.storage
          .from('filled-pdfs')
          .createSignedUrl(certificate.pdf_url, 3600);
        downloadUrl = urlData?.signedUrl || null;
      } catch {
        console.warn('Failed to generate signed URL');
      }
    }

    return NextResponse.json({
      certificate_id: certificate.certificate_id,
      submission_id: certificate.submission_id,
      form_id: certificate.form_id,
      applicant_id: certificate.applicant_id,
      issued_at: certificate.issued_at,
      status: certificate.status,
      pdf_url: downloadUrl,
    });
  } catch (error) {
    console.error('GET /api/certificates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
