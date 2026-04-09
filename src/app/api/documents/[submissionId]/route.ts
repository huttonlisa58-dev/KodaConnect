import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/[submissionId]
 * List all uploaded documents for a submission.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params;

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('document_uploads')
      .select('*')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    // Generate signed URLs for each document (valid for 1 hour)
    const documentsWithUrls = await Promise.all(
      (data || []).map(async (doc) => {
        const { data: signedUrlData } = await supabase.storage
          .from('applicant-documents')
          .createSignedUrl(doc.file_path, 3600); // 1 hour expiry

        return {
          ...doc,
          signed_url: signedUrlData?.signedUrl || null,
        };
      })
    );

    return NextResponse.json({ documents: documentsWithUrls });
  } catch (error) {
    console.error('GET /api/documents/[submissionId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/documents/[submissionId]
 * Upload a document for a submission.
 * Expects multipart/form-data with:
 *  - file: the uploaded file
 *  - doc_type: document type key (e.g. 'hha_pca_certificate')
 *  - applicant_id: the applicant's UUID
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params;

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const docType = formData.get('doc_type') as string | null;
    const applicantId = formData.get('applicant_id') as string | null;

    if (!file || !docType || !applicantId) {
      return NextResponse.json(
        { error: 'file, doc_type, and applicant_id are required' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Validate MIME type
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif',
      'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
      'application/pdf',
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `File type "${file.type}" is not supported. Please upload an image or PDF.` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Build a unique file path:  {submissionId}/{doc_type}/{timestamp}-{filename}
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${submissionId}/${docType}/${timestamp}-${safeName}`;

    // Ensure the storage bucket exists (auto-create on first upload)
    const BUCKET = 'applicant-documents';
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === BUCKET);
    if (!bucketExists) {
      console.log(`[DocUpload] Creating storage bucket "${BUCKET}"`);
      const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: [
          'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif',
          'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
          'application/pdf',
        ],
      });
      if (createErr) {
        console.error('[DocUpload] Failed to create bucket:', createErr);
      }
    }

    // Upload to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[DocUpload] Storage upload error:', JSON.stringify(uploadError));
      return NextResponse.json(
        { error: `Failed to upload file to storage: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Create database record
    const { data: record, error: dbError } = await supabase
      .from('document_uploads')
      .insert([{
        submission_id: submissionId,
        applicant_id: applicantId,
        doc_type: docType,
        file_path: filePath,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        status: 'uploaded',
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Clean up the uploaded file since DB insert failed
      await supabase.storage.from('applicant-documents').remove([filePath]);
      return NextResponse.json(
        { error: 'Failed to save document record' },
        { status: 500 }
      );
    }

    // Generate a signed URL for immediate display
    const { data: signedUrlData } = await supabase.storage
      .from('applicant-documents')
      .createSignedUrl(filePath, 3600);

    return NextResponse.json(
      {
        document: {
          ...record,
          signed_url: signedUrlData?.signedUrl || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/documents/[submissionId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/documents/[submissionId]
 * Delete a specific document.
 * Expects JSON body with: { document_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params;
    const body = await request.json();
    const { document_id } = body;

    if (!document_id) {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Fetch the document record to get the file path
    const { data: doc, error: fetchError } = await supabase
      .from('document_uploads')
      .select('*')
      .eq('id', document_id)
      .eq('submission_id', submissionId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('applicant-documents')
      .remove([doc.file_path]);

    if (storageError) {
      console.error('Storage delete error:', storageError);
      // Continue to delete the DB record even if storage delete fails
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('document_uploads')
      .delete()
      .eq('id', document_id);

    if (dbError) {
      console.error('Database delete error:', dbError);
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/documents/[submissionId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
