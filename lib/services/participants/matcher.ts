import { createAdminServer } from '@/lib/server/supabaseServer';
import { PostgrestSingleResponse } from '@supabase/supabase-js';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('ParticipantMatcher');

export type MatchIntent = {
  orgId: string;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  tg_user_id?: number | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type MatchCandidate = {
  id: string;
  org_id: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  tg_user_id: number | null;
  source?: string | null;
  status?: string | null;
  merged_into?: string | null;
  match_score: number;
  reasons: string[];
};

function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.substring(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  if (digits.startsWith('7') && digits.length === 11) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

function normalizeEmail(email?: string | null): string | null {
  return email ? email.trim().toLowerCase() : null;
}

function buildFullName(first?: string | null, last?: string | null, fallback?: string | null): string | null {
  const parts = [first, last].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' ').trim();
  }
  return fallback?.trim() || null;
}

export class ParticipantMatcher {
  private getSupabase() {
    return createAdminServer();
  }

  async findMatches(intent: MatchIntent): Promise<MatchCandidate[]> {
    const supabase = this.getSupabase();
    const email = normalizeEmail(intent.email);
    const phone = normalizePhone(intent.phone);
    const username = intent.username?.trim()?.replace(/^@/, '') || null;
    const tgUserId = intent.tg_user_id ?? null;
    const fullName = buildFullName(intent.first_name, intent.last_name, intent.full_name);
    
    logger.debug({ 
      org_id: intent.orgId,
      email,
      phone,
      username,
      tg_user_id: tgUserId,
      full_name: fullName
    }, 'Finding matches');

    const reasonsById = new Map<string, string[]>();
    const scoresById = new Map<string, number>();
    const candidateMap = new Map<string, MatchCandidate>();

    const addReason = (participant: any, reason: string, weight = 50) => {
      const id = participant.id as string;
      const reasons = reasonsById.get(id) ?? [];
      reasons.push(reason);
      reasonsById.set(id, reasons);
      const currentScore = scoresById.get(id) ?? 0;
      scoresById.set(id, currentScore + weight);
      candidateMap.set(id, {
        id,
        org_id: participant.org_id,
        full_name: participant.full_name,
        first_name: participant.first_name,
        last_name: participant.last_name,
        email: participant.email,
        phone: participant.phone,
        username: participant.username,
        tg_user_id: participant.tg_user_id,
        source: participant.source,
        status: participant.status,
        merged_into: participant.merged_into,
        match_score: 0,
        reasons: []
      });
    };

    // Exact contact matches
    if (email || phone || username || tgUserId) {
      const filters: string[] = [];
      if (email) filters.push(`email.eq.${email}`);
      if (phone) filters.push(`phone.eq.${phone}`);
      if (username) filters.push(`username.eq.${username}`);
      if (tgUserId) filters.push(`tg_user_id.eq.${tgUserId}`);

      const query = supabase
        .from('participants')
        .select('id, org_id, full_name, first_name, last_name, email, phone, username, tg_user_id, source, status, merged_into')
        .eq('org_id', intent.orgId)
        .is('merged_into', null); // Исключаем уже объединенных участников

      if (filters.length > 0) {
        query.or(filters.join(','));
      }

      const { data: exactMatches } = (await query) as PostgrestSingleResponse<any[]>;
      logger.debug({ count: exactMatches?.length || 0 }, 'Exact matches found');
      (exactMatches || []).forEach(row => {
        if (email && row.email === email) addReason(row, 'Точный e-mail', 60);
        if (phone && row.phone === phone) addReason(row, 'Точный телефон', 65);
        if (username && row.username === username) addReason(row, 'Совпадает username', 55);
        if (tgUserId && row.tg_user_id === tgUserId) addReason(row, 'Совпадает Telegram ID', 70);
      });
    }

    // Fuzzy name matches (simple ilike for now)
    if (fullName && fullName.length >= 3) {
      const nameTerms = fullName
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map(term => term.replace(/[%_]/g, ''));

      const nameFilters = nameTerms.map(term => `full_name.ilike.%${term}%`);

      const { data: fuzzyMatches } = (await supabase
        .from('participants')
        .select('id, org_id, full_name, first_name, last_name, email, phone, username, tg_user_id, source, status, merged_into')
        .eq('org_id', intent.orgId)
        .is('merged_into', null) // Исключаем уже объединенных участников
        .or(nameFilters.join(','))) as PostgrestSingleResponse<any[]>;

      logger.debug({ count: fuzzyMatches?.length || 0 }, 'Fuzzy matches found');
      (fuzzyMatches || []).forEach(row => {
        addReason(row, 'Похожее имя', 20);
      });
    }

    const results = Array.from(candidateMap.values()).map(candidate => ({
      ...candidate,
      match_score: Math.min(100, scoresById.get(candidate.id) ?? 0),
      reasons: reasonsById.get(candidate.id) ?? []
    }))
      .sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    
    logger.debug({ count: results.length }, 'Total matches returned');
    return results;
  }
}

export const participantMatcher = new ParticipantMatcher();

