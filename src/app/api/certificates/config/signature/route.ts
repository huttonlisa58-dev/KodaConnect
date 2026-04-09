import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

/**
 * POST /api/certificates/config/signature
 * Uploads a signature image. Supports per-form via form_id in formData.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const signatureFile = formData.get('signature');
    const formId = formData.get('form_id') as string | null;

    if (!signatureFile || !(signatureFile instanceof File)) {
      return NextResponse.json(
        { error: 'Missing required field: signature (must be a file)' },
        { status: 400 }
      );
    }

    const fileName = signatureFile.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));

    if (!hasValidExtension || !ALLOWED_MIME_TYPES.includes(signatureFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed types: PNG, JPG/JPEG' },
        { status: 400 }
      );
    }

    if (signatureFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of 5MB` },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await signatureFile.arrayBuffer());
    const supabase = createServerSupabaseClient();

    const isJpeg = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');
    const contentType = isJpeg ? 'image/jpeg' : 'image/png';

    // Per-form or global path
    const storagePath = formId
      ? `certificates/config/${formId}/signature.png`
      : 'certificates/config/signature.png';

    const { error: uploadError } = await supabase.storage
      .from('filled-pdfs')
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading signature:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload signature image' },
        { status: 500 }
      );
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('filled-pdfs')
      .createSignedUrl(storagePath, 3600);

    if (signedUrlError) {
      return NextResponse.json(
        { error: 'Uploaded but failed to generate URL' },
        { status: 500 }
      );
    }

    // Update settings.json with signature URL
    const configPath = formId
      ? `certificates/config/${formId}/settings.json`
      : 'certificates/config/settings.json';

    try {
      let existingConfig: Record<string, unknown> = {
        representative_name: '',
        representative_title: '',
      };

      const { data: settingsData } = await supabase.storage
        .from('filled-pdfs')
        .download(configPath);

      if (settingsData) {
        const text = await settingsData.text();
        existingConfig = JSON.parse(text);
      }

      const updatedConfig = {
        ...existingConfig,
        signature_url: signedUrlData.signedUrl,
      };

      await supabase.storage
        .from('filled-pdfs')
        .upload(configPath, new Blob([JSON.stringify(updatedConfig, null, 2)], { type: 'application/json' }), {
          contentType: 'application/json',
          upsert: true,
        });
    } catch (configError) {
      console.error('Warning: Failed to update settings.json:', configError);
    }

    return NextResponse.json(
      { message: 'Signature uploaded successfully', signature_url: signedUrlData.signedUrl },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error processing signature upload:', error);
    return NextResponse.json(
      { error: 'Failed to process signature upload' },
      { status: 500 }
    );
  }
}
