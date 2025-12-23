export interface ParticipantTrait {
  id: string;
  participant_id: string;
  trait_key: string;
  trait_value: string;
  value_type: string | null;
  source: string | null;
  confidence: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ParticipantGroupLink {
  tg_chat_id: string;
  title: string | null;
  tg_group_id: string;
  is_active: boolean;
  joined_at: string | null;
  left_at: string | null;
  bot_status: string | null;
}

export interface ParticipantTimelineEvent {
  id: number;
  event_type: string;
  created_at: string;
  tg_chat_id: string | number | null;
  meta: Record<string, any> | null;
}

export interface ParticipantRecord {
  id: string;
  org_id: string;
  tg_user_id: number | null;
  username: string | null;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  bio: string | null;
  created_at: string;
  last_activity_at: string | null;
  activity_score: number | null;
  risk_score: number | null;
  merged_into: string | null;
  traits_cache: Record<string, any> | null;
  custom_attributes?: Record<string, any> | null;
  source?: string | null;
  status?: string | null;
  notes?: string | null;
  // participant_status enum: 'participant' | 'event_attendee' | 'candidate' | 'excluded'
  participant_status?: string | null;
  deleted_at?: string | null;
  // Computed dates based on actual activity (for WhatsApp imports)
  real_join_date?: string | null;
  real_last_activity?: string | null;
}

export interface ParticipantExternalId {
  system_code: string;
  external_id: string;
  label?: string;
  url: string | null;
  data: Record<string, any> | null;
}

export interface ParticipantAuditRecord {
  id: string;
  org_id: string;
  participant_id: string;
  actor_id: string | null;
  actor_type: string;
  source: string;
  action: string;
  field_changes: Record<string, any> | null;
  message: string | null;
  integration_job_id: string | null;
  created_at: string;
}

export interface ParticipantDetailResult {
  participant: ParticipantRecord;
  canonicalParticipantId: string;
  requestedParticipantId: string;
  duplicates: ParticipantRecord[];
  traits: ParticipantTrait[];
  groups: ParticipantGroupLink[];
  events: ParticipantTimelineEvent[];
  externalIds?: ParticipantExternalId[];
  auditLog?: ParticipantAuditRecord[];
}
