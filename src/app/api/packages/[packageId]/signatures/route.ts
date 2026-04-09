import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAuthenticatedUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/packages/[packageId]/signatures
 * List all static signatures for a package
 * Returns signatures from form_definitions.metadata.static_signatures
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  try {
    const { packageId } = await params;

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch the form definition associated with this package
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('form_id, metadata')
      .eq('form_id', packageId)
      .single();

    if (formError || !formDef) {
      return NextResponse.json(
        { error: 'Package not found' },
        { status: 404 }
      );
    }

    // Extract static signatures from metadata
    const staticSignatures = formDef.metadata?.static_signatures || [];

    return NextResponse.json({
      signatures: staticSignatures,
    });
  } catch (error) {
    console.error('GET /api/packages/[packageId]/signatures error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/packages/[packageId]/signatures
 * Upload a new signature image
 * Expects multipart/form-data with:
 *  - file: image file (PNG or JPEG only)
 *  - label: signature label (e.g., "Kenia - Supervising RN")
 *  - target_sub_forms: JSON array of {sub_form_id, page, x, y, width, height}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  try {
    const { packageId } = await params;

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      );
    }

    // Authenticate user
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const label = formData.get('label') as string | null;
    const targetSubFormsJson = formData.get('target_sub_forms') as string | null;

    // Validate required fields
    if (!file || !label || !targetSubFormsJson) {
      return NextResponse.json(
        { error: 'file, label, and target_sub_forms are required' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type must be PNG or JPEG' },
        { status: 400 }
      );
    }

    // Validate file size (max 2MB)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2MB.' },
        { status: 400 }
      );
    }

    // Parse and validate target_sub_forms
    let targetSubForms;
    try {
      targetSubForms = JSON.parse(targetSubFormsJson);
      if (!Array.isArray(targetSubForms)) {
        throw new Error('target_sub_forms must be an array');
      }
      // Validate each entry has required fields
      for (const entry of targetSubForms) {
        if (!entry.sub_form_id || entry.page === undefined || entry.x === undefined ||
            entry.y === undefined || entry.width === undefined || entry.height === undefined) {
          throw new Error('Each target_sub_form must have: sub_form_id, page, x, y, width, height');
        }
      }
    } catch (parseError) {
      return NextResponse.json(
        { error: `Invalid target_sub_forms: ${parseError instanceof Error ? parseError.message : 'JSON parse error'}` },
        { status: 400 }
      );
    }

    // Convert file to base64
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const base64Image = fileBuffer.toString('base64');

    // Get image dimensions to validate minimum width
    const dimensions = await getImageDimensions(fileBuffer, file.type);
    if (dimensions && dimensions.width < 200) {
      return NextResponse.json(
        { error: 'Image must be at least 200px wide' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch the current form definition
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('metadata')
      .eq('form_id', packageId)
      .single();

    if (formError || !formDef) {
      return NextResponse.json(
        { error: 'Package not found' },
        { status: 404 }
      );
    }

    // Create new signature entry
    const signatureId = `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newSignature = {
      id: signatureId,
      label,
      image_base64: base64Image,
      target_sub_forms: targetSubForms,
      uploaded_by: user.id,
      created_at: new Date().toISOString(),
    };

    // Update metadata with new signature
    const metadata = formDef.metadata || {};
    const staticSignatures = metadata.static_signatures || [];
    staticSignatures.push(newSignature);

    const { error: updateError } = await supabase
      .from('form_definitions')
      .update({
        metadata: {
          ...metadata,
          static_signatures: staticSignatures,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('form_id', packageId);

    if (updateError) {
      console.error('Error updating form definition:', updateError);
      return NextResponse.json(
        { error: 'Failed to save signature' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        signature: newSignature,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/packages/[packageId]/signatures error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/packages/[packageId]/signatures
 * Remove a signature by id from the static_signatures array
 * Expects JSON body with: { signature_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  try {
    const { packageId } = await params;

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      );
    }

    // Authenticate user
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { signature_id } = body;

    if (!signature_id) {
      return NextResponse.json(
        { error: 'signature_id is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch the form definition
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('metadata')
      .eq('form_id', packageId)
      .single();

    if (formError || !formDef) {
      return NextResponse.json(
        { error: 'Package not found' },
        { status: 404 }
      );
    }

    // Find and remove the signature
    const metadata = formDef.metadata || {};
    const staticSignatures = metadata.static_signatures || [];
    const signatureIndex = staticSignatures.findIndex((sig: any) => sig.id === signature_id);

    if (signatureIndex === -1) {
      return NextResponse.json(
        { error: 'Signature not found' },
        { status: 404 }
      );
    }

    staticSignatures.splice(signatureIndex, 1);

    const { error: updateError } = await supabase
      .from('form_definitions')
      .update({
        metadata: {
          ...metadata,
          static_signatures: staticSignatures,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('form_id', packageId);

    if (updateError) {
      console.error('Error updating form definition:', updateError);
      return NextResponse.json(
        { error: 'Failed to delete signature' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/packages/[packageId]/signatures error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Helper function to get image dimensions without external dependencies
 * Supports PNG and JPEG
 */
async function getImageDimensions(
  buffer: Buffer,
  mimeType: string
): Promise<{ width: number; height: number } | null> {
  try {
    if (mimeType === 'image/png') {
      // PNG: width and height are at bytes 16-24 (after 8-byte signature + IHDR length)
      if (buffer.length < 24) return null;
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      // JPEG: scan for SOF marker (0xFFC0, 0xFFC1, 0xFFC2, 0xFFC9)
      let offset = 2; // Skip SOI marker
      while (offset < buffer.length - 8) {
        if (buffer[offset] === 0xff) {
          const marker = buffer[offset + 1];
          // SOF markers
          if ([0xc0, 0xc1, 0xc2, 0xc9].includes(marker)) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
          const length = buffer.readUInt16BE(offset + 2);
          offset += length + 2;
        } else {
          offset++;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Error getting image dimensions:', error);
    return null;
  }
}
