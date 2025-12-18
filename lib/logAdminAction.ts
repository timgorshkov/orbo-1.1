import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServiceLogger } from './logger';

// Re-export descriptions for backwards compatibility in server-side code
export { 
  ActionDescriptions, 
  ResourceDescriptions, 
  getActionDescription, 
  getResourceDescription 
} from './auditActionDescriptions';

// Lazy initialization of Supabase admin client to avoid issues during module loading
let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient | null {
  if (!_supabaseAdmin) {
    // Only create client when actually needed (server-side only)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      const logger = createServiceLogger('logAdminAction');
      logger.error({}, 'Missing Supabase credentials');
      return null;
    }
    
    _supabaseAdmin = createClient(url, key, {
      auth: {
        persistSession: false
      }
    });
  }
  return _supabaseAdmin;
}

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
 */
export async function logAdminAction(options: LogAdminActionOptions): Promise<void> {
  const logger = createServiceLogger('logAdminAction');
  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    if (!supabaseAdmin) {
      logger.error({}, 'Supabase admin client not available');
      return;
    }
    
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
      logger.error({ 
        error: error.message,
        error_code: error.code,
        org_id: orgId,
        user_id: userId,
        action
      }, 'Failed to log admin action');
    }
  } catch (err) {
    // Silent fail - don't throw errors from audit logging
    logger.error({ 
      error: err instanceof Error ? err.message : String(err),
      org_id: options.orgId,
      user_id: options.userId
    }, 'Exception while logging action');
  }
}

/**
 * Common action types (for consistency)
 */
export const AdminActions = {
  // ==========================================
  // PARTICIPANTS
  // ==========================================
  UPDATE_PARTICIPANT: 'update_participant',
  DELETE_PARTICIPANT: 'delete_participant',
  MERGE_PARTICIPANTS: 'merge_participants',
  ENRICH_PARTICIPANT: 'enrich_participant', // AI analysis
  SYNC_PARTICIPANT_PHOTO: 'sync_participant_photo',
  
  // ==========================================
  // EVENTS
  // ==========================================
  CREATE_EVENT: 'create_event',
  UPDATE_EVENT: 'update_event',
  DELETE_EVENT: 'delete_event',
  PUBLISH_EVENT_TG: 'publish_event_tg', // Share to Telegram
  
  // Event registrations
  UPDATE_REGISTRATION: 'update_registration', // Admin edits registration
  CANCEL_REGISTRATION: 'cancel_registration', // Admin cancels registration
  ADD_PARTICIPANT_TO_EVENT: 'add_participant_to_event', // Manual add
  
  // Event payments
  UPDATE_PAYMENT_STATUS: 'update_payment_status',
  
  // ==========================================
  // TELEGRAM GROUPS
  // ==========================================
  ADD_TELEGRAM_GROUP: 'add_telegram_group',
  REMOVE_TELEGRAM_GROUP: 'remove_telegram_group',
  SYNC_TELEGRAM_GROUP: 'sync_telegram_group',
  BOT_STATUS_CHANGED: 'bot_status_changed', // Bot promoted/demoted
  
  // ==========================================
  // IMPORT
  // ==========================================
  IMPORT_TELEGRAM_HISTORY: 'import_telegram_history',
  IMPORT_WHATSAPP_HISTORY: 'import_whatsapp_history',
  
  // ==========================================
  // DIGEST
  // ==========================================
  SEND_TEST_DIGEST: 'send_test_digest',
  UPDATE_DIGEST_SETTINGS: 'update_digest_settings',
  
  // ==========================================
  // ORGANIZATION
  // ==========================================
  UPDATE_ORG_SETTINGS: 'update_org_settings',
  UPDATE_ORG_PROFILE: 'update_org_profile',
  
  // ==========================================
  // ERRORS (Superadmin)
  // ==========================================
  RESOLVE_ERROR: 'resolve_error',
  
  // ==========================================
  // LEGACY (Apps, Payments)
  // ==========================================
  CREATE_APP: 'create_app',
  UPDATE_APP: 'update_app',
  DELETE_APP: 'delete_app',
  MODERATE_ITEM: 'moderate_item',
  CREATE_PAYMENT: 'create_payment',
  UPDATE_PAYMENT: 'update_payment',
  CREATE_SUBSCRIPTION: 'create_subscription',
  UPDATE_SUBSCRIPTION: 'update_subscription',
  CANCEL_SUBSCRIPTION: 'cancel_subscription',
  CREATE_PAYMENT_METHOD: 'create_payment_method',
  UPDATE_PAYMENT_METHOD: 'update_payment_method',
  DELETE_PAYMENT_METHOD: 'delete_payment_method',
} as const;

/**
 * Common resource types (for consistency)
 */
export const ResourceTypes = {
  PARTICIPANT: 'participant',
  EVENT: 'event',
  EVENT_REGISTRATION: 'event_registration',
  EVENT_PAYMENT: 'event_payment',
  TELEGRAM_GROUP: 'telegram_group',
  IMPORT: 'import',
  DIGEST: 'digest',
  ORGANIZATION: 'organization',
  ERROR: 'error',
  APP: 'app',
  APP_ITEM: 'app_item',
  PAYMENT: 'payment',
  SUBSCRIPTION: 'subscription',
  PAYMENT_METHOD: 'payment_method',
} as const;
