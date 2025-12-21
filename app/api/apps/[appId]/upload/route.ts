import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createStorage, getBucket, getStoragePath } from '@/lib/storage';

const BUCKET_NAME = 'app-files';

// POST /api/apps/[appId]/upload - Upload file (image/video/document)
export async function POST(
  request: NextRequest,
  { params }: { params: { appId: string } }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = params;
  
  try {
    const supabaseAdmin = createAdminServer();

    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Check membership
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('org_id', app.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large (max 10MB)' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'application/pdf'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: images, videos, PDF' },
        { status: 400 }
      );
    }

    // Initialize storage provider (Selectel S3)
    const storage = createStorage();
    const bucket = getBucket(BUCKET_NAME);

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const fileExtension = file.name.split('.').pop();
    const fileName = `${timestamp}-${randomString}.${fileExtension}`;
    const logicalPath = `${app.org_id}/apps/${appId}/${fileName}`;
    const filePath = getStoragePath(BUCKET_NAME, logicalPath);

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to S3 Storage
    const { error: uploadError } = await storage.upload(
      bucket,
      filePath,
      buffer,
      {
        contentType: file.type,
        cacheControl: 'public, max-age=3600',
      }
    );

    if (uploadError) {
      logger.error({ 
        error: uploadError.message, 
        appId, 
        fileName 
      }, 'Error uploading file');
      
      return NextResponse.json(
        { error: 'Failed to upload file: ' + uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const publicUrl = storage.getPublicUrl(bucket, filePath);

    const duration = Date.now() - startTime;
    logger.info({
      appId,
      fileName,
      fileSize: file.size,
      fileType: file.type,
      publicUrl,
      duration
    }, 'File uploaded successfully');

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: filePath,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in POST /api/apps/[appId]/upload');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/apps/[appId]/upload - Delete file
export async function DELETE(
  request: NextRequest,
  { params }: { params: { appId: string } }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = params;
  
  try {
    const supabaseAdmin = createAdminServer();
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json(
        { error: 'path parameter is required' },
        { status: 400 }
      );
    }

    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Check membership
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('org_id', app.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Initialize storage provider
    const storage = createStorage();
    const bucket = getBucket(BUCKET_NAME);

    // Delete file
    const { error: deleteError } = await storage.delete(bucket, filePath);

    if (deleteError) {
      logger.error({ 
        error: deleteError.message, 
        appId, 
        filePath 
      }, 'Error deleting file');
      return NextResponse.json(
        { error: 'Failed to delete file' },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    logger.info({
      appId,
      filePath,
      duration
    }, 'File deleted successfully');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in DELETE /api/apps/[appId]/upload');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
