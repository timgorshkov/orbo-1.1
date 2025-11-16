import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/telegram/telegramService';
import { createClient } from '@supabase/supabase-js';

/**
 * Cron job: Синхронизация прав администраторов из Telegram
 * Запускается каждые 6 часов как страховка (основной способ - webhook)
 * 
 * Vercel Cron: "0 *\/6 * * *" (every 6 hours)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  // Проверка Vercel Cron Secret (или любой другой секрет для защиты endpoint)
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron] Starting admin rights sync...');
  const startTime = Date.now();

  try {
    const adminSupabase = createAdminServer();
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Получаем все организации с Telegram группами
    const { data: orgs, error: orgsError } = await adminSupabase
      .from('organizations')
      .select(`
        id,
        name,
        org_telegram_groups!inner (
          tg_chat_id,
          telegram_groups (
            tg_chat_id,
            title
          )
        )
      `);

    if (orgsError) {
      console.error('[Cron] Error fetching organizations:', orgsError);
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    console.log(`[Cron] Found ${orgs?.length || 0} organizations with Telegram groups`);

    const results = [];
    const telegramService = new TelegramService('main');

    for (const org of orgs || []) {
      console.log(`[Cron] Processing org ${org.id} (${org.name})`);
      
      // Получаем все группы организации
      const { data: groups, error: groupsError } = await adminSupabase
        .from('org_telegram_groups')
        .select(`
          tg_chat_id,
          telegram_groups (
            tg_chat_id,
            title
          )
        `)
        .eq('org_id', org.id);

      if (groupsError) {
        console.error(`[Cron] Error fetching groups for org ${org.id}:`, groupsError);
        continue;
      }

      let updatedGroups = 0;

      for (const groupBinding of groups || []) {
        const chatId = groupBinding.tg_chat_id;
        const groupTitle = (groupBinding.telegram_groups as any)?.title || chatId;

        try {
          console.log(`[Cron] Fetching admins for group ${chatId} (${groupTitle})`);
          
          // Получаем всех администраторов группы из Telegram
          const adminsResponse = await telegramService.getChatAdministrators(Number(chatId));

          if (!adminsResponse.ok) {
            console.warn(`[Cron] Failed to get admins for chat ${chatId}:`, adminsResponse);
            continue;
          }

          const administrators = adminsResponse.result || [];
          console.log(`[Cron] Found ${administrators.length} administrators in group ${chatId}`);

          // Деактивируем все существующие записи для этой группы
          await supabaseService
            .from('telegram_group_admins')
            .update({
              is_admin: false,
              is_owner: false,
              verified_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 1000).toISOString()
            })
            .eq('tg_chat_id', chatId);

          // Сохраняем новых админов
          for (const admin of administrators) {
            const user = admin.user;
            if (!user || !user.id) continue;

            // Пропускаем ботов (кроме нашего бота, если нужно отслеживать его статус отдельно)
            if (user.is_bot && user.id !== Number(process.env.TELEGRAM_BOT_ID)) continue;

            const isOwner = admin.status === 'creator';

            await supabaseService
              .from('telegram_group_admins')
              .upsert({
                tg_chat_id: chatId,
                tg_user_id: user.id,
                is_admin: true,
                is_owner: isOwner,
                verified_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 дней
              }, {
                onConflict: 'tg_chat_id,tg_user_id'
              });
          }

          updatedGroups++;
        } catch (groupError: any) {
          console.error(`[Cron] Error processing group ${chatId}:`, groupError.message);
        }
      }

      // Синхронизируем memberships для организации
      if (updatedGroups > 0) {
        console.log(`[Cron] Syncing memberships for org ${org.id} (updated ${updatedGroups} groups)`);
        
        const { data: syncResult, error: syncError } = await supabaseService.rpc(
          'sync_telegram_admins',
          { p_org_id: org.id }
        );

        if (syncError) {
          console.error(`[Cron] Error syncing memberships for org ${org.id}:`, syncError);
        } else {
          console.log(`[Cron] ✅ Memberships synced for org ${org.id}:`, syncResult);
        }
      }

      results.push({
        org_id: org.id,
        org_name: org.name,
        updated_groups: updatedGroups,
        total_groups: groups?.length || 0
      });
    }

    const duration = Date.now() - startTime;
    console.log(`[Cron] Admin rights sync completed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      organizations_processed: results.length,
      results
    });
  } catch (error: any) {
    console.error('[Cron] Error in admin rights sync:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

