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

// Helper to format date in Moscow timezone
const formatMoscowDate = () => new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

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
  amount?: number;
  // Note: description doesn't work via Weeek API PUT/PATCH
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
  private defaultStatusId: string | null = null;
  private configWarningLogged = false;

  /**
   * Get API token (read fresh from env each time)
   */
  private get apiToken(): string {
    return process.env.WEEEK_API_TOKEN || '';
  }

  /**
   * Get funnel ID (read fresh from env each time)
   */
  private get funnelId(): string {
    return process.env.WEEEK_FUNNEL_ID || '';
  }

  /**
   * Check if Weeek integration is configured
   */
  isConfigured(): boolean {
    const configured = !!(this.apiToken && this.funnelId);
    
    // Log warning once per service instance
    if (!configured && !this.configWarningLogged) {
      if (!this.apiToken) {
        logger.warn({}, 'WEEEK_API_TOKEN not set - CRM integration disabled');
      }
      if (!this.funnelId) {
        logger.warn({}, 'WEEEK_FUNNEL_ID not set - CRM integration disabled');
      }
      this.configWarningLogged = true;
    }
    
    return configured;
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

      logger.debug({ method, endpoint, body }, 'Weeek API request');

      const response = await fetch(url, options);
      const contentType = response.headers.get('content-type') || '';
      
      // Check if response is JSON
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        logger.error({ 
          status: response.status, 
          contentType,
          responsePreview: text.substring(0, 200),
          endpoint,
          url
        }, 'Weeek API returned non-JSON response');
        return { 
          success: false, 
          error: `Non-JSON response (${response.status}): ${contentType}` 
        };
      }

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
      logger.debug({ statusId: this.defaultStatusId }, 'Found first stage ID');
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
    // firstName is required by Weeek API
    // Use email prefix as default name if not provided
    const defaultName = params.email.split('@')[0] || 'User';
    
    const contactData: any = {
      email: params.email,
      firstName: params.firstName || defaultName,
    };

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
      logger.debug({ 
        contactId: result.data.contact.id,
        email: params.email 
      }, 'Created Weeek contact');
      return result.data.contact.id;
    }

    return null;
  }

  /**
   * Update existing contact
   * API: PUT /crm/contacts/{id}
   * @see https://developers.weeek.net/api/contacts#update-a-contact
   * 
   * Note: Using middleName for Telegram username since links doesn't work
   */
  async updateContact(contactId: string, params: UpdateContactParams, existingFirstName?: string): Promise<boolean> {
    const updateData: any = {
      // firstName is required by Weeek API even for updates
      firstName: params.firstName || existingFirstName || 'User',
    };

    if (params.lastName) {
      updateData.lastName = params.lastName;
    }
    // Store telegram username in middleName since links API doesn't work
    if (params.telegramUsername) {
      updateData.middleName = `@${params.telegramUsername.replace('@', '')}`;
    }

    const result = await this.request<{ contact: WeeekContact }>(
      'PUT',
      `/crm/contacts/${contactId}`,
      updateData
    );

    if (result.success) {
      logger.debug({ contactId, telegramUsername: params.telegramUsername }, 'Updated Weeek contact');
      return true;
    }

    return false;
  }

  /**
   * Create a new deal
   * API: POST /crm/statuses/{statusId}/deals
   * @see https://developers.weeek.net/api/deals#create-a-deal
   */
  async createDeal(params: CreateDealParams): Promise<string | null> {
    const statusId = await this.getFirstStageId();
    if (!statusId) {
      logger.error({}, 'Cannot create deal - no status ID');
      return null;
    }

    const dealData: any = {
      title: params.title,
    };

    // contacts is an array of contact IDs
    if (params.contactId) {
      dealData.contacts = [params.contactId];
    }
    if (params.description) {
      dealData.description = params.description;
    }

    // Correct endpoint: /crm/statuses/{statusId}/deals
    const result = await this.request<{ deal: WeeekDeal }>(
      'POST',
      `/crm/statuses/${statusId}/deals`,
      dealData
    );

    if (result.success && result.data?.deal?.id) {
      logger.debug({ 
        dealId: result.data.deal.id,
        title: params.title 
      }, 'Created Weeek deal');
      return result.data.deal.id;
    }

    return null;
  }

  /**
   * Update existing deal
   * API: PUT /crm/deals/{id}
   * @see https://developers.weeek.net/api/deals#update-a-deal
   * 
   * Note: PUT only supports title, amount, winStatus, customFields
   * Description updates via PATCH don't seem to work, so we store
   * qualification data in title or would need custom fields
   */
  async updateDeal(dealId: string, params: UpdateDealParams): Promise<boolean> {
    const updateData: any = {};

    if (params.title) {
      updateData.title = params.title;
    }
    // Note: description doesn't work via API, storing in title suffix for now
    // customFields would need manual setup in Weeek CRM first
    if (params.amount !== undefined) {
      updateData.amount = params.amount;
    }

    if (Object.keys(updateData).length === 0) {
      return true; // Nothing to update
    }

    logger.debug({ dealId, updateData }, 'Updating Weeek deal via PUT');

    const result = await this.request<{ success: boolean }>(
      'PUT',
      `/crm/deals/${dealId}`,
      updateData
    );

    if (result.success) {
      logger.debug({ dealId, title: params.title?.substring(0, 50) }, 'Updated Weeek deal');
      return true;
    }

    logger.error({ dealId, error: result.error }, 'Failed to update Weeek deal');
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

/**
 * Get Weeek service instance
 * Creates new instance each time to ensure fresh env vars are read
 */
export function getWeeekService(): WeeekService {
  return new WeeekService();
}

// ==========================================
// High-level integration functions
// ==========================================

import { createAdminServer } from '@/lib/server/supabaseServer';

const getSupabaseAdmin = () => createAdminServer();

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
      description: `Новая регистрация: ${formatMoscowDate()}`,
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
 * Handle organization creation - update deal title with org name
 * 
 * Note: Weeek API doesn't support description updates via PUT/PATCH,
 * so we only update the title.
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
    
    // Get CRM mapping with qualification data
    const { data: syncLog } = await supabase
      .from('crm_sync_log')
      .select('weeek_deal_id, qualification_responses')
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
    
    // Build title with qualification data if exists
    const responses = syncLog.qualification_responses as Record<string, any> | null;
    const roleShort = responses?.role ? getRoleShort(responses.role) : '';
    const typeShort = responses?.community_type ? getTypeShort(responses.community_type) : '';
    
    // Format: "OrgName (email) | Role | Type"
    let newTitle = `${orgName} (${email})`;
    if (roleShort) newTitle += ` | ${roleShort}`;
    if (typeShort) newTitle += ` | ${typeShort}`;

    await weeek.updateDeal(syncLog.weeek_deal_id, { title: newTitle });

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

    // Get user email for firstName fallback
    let firstName = 'User';
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const email = userData?.user?.email || '';
      const name = userData?.user?.user_metadata?.full_name;
      firstName = name?.split(' ')[0] || email.split('@')[0] || 'User';
    } catch {
      // Use default
    }

    // Update contact with Telegram (include firstName as it's required)
    await weeek.updateContact(syncLog.weeek_contact_id, {
      telegramUsername: telegramUsername.replace('@', ''),
    }, firstName);

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

/**
 * Handle qualification step update
 * Called when user completes qualification steps
 * 
 * Note: Weeek API doesn't support description updates via PUT/PATCH,
 * so we only save to crm_sync_log for now. Custom fields would work
 * but require manual setup in Weeek CRM first.
 */
export async function onQualificationUpdated(
  userId: string,
  email: string,
  responses: Record<string, any>,
  isComplete: boolean
): Promise<void> {
  const weeek = getWeeekService();
  
  if (!weeek.isConfigured()) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    
    // Check if we have a CRM record for this user
    const { data: syncLog } = await supabase
      .from('crm_sync_log')
      .select('weeek_contact_id, weeek_deal_id')
      .eq('user_id', userId)
      .maybeSingle();

    let contactId = syncLog?.weeek_contact_id;
    let dealId = syncLog?.weeek_deal_id;

    // If no deal exists, create contact and deal first
    if (!dealId) {
      logger.debug({ userId, email }, 'No CRM deal found, creating during qualification');
      
      // Create contact
      contactId = await weeek.createContact({ email });
      if (!contactId) {
        logger.error({ userId, email }, 'Failed to create Weeek contact during qualification');
        return;
      }

      // Create deal with qualification info in title
      const roleShort = responses.role ? getRoleShort(responses.role) : '';
      const typeShort = responses.community_type ? getTypeShort(responses.community_type) : '';
      const dealTitle = `${email}${roleShort ? ` | ${roleShort}` : ''}${typeShort ? ` | ${typeShort}` : ''}`;
      
      dealId = await weeek.createDeal({
        title: dealTitle,
        contactId,
        description: `Регистрация: ${formatMoscowDate()}`,
      });

      if (!dealId) {
        logger.error({ userId, email }, 'Failed to create Weeek deal during qualification');
        return;
      }

      // Save mapping
      await supabase
        .from('crm_sync_log')
        .upsert({
          user_id: userId,
          weeek_contact_id: contactId,
          weeek_deal_id: dealId,
          qualification_responses: responses,
          synced_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });
        
      logger.debug({ userId, dealId, isComplete }, 'Created Weeek deal with qualification in title');
      return;
    }

    // Update sync log with qualification data (Weeek description doesn't work via API)
    await supabase
      .from('crm_sync_log')
      .update({
        qualification_responses: responses,
        synced_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    logger.debug({ userId, dealId, isComplete }, 'Saved qualification data to sync log');

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      userId 
    }, 'Error updating qualification data');
  }
}

// Short labels for title
function getRoleShort(role: string): string {
  const labels: Record<string, string> = {
    owner: 'Владелец', admin: 'Админ', project_manager: 'PM',
    event_organizer: 'Орг. событий', hr: 'HR', other: 'Другое',
  };
  return labels[role] || role;
}

function getTypeShort(type: string): string {
  const labels: Record<string, string> = {
    professional: 'Проф', hobby: 'Хобби', education: 'Обучение',
    client_chats: 'Клиенты', business_club: 'Бизнес', internal: 'Внутр', other: 'Другое',
  };
  return labels[type] || type;
}

/**
 * Ensure user has CRM record (create if not exists)
 * Call this on first authenticated page load
 */
export async function ensureCrmRecord(
  userId: string,
  email: string,
  name?: string | null
): Promise<void> {
  const weeek = getWeeekService();
  
  if (!weeek.isConfigured()) {
    logger.debug({ userId }, 'Weeek not configured, skipping CRM sync');
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    
    // Check if we already have a CRM record for this user
    const { data: existingSync } = await supabase
      .from('crm_sync_log')
      .select('weeek_deal_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingSync?.weeek_deal_id) {
      logger.debug({ userId }, 'User already has CRM record');
      return;
    }

    logger.debug({ userId, email }, 'Creating CRM record for user');

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
      description: `Регистрация: ${formatMoscowDate()}`,
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
    }, 'Error ensuring CRM record');
  }
}

export { WeeekService };

