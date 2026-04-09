export const dynamic = 'force-dynamic';
export const maxDuration = 300; // FIX: Increased from 60s to 300s to handle larger submission counts

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sanitizePostgrestInput } from '@/lib/supabase-utils';
import JSZip from 'jszip';
import { getAuthenticatedUser } from '@/lib/api-auth';

/**
 * POST /api/submissions/bulk-download
 * Generate a ZIP of filled PDFs for matching submissions.
 *
 * Body: { formId?, companyId?, status?, date_from?, date_to?, chw_name?, submission_ids? }
 *
 * If submission_ids provided, uses those directly.
 * Otherwise filters by the other params.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { formId, companyId, status, date_from, date_to, chw_name, search, submission_ids } = body;

    // Require authentication for bulk downloads
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();

    // If companyId is provided, get all form_ids for that company first
    let companyFormIds: string[] | null = null;
    if (companyId) {
      const { data: companyForms } = await supabase
        .from('form_definitions')
        .select('form_id')
        .eq('company_id', companyId);
      companyFormIds = companyForms?.map(f => f.form_id) || [];

      if (companyFormIds.length === 0) {
        return NextResponse.json(
          { error: 'No forms found for this company' },
          { status: 404 }
        );
      }
    }

    // Build query to fetch submissions
    let query = supabase
      .from('form_submissions')
      .select(`
        submission_id, form_id, form_data, applicant_id, chw_name, participant_name, participant_id,
        submitted_at, status, signature_metadata,
        applicants:applicant_id(full_name),
        form_definitions:form_id(form_name)
      `)
      .order('submitted_at', { ascending: false });

    // Filter by specific submission IDs if provided
    if (submission_ids && submission_ids.length > 0) {
      query = query.in('submission_id', submission_ids);
    } else {
      // Apply filters
      if (companyFormIds !== null) {
        query = query.in('form_id', companyFormIds);
      }
      if (formId) query = query.eq('form_id', formId);
      if (status && status !== 'all') query = query.eq('status', status);
      if (chw_name) query = query.ilike('chw_name', `%${chw_name}%`);
      if (date_from) query = query.gte('submitted_at', `${date_from}T00:00:00.000Z`);
      if (date_to) query = query.lte('submitted_at', `${date_to}T23:59:59.999Z`);

      // General text search — search applicants separately then combine
      // (PostgREST doesn't support .or() on joined/embedded columns)
      if (search) {
        const s = sanitizePostgrestInput(search);
        const { data: matchingApplicants } = await supabase
          .from('applicants')
          .select('id')
          .or(`full_name.ilike.%${s}%,phone.ilike.%${s}%`);
        const matchingIds = (matchingApplicants || []).map((a: any) => a.id);

        if (matchingIds.length > 0) {
          query = query.or(
            `applicant_id.in.(${matchingIds.join(',')}),chw_name.ilike.%${s}%,participant_name.ilike.%${s}%`
          );
        } else {
          query = query.or(
            `chw_name.ilike.%${s}%,participant_name.ilike.%${s}%`
          );
        }
      }
    }

    // FIX: Raised from 100 to 1000 to allow downloading all submissions
    // Supabase default max is 1000 rows per query — this covers most realistic use cases
    query = query.limit(1000);

    const { data: submissions, error } = await query;

    if (error) {
      console.error('Error fetching submissions for bulk download:', error);
      return NextResponse.json(
        { error: 'Failed to fetch submissions', details: error.message },
        { status: 500 }
      );
    }

    if (!submissions || submissions.length === 0) {
      return NextResponse.json(
        { error: 'No submissions found matching the criteria' },
        { status: 404 }
      );
    }

    console.log(`Bulk download: found ${submissions.length} submissions to process`);

    // Determine the base URL for internal API calls
    // Use the request's origin (most reliable), fall back to env vars
    const origin = request.nextUrl.origin;
    const baseUrl = origin && origin !== 'null'
      ? origin
      : process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    console.log(`Bulk download: using baseUrl = ${baseUrl}`);

    // Generate PDFs and add to ZIP
    // FIX: Process in parallel batches of 5 to speed up generation
    // (sequential processing of 200+ PDFs would exceed the timeout)
    const zip = new JSZip();
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const usedFileNames = new Set<string>();

    const BATCH_SIZE = 5; // Process 5 PDFs concurrently

    for (let i = 0; i < submissions.length; i += BATCH_SIZE) {
      const batch = submissions.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (sub) => {
          // Cast joined relations to access nested fields
          const applicant = sub.applicants as unknown as { full_name: string } | null;
          const formDef = sub.form_definitions as unknown as { form_name: string } | null;

          const applicantName = applicant?.full_name || sub.participant_name || sub.chw_name || 'Unknown';

          // Call the generate-pdf endpoint
          const pdfUrl = `${baseUrl}/api/forms/${sub.form_id}/generate-pdf`;

          const pdfResponse = await fetch(pdfUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              submission_data: sub.form_data,
              applicant_name: applicantName,
              signature_metadata: sub.signature_metadata,
            }),
          });

          if (!pdfResponse.ok) {
            const errText = await pdfResponse.text().catch(() => 'no response body');
            throw new Error(`PDF generation failed for ${sub.submission_id} (${pdfResponse.status}): ${errText.substring(0, 200)}`);
          }

          const contentType = pdfResponse.headers.get('content-type') || '';
          if (!contentType.includes('pdf')) {
            throw new Error(`Unexpected content-type for ${sub.submission_id}: ${contentType}`);
          }

          const pdfBuffer = await pdfResponse.arrayBuffer();

          if (pdfBuffer.byteLength < 100) {
            throw new Error(`PDF too small for ${sub.submission_id}: ${pdfBuffer.byteLength} bytes`);
          }

          return {
            sub,
            applicant,
            formDef,
            pdfBuffer,
          };
        })
      );

      // Process results from this batch
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { sub, applicant, formDef, pdfBuffer } = result.value;

          // Build filename: [participantId_]participant_formname_date.pdf
          const participantId = ((sub as any).participant_id || '')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 20);
          const participantName = (sub.participant_name || applicant?.full_name || 'Unknown')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 30);
          const formName = (formDef?.form_name || 'Form')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 30);
          const dateStr = sub.submitted_at
            ? new Date(sub.submitted_at).toISOString().split('T')[0]
            : 'undated';
          const namePrefix = participantId ? `${participantId}_${participantName}` : participantName;

          // Ensure unique filename — append _2, _3, etc. for duplicates
          let fileName = `${namePrefix}_${formName}_${dateStr}.pdf`;
          if (usedFileNames.has(fileName)) {
            let counter = 2;
            while (usedFileNames.has(`${namePrefix}_${formName}_${dateStr}_${counter}.pdf`)) {
              counter++;
            }
            fileName = `${namePrefix}_${formName}_${dateStr}_${counter}.pdf`;
          }
          usedFileNames.add(fileName);

          zip.file(fileName, pdfBuffer);
          successCount++;
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error(errMsg);
          errors.push(errMsg);
          errorCount++;
        }
      }

      console.log(`Bulk download progress: batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(submissions.length / BATCH_SIZE)}, ${successCount} success so far`);
    }

    console.log(`Bulk download results: ${successCount} success, ${errorCount} errors`);

    if (successCount === 0) {
      return NextResponse.json(
        {
          error: 'Failed to generate any PDFs',
          details: errors.slice(0, 5).join('; '),
          totalSubmissions: submissions.length,
        },
        { status: 500 }
      );
    }

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const zipFileName = `submissions_${new Date().toISOString().split('T')[0]}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFileName}"`,
        'Content-Length': String(zipBuffer.length),
        'X-Success-Count': String(successCount),
        'X-Error-Count': String(errorCount),
        'X-Total-Submissions': String(submissions.length),
      },
    });
  } catch (error) {
    console.error('POST /api/submissions/bulk-download error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
