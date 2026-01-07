import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

/**
 * GET /api/apps/catalog - Получить список приложений в публичном каталоге
 * 
 * Query params:
 * - category: фильтр по категории ('engagement', 'moderation', 'analytics', 'ai', 'other')
 * - search: поиск по названию и описанию
 * - featured: только featured приложения (true/false)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const logger = createAPILogger(request);
  
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const featured = searchParams.get('featured');
    
    const adminSupabase = createAdminServer();
    
    let query = adminSupabase
      .from('public_apps')
      .select(`
        id,
        name,
        slug,
        short_description,
        icon_url,
        category,
        tags,
        featured,
        partner_name,
        bot_username,
        miniapp_url
      `)
      .eq('status', 'active')
      .order('featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    
    // Фильтр по категории
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    
    // Только featured
    if (featured === 'true') {
      query = query.eq('featured', true);
    }
    
    // Поиск по тексту
    if (search && search.trim()) {
      query = query.or(`name.ilike.%${search}%,short_description.ilike.%${search}%`);
    }
    
    const { data: apps, error } = await query;
    
    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch catalog apps');
      return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
    }
    
    const duration = Date.now() - startTime;
    logger.info({ 
      count: apps?.length || 0, 
      category, 
      search: !!search,
      duration 
    }, 'Catalog apps fetched');
    
    return NextResponse.json({ 
      apps: apps || [],
      count: apps?.length || 0 
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message, 
      duration 
    }, 'Error in GET /api/apps/catalog');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

