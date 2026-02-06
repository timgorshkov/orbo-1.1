import { NextRequest, NextResponse } from 'next/server'
import { createCronLogger } from '@/lib/logger'

// Force dynamic rendering for cron endpoints
export const dynamic = 'force-dynamic'

// DEPRECATED: This cron endpoint is replaced by the announcements system.
// Group notifications for events are now handled through:
// 1. Auto-created announcements (createEventReminders in announcementService.ts)
// 2. The send-announcements cron job (/api/cron/send-announcements)
//
// This endpoint is kept for backward compatibility but does nothing.
// Personal DM reminders remain in /api/cron/send-event-reminders
export async function GET(request: NextRequest) {
  const logger = createCronLogger('event-notifications');
  
  logger.info({}, '⚠️ [DEPRECATED] event-notifications cron called — now handled by announcements system');
  
  return NextResponse.json({ 
    success: true, 
    deprecated: true,
    message: 'This endpoint is deprecated. Group event notifications are now managed through the announcements system (/api/cron/send-announcements). Personal DM reminders use /api/cron/send-event-reminders.',
    sent: 0
  });
}
