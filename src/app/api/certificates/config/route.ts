import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

interface CertificateConfig {
  representative_name: string;
  representative_title: string;
  signature_url?: string;
  form_id?: string;
}

/**
 * GET /api/certificates/config?form_id=xxx
 * Returns the certificate configuration for a specific form, or the global config if no form_id
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get('form_id');
    const supabase = createServerSupabaseClient();

    // Determine storage path — per-form or global
    const configPath = formId
      ? `certificates/config/${formId}/settings.json`
      : 'certificates/config/settings.json';

    let config: Partial<CertificateConfig> = {
      representative_name: '',
      representative_title: '',
    };

    // Try per-form config first
    const { data: settingsData, error: settingsError } = await supabase.storage
      .from('filled-pdfs')
      .download(configPath);

    if (settingsData && !settingsError) {
      try {
        const text = await settingsData.text();
        config = JSON.parse(text);
      } catch (parseError) {
        console.error('Failed to parse settings.json:', parseError);
      }
    } else if (formId) {
      // Fall back to global config if per-form doesn't exist
      const { data: globalData } = await supabase.storage
        .from('filled-pdfs')
        .download('certificates/config/settings.json');

      if (globalData) {
        try {
          const text = await globalData.text();
          config = JSON.parse(text);
        } catch (parseError) {
          console.error('Failed to parse global settings.json:', parseError);
        }
      }
    }

    // Check for signature — per-form first, then global
    const signaturePaths = formId
      ? [`certificates/config/${formId}/signature.png`, 'certificates/config/signature.png']
      : ['certificates/config/signature.png'];

    for (const sigPath of signaturePaths) {
      try {
        const { data: signatureUrl } = await supabase.storage
          .from('filled-pdfs')
          .createSignedUrl(sigPath, 3600);

        if (signatureUrl) {
          config.signature_url = signatureUrl.signedUrl;
          break;
        }
      } catch {
        // Try next path
      }
    }

    return NextResponse.json(config, { status: 200 });
  } catch (error) {
    console.error('Error fetching certificate config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch certificate configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/certificates/config
 * Updates certificate signer configuration
 * Body: { representative_name, representative_title, form_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { representative_name, representative_title, form_id } = body;

    if (!representative_name || !representative_title) {
      return NextResponse.json(
        { error: 'Missing required fields: representative_name and representative_title' },
        { status: 400 }
      );
    }

    const trimmedName = representative_name.trim();
    const trimmedTitle = representative_title.trim();

    if (!trimmedName || !trimmedTitle) {
      return NextResponse.json(
        { error: 'Fields cannot be empty or whitespace-only' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const configPath = form_id
      ? `certificates/config/${form_id}/settings.json`
      : 'certificates/config/settings.json';

    // Fetch existing config to preserve signature_url
    let existingConfig: Partial<CertificateConfig> = {};
    try {
      const { data: settingsData } = await supabase.storage
        .from('filled-pdfs')
        .download(configPath);

      if (settingsData) {
        const text = await settingsData.text();
        existingConfig = JSON.parse(text);
      }
    } catch {
      console.log('No existing config found, creating new one');
    }

    const newConfig: CertificateConfig = {
      representative_name: trimmedName,
      representative_title: trimmedTitle,
      signature_url: existingConfig.signature_url,
      form_id: form_id || undefined,
    };

    const configJson = JSON.stringify(newConfig, null, 2);
    const { error: uploadError } = await supabase.storage
      .from('filled-pdfs')
      .upload(configPath, new Blob([configJson], { type: 'application/json' }), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading settings:', uploadError);
      return NextResponse.json(
        { error: 'Failed to save certificate configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json(newConfig, { status: 200 });
  } catch (error) {
    console.error('Error updating certificate config:', error);
    return NextResponse.json(
      { error: 'Failed to update certificate configuration' },
      { status: 500 }
    );
  }
}
