import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

// POST /api/apps/upload-logo - Upload app logo
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  
  try {
    const supabaseAdmin = createAdminServer();

    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const appId = formData.get('appId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!appId) {
      return NextResponse.json(
        { error: 'appId is required' },
        { status: 400 }
      );
    }

    // Get app to verify access
    const { data: app, error: appError } = await supabaseAdmin
      .from('apps')
      .select('id, org_id')
      .eq('id', appId)
      .single();

    if (appError || !app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Check admin/owner role
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('org_id', app.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can upload logos' },
        { status: 403 }
      );
    }

    // Validate file size (max 2MB for logos)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large (max 2MB for logos)' },
        { status: 400 }
      );
    }

    // Validate file type (only images)
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const fileExtension = file.name.split('.').pop();
    const fileName = `logo-${timestamp}-${randomString}.${fileExtension}`;
    const filePath = `${app.org_id}/apps/${appId}/logos/${fileName}`;

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('app-files')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '31536000', // Cache for 1 year
        upsert: false
      });

    if (uploadError) {
      logger.error({ 
        error: uploadError, 
        appId, 
        fileName 
      }, 'Error uploading logo');
      
      // Check if bucket exists
      if (uploadError.message?.includes('Bucket not found')) {
        return NextResponse.json(
          { error: 'Storage bucket not configured. Please contact support.' },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to upload logo' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('app-files')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    const duration = Date.now() - startTime;
    logger.info({
      appId,
      fileName,
      fileSize: file.size,
      fileType: file.type,
      publicUrl,
      duration
    }, 'Logo uploaded successfully');

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: filePath
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      duration 
    }, 'Error in POST /api/apps/upload-logo');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

