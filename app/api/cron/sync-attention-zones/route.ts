import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/sync-attention-zones
 * Синхронизирует attention_zone_items с данными о молчунах и неактивных новичках
 * Запускается каждый час
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/cron/sync-attention-zones' });

  // Проверка авторизации
  const authHeader = request.headers.get('Authorization');
  const cronSecret = request.headers.get('x-cron-secret');
  
  const isAuthorized = 
    (authHeader === `Bearer ${CRON_SECRET}`) || 
    (cronSecret === CRON_SECRET);
  
  if (!isAuthorized) {
    logger.warn({}, 'Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  logger.info({}, '🔄 Starting attention zones sync');

  try {
    const adminSupabase = createAdminServer();
    
    // Получаем все организации с подключёнными группами
    const { data: orgsWithGroups, error: orgsError } = await adminSupabase
      .from('org_telegram_groups')
      .select('org_id')
      .not('org_id', 'is', null);
    
    if (orgsError) {
      logger.error({ error: orgsError.message }, 'Error fetching organizations');
      throw orgsError;
    }
    
    // Уникальные org_id
    const orgIds = Array.from(new Set(orgsWithGroups?.map(o => o.org_id) || []));
    logger.info({ org_count: orgIds.length }, 'Found organizations to sync');
    
    let totalChurning = 0;
    let totalNewcomers = 0;
    let totalUpdated = 0;
    
    for (const orgId of orgIds) {
      try {
        // 1. Получаем молчунов (churning participants)
        const { data: churningParticipants, error: churningError } = await adminSupabase
          .rpc('get_churning_participants', {
            p_org_id: orgId,
            p_days_silent: 14
          });
        
        if (churningError) {
          logger.warn({ org_id: orgId, error: churningError.message }, 'Error fetching churning participants');
        }
        
        // 2. Получаем неактивных новичков
        const { data: inactiveNewcomers, error: newcomersError } = await adminSupabase
          .rpc('get_inactive_newcomers', {
            p_org_id: orgId,
            p_days_since_first: 14
          });
        
        if (newcomersError) {
          logger.warn({ org_id: orgId, error: newcomersError.message }, 'Error fetching inactive newcomers');
        }
        
        // 3. Upsert attention zone items для молчунов
        if (churningParticipants && churningParticipants.length > 0) {
          const churningItems = churningParticipants.map((p: any) => ({
            org_id: orgId,
            item_type: 'churning_participant',
            item_id: p.participant_id,
            item_data: {
              full_name: p.full_name,
              username: p.username,
              days_since_activity: p.days_since_activity,
              previous_activity_score: p.previous_activity_score,
            },
          }));
          
          const { error: upsertError } = await adminSupabase
            .from('attention_zone_items')
            .upsert(churningItems, { 
              onConflict: 'org_id,item_type,item_id',
              ignoreDuplicates: false 
            });
          
          if (upsertError) {
            logger.warn({ 
              org_id: orgId, 
              error: upsertError.message 
            }, 'Error upserting churning participants');
          } else {
            totalChurning += churningItems.length;
          }
        }
        
        // 4. Upsert attention zone items для неактивных новичков
        if (inactiveNewcomers && inactiveNewcomers.length > 0) {
          const newcomerItems = inactiveNewcomers.map((p: any) => ({
            org_id: orgId,
            item_type: 'inactive_newcomer',
            item_id: p.participant_id,
            item_data: {
              full_name: p.full_name,
              username: p.username,
              days_since_join: p.days_since_join,
              activity_count: p.activity_count,
            },
          }));
          
          const { error: upsertError } = await adminSupabase
            .from('attention_zone_items')
            .upsert(newcomerItems, { 
              onConflict: 'org_id,item_type,item_id',
              ignoreDuplicates: false 
            });
          
          if (upsertError) {
            logger.warn({ 
              org_id: orgId, 
              error: upsertError.message 
            }, 'Error upserting inactive newcomers');
          } else {
            totalNewcomers += newcomerItems.length;
          }
        }
        
        totalUpdated++;
        
      } catch (orgError: any) {
        logger.error({ 
          org_id: orgId, 
          error: orgError.message 
        }, 'Error processing organization');
      }
    }
    
    // 5. Очистка старых resolved items (старше 7 дней)
    const { error: cleanupError } = await adminSupabase
      .from('attention_zone_items')
      .delete()
      .not('resolved_at', 'is', null)
      .lt('resolved_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
    if (cleanupError) {
      logger.warn({ error: cleanupError.message }, 'Error cleaning up old resolved items');
    }
    
    const duration = Date.now() - startTime;
    
    logger.info({
      orgs_processed: totalUpdated,
      churning_items: totalChurning,
      newcomer_items: totalNewcomers,
      duration_ms: duration,
    }, '✅ Attention zones sync completed');
    
    return NextResponse.json({
      success: true,
      orgs_processed: totalUpdated,
      churning_items: totalChurning,
      newcomer_items: totalNewcomers,
      duration_ms: duration,
    });
    
  } catch (error: any) {
    logger.error({ error: error.message }, '❌ Attention zones sync failed');
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    );
  }
}

// GET для ручного запуска из браузера (только с авторизацией)
export async function GET(request: NextRequest) {
  return POST(request);
}

