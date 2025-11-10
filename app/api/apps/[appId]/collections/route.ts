import { createClientServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';

// GET /api/apps/[appId]/collections - Get collections for app (PUBLIC)
export async function GET(
  request: NextRequest,
  { params }: { params: { appId: string } }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = params;
  
  try {
    const supabase = await createClientServer();

    // Fetch collections - public read access
    const { data: collections, error: collectionsError } = await supabase
      .from('app_collections')
      .select(`
        id,
        app_id,
        name,
        display_name,
        icon,
        schema,
        permissions,
        workflows,
        views,
        moderation_enabled,
        created_at,
        updated_at
      `)
      .eq('app_id', appId)
      .order('created_at', { ascending: true });

    if (collectionsError) {
      logger.error({ 
        error: collectionsError, 
        appId 
      }, 'Error fetching collections');
      return NextResponse.json(
        { error: 'Failed to fetch collections' },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    logger.info({
      appId,
      count: collections?.length || 0,
      duration
    }, 'Collections fetched successfully');

    return NextResponse.json({ collections: collections || [] });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in GET /api/apps/[appId]/collections');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

