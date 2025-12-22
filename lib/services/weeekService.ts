/**
 * Weeek CRM Service
 * 
 * Интеграция с CRM Weeek для автоматического создания сделок
 * при регистрации новых пользователей.
 * 
 * API Docs: https://developers.weeek.net/
 */

import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('WeeekService');

// API Configuration
const WEEEK_API_URL = 'https://api.weeek.net/public/v1';

interface WeeekContact {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phones?: string[];
  links?: { type: string; value: string }[];
}

interface WeeekDeal {
  id: string;
  title: string;
  funnelId: string;
  statusId: string;
  contactIds?: string[];
}

interface CreateContactParams {
  email: string;
  firstName?: string;
  lastName?: string;
  telegramUsername?: string;
}

interface CreateDealParams {
  title: string;
  contactId?: string;
  description?: string;
}

interface UpdateDealParams {
  title?: string;
  description?: string;
}

interface UpdateContactParams {
  firstName?: string;
  lastName?: string;
  telegramUsername?: string;
}

interface WeeekApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class WeeekService {
  private apiToken: string;
  private funnelId: string;
  private defaultStatusId: string | null = null;

  constructor() {
    this.apiToken = process.env.WEEEK_API_TOKEN || '';
    this.funnelId = process.env.WEEEK_FUNNEL_ID || '';
    
    if (!this.apiToken) {
      logger.warn({}, 'WEEEK_API_TOKEN not set - CRM integration disabled');
    }
    if (!this.funnelId) {
      logger.warn({}, 'WEEEK_FUNNEL_ID not set - CRM integration disabled');
    }
  }

  /**
   * Check if Weeek integration is configured
   */
  isConfigured(): boolean {
    return !!(this.apiToken && this.funnelId);
  }

  /**
   * Make API request to Weeek
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<WeeekApiResponse<T>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Weeek not configured' };
    }

    try {
      const url = `${WEEEK_API_URL}${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      logger.debug({ method, endpoint }, 'Weeek API request');

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        logger.error({ 
          status: response.status, 
          error: data,
          endpoint 
        }, 'Weeek API error');
        return { 
          success: false, 
          error: data?.message || data?.error || `HTTP ${response.status}` 
        };
      }

      logger.debug({ endpoint, data }, 'Weeek API response');
      return { success: true, data };

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        endpoint 
      }, 'Weeek API exception');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get funnel statuses to find the first stage ID
   */
  async getFirstStageId(): Promise<string | null> {
    if (this.defaultStatusId) {
      return this.defaultStatusId;
    }

    const result = await this.request<{ statuses: Array<{ id: string; order: number }> }>(
      'GET',
      `/crm/funnels/${this.funnelId}/statuses`
    );

    if (result.success && result.data?.statuses?.length) {
      // Sort by order and get the first one
      const sorted = result.data.statuses.sort((a, b) => a.order - b.order);
      this.defaultStatusId = sorted[0].id;
      logger.info({ statusId: this.defaultStatusId }, 'Found first stage ID');
      return this.defaultStatusId;
    }

    logger.error({ funnelId: this.funnelId }, 'Failed to get funnel statuses');
    return null;
  }

  /**
   * Find existing contact by email
   */
  async findContactByEmail(email: string): Promise<string | null> {
    // Weeek API might have search functionality
    // For now, we'll rely on our local mapping table
    const result = await this.request<{ contacts: WeeekContact[] }>(
      'GET',
      `/crm/contacts?email=${encodeURIComponent(email)}`
    );

    if (result.success && result.data?.contacts?.length) {
      return result.data.contacts[0].id;
    }

    return null;
  }

  /**
   * Create a new contact
   */
  async createContact(params: CreateContactParams): Promise<string | null> {
    const contactData: any = {
      email: params.email,
    };

    if (params.firstName) {
      contactData.firstName = params.firstName;
    }
    if (params.lastName) {
      contactData.lastName = params.lastName;
    }
    if (params.telegramUsername) {
      contactData.links = [{
        type: 'telegram',
        value: params.telegramUsername
      }];
    }

    const result = await this.request<{ contact: WeeekContact }>(
      'POST',
      '/crm/contacts',
      contactData
    );

    if (result.success && result.data?.contact?.id) {
      logger.info({ 
        contactId: result.data.contact.id,
        email: params.email 
      }, 'Created Weeek contact');
      return result.data.contact.id;
    }

    return null;
  }

  /**
   * Update existing contact
   */
  async updateContact(contactId: string, params: UpdateContactParams): Promise<boolean> {
    const updateData: any = {};

    if (params.firstName) {
      updateData.firstName = params.firstName;
    }
    if (params.lastName) {
      updateData.lastName = params.lastName;
    }
    if (params.telegramUsername) {
      updateData.links = [{
        type: 'telegram',
        value: params.telegramUsername
      }];
    }

    if (Object.keys(updateData).length === 0) {
      return true; // Nothing to update
    }

    const result = await this.request<{ contact: WeeekContact }>(
      'PATCH',
      `/crm/contacts/${contactId}`,
      updateData
    );

    if (result.success) {
      logger.info({ contactId }, 'Updated Weeek contact');
      return true;
    }

    return false;
  }

  /**
   * Create a new deal
   */
  async createDeal(params: CreateDealParams): Promise<string | null> {
    const statusId = await this.getFirstStageId();
    if (!statusId) {
      logger.error({}, 'Cannot create deal - no status ID');
      return null;
    }

    const dealData: any = {
      title: params.title,
      funnelId: this.funnelId,
      statusId: statusId,
    };

    if (params.contactId) {
      dealData.contactIds = [params.contactId];
    }
    if (params.description) {
      dealData.description = params.description;
    }

    const result = await this.request<{ deal: WeeekDeal }>(
      'POST',
      '/crm/deals',
      dealData
    );

    if (result.success && result.data?.deal?.id) {
      logger.info({ 
        dealId: result.data.deal.id,
        title: params.title 
      }, 'Created Weeek deal');
      return result.data.deal.id;
    }

    return null;
  }

  /**
   * Update existing deal
   */
  async updateDeal(dealId: string, params: UpdateDealParams): Promise<boolean> {
    const updateData: any = {};

    if (params.title) {
      updateData.title = params.title;
    }
    if (params.description) {
      updateData.description = params.description;
    }

    if (Object.keys(updateData).length === 0) {
      return true; // Nothing to update
    }

    const result = await this.request<{ deal: WeeekDeal }>(
      'PATCH',
      `/crm/deals/${dealId}`,
      updateData
    );

    if (result.success) {
      logger.info({ dealId }, 'Updated Weeek deal');
      return true;
    }

    return false;
  }

  /**
   * Link contact to deal
   */
  async linkContactToDeal(dealId: string, contactId: string): Promise<boolean> {
    const result = await this.request<any>(
      'POST',
      `/crm/deals/${dealId}/contacts`,
      { contactId }
    );

    return result.success;
  }
}

// Singleton instance
let weeekServiceInstance: WeeekService | null = null;

export function getWeeekService(): WeeekService {
  if (!weeekServiceInstance) {
    weeekServiceInstance = new WeeekService();
  }
  return weeekServiceInstance;
}

// ==========================================
// High-level integration functions
// ==========================================

import { createClient } from '@supabase/supabase-js';

const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Handle new user registration - create contact and deal
 * Called from auth flows (OAuth, magic link)
 */
export async function onUserRegistration(
  userId: string,
  email: string,
  name?: string | null
): Promise<void> {
  const weeek = getWeeekService();
  
  if (!weeek.isConfigured()) {
    logger.debug({}, 'Weeek not configured, skipping CRM sync');
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    
    // Check if we already have a CRM record for this user
    const { data: existingSync } = await supabase
      .from('crm_sync_log')
      .select('weeek_contact_id, weeek_deal_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingSync?.weeek_deal_id) {
      logger.debug({ userId }, 'User already synced to CRM');
      return;
    }

    // Parse name into first/last
    let firstName: string | undefined;
    let lastName: string | undefined;
    if (name) {
      const parts = name.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(' ') || undefined;
    }

    // Create contact
    const contactId = await weeek.createContact({
      email,
      firstName,
      lastName,
    });

    if (!contactId) {
      logger.error({ userId, email }, 'Failed to create Weeek contact');
      return;
    }

    // Create deal
    const dealTitle = name ? `${name} (${email})` : email;
    const dealId = await weeek.createDeal({
      title: dealTitle,
      contactId,
      description: `Новая регистрация: ${new Date().toLocaleString('ru-RU')}`,
    });

    if (!dealId) {
      logger.error({ userId, email, contactId }, 'Failed to create Weeek deal');
      return;
    }

    // Save mapping to database
    await supabase
      .from('crm_sync_log')
      .upsert({
        user_id: userId,
        weeek_contact_id: contactId,
        weeek_deal_id: dealId,
        synced_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    logger.info({ userId, email, contactId, dealId }, 'User synced to Weeek CRM');

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      userId,
      email 
    }, 'Error syncing user to Weeek CRM');
  }
}

/**
 * Handle organization creation - update deal with org name
 */
export async function onOrganizationCreated(
  userId: string,
  orgId: string,
  orgName: string
): Promise<void> {
  const weeek = getWeeekService();
  
  if (!weeek.isConfigured()) {
    return;
  }

  // Skip if default name
  const defaultNames = ['Моя организация', 'My Organization', 'Новая организация'];
  if (defaultNames.includes(orgName)) {
    logger.debug({ orgName }, 'Skipping CRM update for default org name');
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    
    // Get CRM mapping
    const { data: syncLog } = await supabase
      .from('crm_sync_log')
      .select('weeek_deal_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!syncLog?.weeek_deal_id) {
      logger.debug({ userId }, 'No CRM deal found for user');
      return;
    }

    // Get user email from admin API
    let email = '';
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      email = userData?.user?.email || '';
    } catch {
      // If can't get email, use empty string
    }
    const newTitle = `${orgName} (${email})`;

    await weeek.updateDeal(syncLog.weeek_deal_id, {
      title: newTitle,
      description: `Организация: ${orgName}\nСоздана: ${new Date().toLocaleString('ru-RU')}`,
    });

    // Update sync log
    await supabase
      .from('crm_sync_log')
      .update({
        org_id: orgId,
        org_name: orgName,
        synced_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    logger.info({ userId, orgId, orgName }, 'Updated Weeek deal with org name');

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      userId,
      orgId 
    }, 'Error updating Weeek deal with org');
  }
}

/**
 * Handle Telegram account verification - update contact
 */
export async function onTelegramLinked(
  userId: string,
  telegramUsername: string | null
): Promise<void> {
  const weeek = getWeeekService();
  
  if (!weeek.isConfigured() || !telegramUsername) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    
    // Get CRM mapping
    const { data: syncLog } = await supabase
      .from('crm_sync_log')
      .select('weeek_contact_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!syncLog?.weeek_contact_id) {
      logger.debug({ userId }, 'No CRM contact found for user');
      return;
    }

    // Update contact with Telegram
    await weeek.updateContact(syncLog.weeek_contact_id, {
      telegramUsername: telegramUsername.replace('@', ''),
    });

    // Update sync log
    await supabase
      .from('crm_sync_log')
      .update({
        telegram_username: telegramUsername,
        synced_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    logger.info({ userId, telegramUsername }, 'Updated Weeek contact with Telegram');

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      userId,
      telegramUsername 
    }, 'Error updating Weeek contact with Telegram');
  }
}

export { WeeekService };

