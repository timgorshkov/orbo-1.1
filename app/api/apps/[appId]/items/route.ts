import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';

// GET /api/apps/[appId]/items - List items in app
export async function GET(
  request: NextRequest,
  { params }: { params: { appId: string } }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = params;
  const { searchParams } = new URL(request.url);
  
  // Query parameters
  const collectionId = searchParams.get('collectionId');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  
  try {
    // Use admin client for public read access (no auth required)
    const adminSupabase = createAdminServer();

    // Build query - public read access
    let query = adminSupabase
      .from('app_items')
      .select(`
        id,
        collection_id,
        data,
        images,
        files,
        location_lat,
        location_lon,
        location_address,
        status,
        creator_id,
        org_id,
        moderated_by,
        moderated_at,
        moderation_note,
        views_count,
        reactions_count,
        created_at,
        updated_at
      `, { count: 'exact' });

    // Filter by collection if specified
    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    } else {
      // Get all collections for this app
      const { data: collections } = await adminSupabase
        .from('app_collections')
        .select('id')
        .eq('app_id', appId);
      
      if (!collections || collections.length === 0) {
        return NextResponse.json({ items: [], total: 0 });
      }
      
      const collectionIds = collections.map(c => c.id);
      query = query.in('collection_id', collectionIds);
    }

    // ✅ Filter by status - check user permissions
    const supabase = await createClientServer();
    const { data: { user } } = await supabase.auth.getUser();
    
    let isAdmin = false;
    if (user) {
      // Check if user is admin/owner
      const { data: app } = await adminSupabase
        .from('apps')
        .select('org_id')
        .eq('id', appId)
        .single();
      
      if (app) {
        const { data: membership } = await supabase
          .from('memberships')
          .select('role')
          .eq('org_id', app.org_id)
          .eq('user_id', user.id)
          .maybeSingle();
        
        isAdmin = membership && (membership.role === 'owner' || membership.role === 'admin');
      }
    }
    
    // Apply status filter
    if (status) {
      // If admin explicitly requested a specific status, allow it
      if (isAdmin) {
        query = query.eq('status', status);
      } else {
        // Non-admins can only see published/active
        query = query.in('status', ['published', 'active']);
      }
    } else {
      // Default: non-admins see only published/active
      if (!isAdmin) {
        query = query.in('status', ['published', 'active']);
      }
      // Admins see all statuses by default
    }

    // Search in JSONB data (basic)
    if (search) {
      // Note: This is a simple search. For production, consider full-text search
      query = query.or(`data->>title.ilike.%${search}%,data->>description.ilike.%${search}%`);
    }

    // Pagination
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: items, error: itemsError, count } = await query;

    if (itemsError) {
      logger.error({ error: itemsError, appId }, 'Error fetching items');
      return NextResponse.json(
        { error: 'Failed to fetch items' },
        { status: 500 }
      );
    }

    // Fetch participant info for items using admin client (public data for display)
    if (items && items.length > 0) {
      const creatorIds = Array.from(new Set(items.map(item => item.creator_id).filter(Boolean)));
      const orgIds = Array.from(new Set(items.map(item => item.org_id).filter(Boolean)));
      
      if (creatorIds.length > 0 && orgIds.length > 0) {
        try {
          const { data: participants } = await adminSupabase
            .from('participants')
            .select('id, user_id, org_id, full_name, username, photo_url')
            .in('user_id', creatorIds)
            .in('org_id', orgIds);

          if (participants) {
            // Create a composite key map: user_id + org_id -> participant
            const participantMap = new Map(
              participants.map(p => [`${p.user_id}_${p.org_id}`, p])
            );
            
            // Attach participant data to items
            items.forEach((item: any) => {
              if (item.creator_id && item.org_id) {
                const key = `${item.creator_id}_${item.org_id}`;
                item.participant = participantMap.get(key) || null;
              }
            });
          }
        } catch (err) {
          logger.error({ error: err }, 'Error fetching participants (non-critical)');
          // Continue without participant data
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info({
      appId,
      count: items?.length || 0,
      total: count,
      duration
    }, 'Items fetched successfully');

    return NextResponse.json({ 
      items: items || [], 
      total: count || 0,
      limit,
      offset
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in GET /api/apps/[appId]/items');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/apps/[appId]/items - Create new item
export async function POST(
  request: NextRequest,
  { params }: { params: { appId: string } }
) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  const { appId } = params;
  
  try {
    const supabase = await createClientServer();
    const body = await request.json();
    const { 
      collectionId, 
      data, 
      images, 
      files,
      locationLat, 
      locationLon, 
      locationAddress 
    } = body;

    if (!collectionId || !data) {
      return NextResponse.json(
        { error: 'collectionId and data are required' },
        { status: 400 }
      );
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client for reading (after auth check)
    const adminSupabase = createAdminServer();

    // Get app and collection to verify access and get config
    const { data: app, error: appError } = await adminSupabase
      .from('apps')
      .select('id, org_id')
      .eq('id', appId)
      .single();

    if (appError || !app) {
      logger.error({ error: appError, appId }, 'App not found for item creation');
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const { data: collection, error: collectionError } = await adminSupabase
      .from('app_collections')
      .select('id, moderation_enabled, permissions')
      .eq('id', collectionId)
      .eq('app_id', appId)
      .single();

    if (collectionError || !collection) {
      logger.error({ error: collectionError, collectionId, appId }, 'Collection not found');
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    // Check membership
    const { data: membership, error: membershipError } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', app.org_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      logger.error({ error: membershipError, userId: user.id, orgId: app.org_id }, 'Membership check failed');
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Determine initial status based on moderation settings
    const initialStatus = collection.moderation_enabled ? 'pending' : 'published';

    // Create item using admin client (after membership check)
    const { data: item, error: createError } = await adminSupabase
      .from('app_items')
      .insert({
        collection_id: collectionId,
        data: data,
        images: images || [],
        files: files || [],
        location_lat: locationLat || null,
        location_lon: locationLon || null,
        location_address: locationAddress || null,
        status: initialStatus,
        creator_id: user.id,
        org_id: app.org_id
      })
      .select()
      .single();

    if (createError) {
      logger.error({ error: createError, appId, collectionId }, 'Error creating item');
      return NextResponse.json(
        { error: 'Failed to create item' },
        { status: 500 }
      );
    }

    // Log analytics event
    try {
      await adminSupabase.rpc('log_app_event', {
        p_app_id: appId,
        p_event_type: 'item_created',
        p_user_id: user.id,
        p_item_id: item.id,
        p_collection_id: collectionId,
        p_data: { status: initialStatus }
      });
    } catch (err) {
      logger.error({ error: err }, 'Error logging analytics event');
    }

    const duration = Date.now() - startTime;
    logger.info({
      itemId: item.id,
      appId,
      collectionId,
      status: initialStatus,
      duration
    }, 'Item created successfully');

    return NextResponse.json({ item }, { status: 201 });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      appId,
      duration 
    }, 'Error in POST /api/apps/[appId]/items');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

