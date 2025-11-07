import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

export interface LogAdminActionOptions {
  // Who
  orgId: string;
  userId: string;
  
  // What
  action: string;
  resourceType: string;
  resourceId?: string;
  
  // Details
  changes?: {
    before?: any;
    after?: any;
  };
  metadata?: Record<string, any>;
  
  // Request context (optional)
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log admin action to database (admin_action_log table)
 * 
 * This function records what admins do in the system for audit purposes.
 * 
 * @example
 * await logAdminAction({
 *   orgId: '123',
 *   userId: '456',
 *   action: 'send_test_digest',
 *   resourceType: 'digest',
 *   metadata: { recipient_count: 1 }
 * });
 * 
 * @example
 * await logAdminAction({
 *   orgId: '123',
 *   userId: '456',
 *   action: 'update_participant',
 *   resourceType: 'participant',
 *   resourceId: '789',
 *   changes: {
 *     before: { tags: ['active'] },
 *     after: { tags: ['active', 'vip'] }
 *   }
 * });
 */
export async function logAdminAction(options: LogAdminActionOptions): Promise<void> {
  try {
    const {
      orgId,
      userId,
      action,
      resourceType,
      resourceId,
      changes,
      metadata,
      requestId,
      ipAddress,
      userAgent
    } = options;

    // Insert log
    const { error } = await supabaseAdmin
      .from('admin_action_log')
      .insert({
        org_id: orgId,
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId || null,
        changes: changes || null,
        metadata: metadata || null,
        request_id: requestId || null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
      });

    if (error) {
      // If logging fails, log to console (fallback)
      console.error('[logAdminAction] Failed to log admin action:', error);
    }
  } catch (err) {
    // Silent fail - don't throw errors from audit logging
    console.error('[logAdminAction] Exception while logging action:', err);
  }
}

/**
 * Common action types (for consistency)
 */
export const AdminActions = {
  // Digest
  SEND_TEST_DIGEST: 'send_test_digest',
  UPDATE_DIGEST_SETTINGS: 'update_digest_settings',
  
  // Participants
  UPDATE_PARTICIPANT: 'update_participant',
  DELETE_PARTICIPANT: 'delete_participant',
  SYNC_PARTICIPANT_PHOTO: 'sync_participant_photo',
  
  // Events
  CREATE_EVENT: 'create_event',
  UPDATE_EVENT: 'update_event',
  DELETE_EVENT: 'delete_event',
  PUBLISH_EVENT: 'publish_event',
  
  // Telegram
  SYNC_TELEGRAM_GROUP: 'sync_telegram_group',
  UPDATE_TELEGRAM_SETTINGS: 'update_telegram_settings',
  SET_WEBHOOK: 'set_webhook',
  
  // Organization
  UPDATE_ORG_SETTINGS: 'update_org_settings',
  UPDATE_ORG_PROFILE: 'update_org_profile',
  
  // Import
  IMPORT_MESSAGES: 'import_messages',
  
  // Errors
  RESOLVE_ERROR: 'resolve_error',
} as const;

/**
 * Common resource types (for consistency)
 */
export const ResourceTypes = {
  DIGEST: 'digest',
  PARTICIPANT: 'participant',
  EVENT: 'event',
  TELEGRAM_GROUP: 'telegram_group',
  ORGANIZATION: 'organization',
  ERROR: 'error',
  WEBHOOK: 'webhook',
} as const;

