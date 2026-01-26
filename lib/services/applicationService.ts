/**
 * Application Service
 * 
 * Handles join requests and service applications.
 * Integrates with Telegram API for approving/rejecting join requests.
 */

import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';
import { TelegramService } from './telegramService';

const logger = createServiceLogger('ApplicationService');

export interface JoinRequestData {
  chatId: number;
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  date: number;
  inviteLink?: string;
}

export interface ApplicationResult {
  success: boolean;
  applicationId?: string;
  error?: string;
  autoAction?: 'approved' | 'rejected' | 'pending';
}

/**
 * Process a Telegram join request and create an application
 */
export async function processJoinRequest(
  orgId: string,
  request: JoinRequestData
): Promise<ApplicationResult> {
  const supabase = createAdminServer();
  
  try {
    logger.info({
      org_id: orgId,
      chat_id: request.chatId,
      user_id: request.userId,
      username: request.username
    }, '📋 Processing join request');
    
    // Find pipeline for this group
    const { data: pipeline } = await supabase
      .from('application_pipelines')
      .select('id, name')
      .eq('org_id', orgId)
      .eq('pipeline_type', 'join_request')
      .eq('telegram_group_id', request.chatId)
      .eq('is_active', true)
      .single();
    
    if (!pipeline) {
      logger.debug({
        org_id: orgId,
        chat_id: request.chatId
      }, 'No join_request pipeline found for this group');
      
      // Check for default join_request pipeline
      const { data: defaultPipeline } = await supabase
        .from('application_pipelines')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('pipeline_type', 'join_request')
        .eq('is_default', true)
        .eq('is_active', true)
        .single();
      
      if (!defaultPipeline) {
        logger.debug({ org_id: orgId }, 'No default join_request pipeline found');
        return { success: true, autoAction: 'pending' };
      }
    }
    
    const pipelineId = pipeline?.id;
    
    // Find form for this pipeline
    const { data: form } = await supabase
      .from('application_forms')
      .select('id, settings')
      .eq('pipeline_id', pipelineId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    
    if (!form) {
      logger.debug({
        org_id: orgId,
        pipeline_id: pipelineId
      }, 'No form found for pipeline');
      return { success: true, autoAction: 'pending' };
    }
    
    // Prepare user data
    const tgUserData = {
      user_id: request.userId,
      username: request.username || null,
      first_name: request.firstName || null,
      last_name: request.lastName || null,
      bio: request.bio || null,
      photo_url: null // Will be fetched if needed
    };
    
    // Create application using RPC
    const { data: applicationId, error } = await supabase
      .rpc('create_application', {
        p_org_id: orgId,
        p_form_id: form.id,
        p_tg_user_id: request.userId,
        p_tg_chat_id: request.chatId,
        p_tg_user_data: tgUserData,
        p_form_data: {},
        p_source_code: null,
        p_utm_data: {}
      });
    
    if (error) {
      logger.error({ error, org_id: orgId }, 'Failed to create application');
      return { success: false, error: error.message };
    }
    
    logger.info({
      org_id: orgId,
      application_id: applicationId,
      user_id: request.userId
    }, '✅ Application created from join request');
    
    // Check auto-actions based on settings
    const settings = form.settings || {};
    let autoAction: 'approved' | 'rejected' | 'pending' = 'pending';
    
    // Get the created application to check spam score
    const { data: application } = await supabase
      .from('applications')
      .select('spam_score, spam_reasons')
      .eq('id', applicationId)
      .single();
    
    // Auto-reject if spam score is too high
    if (application && 
        settings.spam_detection?.auto_reject_score && 
        application.spam_score >= settings.spam_detection.auto_reject_score) {
      
      // Find spam stage
      const { data: spamStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .eq('slug', 'spam')
        .single();
      
      if (spamStage) {
        await supabase.rpc('move_application_to_stage', {
          p_application_id: applicationId,
          p_new_stage_id: spamStage.id,
          p_actor_id: null,
          p_notes: `Auto-rejected: spam score ${application.spam_score}`
        });
        
        autoAction = 'rejected';
        
        // Reject in Telegram
        await rejectJoinRequest(request.chatId, request.userId);
        
        logger.info({
          application_id: applicationId,
          spam_score: application.spam_score,
          reasons: application.spam_reasons
        }, '🚫 Auto-rejected as spam');
      }
    }
    
    // Auto-approve if conditions met (only if form is not required)
    if (autoAction === 'pending' && settings.auto_approve?.enabled && !settings.require_form) {
      const conditions = settings.auto_approve.conditions || {};
      let shouldApprove = true;
      
      if (conditions.spam_score_below && application?.spam_score >= conditions.spam_score_below) {
        shouldApprove = false;
      }
      
      if (conditions.has_photo && !tgUserData.photo_url) {
        shouldApprove = false;
      }
      
      if (shouldApprove) {
        // Find approved stage
        const { data: approvedStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', pipelineId)
          .eq('slug', 'approved')
          .single();
        
        if (approvedStage) {
          await supabase.rpc('move_application_to_stage', {
            p_application_id: applicationId,
            p_new_stage_id: approvedStage.id,
            p_actor_id: null,
            p_notes: 'Auto-approved'
          });
          
          autoAction = 'approved';
          
          // Approve in Telegram
          await approveJoinRequest(request.chatId, request.userId);
          
          logger.info({
            application_id: applicationId
          }, '✅ Auto-approved');
        }
      }
    }
    
    return {
      success: true,
      applicationId,
      autoAction
    };
    
  } catch (error) {
    logger.error({ error, org_id: orgId }, 'Error processing join request');
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Approve a join request in Telegram
 */
export async function approveJoinRequest(chatId: number, userId: number): Promise<boolean> {
  try {
    const telegramService = new TelegramService('main');
    const result = await telegramService.approveChatJoinRequest(chatId, userId);
    
    if (result.ok) {
      logger.info({ chat_id: chatId, user_id: userId }, '✅ Join request approved in Telegram');
      return true;
    } else {
      logger.warn({ 
        chat_id: chatId, 
        user_id: userId,
        error: result.description
      }, '⚠️ Failed to approve join request');
      return false;
    }
  } catch (error) {
    logger.error({ error, chat_id: chatId, user_id: userId }, 'Error approving join request');
    return false;
  }
}

/**
 * Reject a join request in Telegram
 */
export async function rejectJoinRequest(chatId: number, userId: number): Promise<boolean> {
  try {
    const telegramService = new TelegramService('main');
    const result = await telegramService.declineChatJoinRequest(chatId, userId);
    
    if (result.ok) {
      logger.info({ chat_id: chatId, user_id: userId }, '❌ Join request rejected in Telegram');
      return true;
    } else {
      logger.warn({ 
        chat_id: chatId, 
        user_id: userId,
        error: result.description
      }, '⚠️ Failed to reject join request');
      return false;
    }
  } catch (error) {
    logger.error({ error, chat_id: chatId, user_id: userId }, 'Error rejecting join request');
    return false;
  }
}

/**
 * Execute auto-actions when application moves to a terminal stage
 */
export async function executeStageAutoActions(
  applicationId: string,
  stageId: string,
  autoActions: Record<string, any>
): Promise<void> {
  const supabase = createAdminServer();
  
  try {
    // Get application data
    const { data: application } = await supabase
      .from('applications')
      .select('tg_user_id, tg_chat_id, participant_id')
      .eq('id', applicationId)
      .single();
    
    if (!application) return;
    
    // Execute Telegram actions
    if (autoActions.approve_telegram && application.tg_chat_id && application.tg_user_id) {
      await approveJoinRequest(application.tg_chat_id, application.tg_user_id);
      
      // Log event
      await supabase.from('application_events').insert({
        application_id: applicationId,
        event_type: 'tg_approved',
        actor_type: 'automation',
        data: { chat_id: application.tg_chat_id }
      });
    }
    
    if (autoActions.reject_telegram && application.tg_chat_id && application.tg_user_id) {
      await rejectJoinRequest(application.tg_chat_id, application.tg_user_id);
      
      await supabase.from('application_events').insert({
        application_id: applicationId,
        event_type: 'tg_rejected',
        actor_type: 'automation',
        data: { chat_id: application.tg_chat_id }
      });
    }
    
    if (autoActions.ban_telegram && application.tg_chat_id && application.tg_user_id) {
      // Ban user (reject + ban)
      await rejectJoinRequest(application.tg_chat_id, application.tg_user_id);
      
      // Note: Actual ban would require banChatMember API call
      // For now just log it
      await supabase.from('application_events').insert({
        application_id: applicationId,
        event_type: 'tg_banned',
        actor_type: 'automation',
        data: { chat_id: application.tg_chat_id }
      });
    }
    
    // Send welcome message
    if (autoActions.send_message_template_id && application.tg_user_id) {
      // TODO: Implement message sending
      logger.info({
        application_id: applicationId,
        template_id: autoActions.send_message_template_id
      }, 'Would send welcome message');
    }
    
    // Notify admins
    if (autoActions.notify_admins) {
      // TODO: Implement admin notifications
      logger.info({
        application_id: applicationId
      }, 'Would notify admins');
    }
    
  } catch (error) {
    logger.error({ error, application_id: applicationId }, 'Error executing auto-actions');
  }
}
