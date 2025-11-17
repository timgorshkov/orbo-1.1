/**
 * Profile Fields Visibility Rules
 * 
 * Defines which custom_attributes fields are visible to:
 * - Regular participants (viewing others or themselves)
 * - Admins
 */

// System/AI fields (admin-only, never shown to participants)
const AI_SYSTEM_FIELDS = [
  'interests_keywords',
  'city_inferred',
  'city_confidence',
  'behavioral_role',
  'role_confidence',
  'topics_discussed',
  'communication_style',
  'reaction_patterns',
  'ai_analysis_cost',
  'ai_analysis_tokens',
  'last_enriched_at',
  'enrichment_version',
  'enrichment_source',
  'event_attendance', // Event behavior metrics
]

// User-defined fields (visible to all)
const USER_FIELDS = [
  'goals_self',
  'offers',
  'asks',
]

export interface FilteredCustomAttributes {
  userFields: Record<string, any> // Fields visible to participants
  aiSystemFields: Record<string, any> // Fields visible only to admins
  unknownFields: Record<string, any> // Custom fields not in predefined lists
}

/**
 * Filter custom_attributes based on viewer role
 * 
 * @param customAttributes - Raw custom_attributes JSONB object
 * @param isAdmin - Whether the viewer is an admin
 * @returns Filtered attributes based on role
 */
export function filterCustomAttributes(
  customAttributes: Record<string, any> | null | undefined,
  isAdmin: boolean
): FilteredCustomAttributes {
  const attrs = customAttributes || {}
  
  const result: FilteredCustomAttributes = {
    userFields: {},
    aiSystemFields: {},
    unknownFields: {},
  }

  for (const [key, value] of Object.entries(attrs)) {
    if (USER_FIELDS.includes(key)) {
      result.userFields[key] = value
    } else if (AI_SYSTEM_FIELDS.includes(key)) {
      result.aiSystemFields[key] = value
    } else {
      // Unknown custom field - treat as user-defined
      result.unknownFields[key] = value
    }
  }

  return result
}

/**
 * Get visible custom_attributes for a participant based on viewer role
 * 
 * @param customAttributes - Raw custom_attributes JSONB object
 * @param isAdmin - Whether the viewer is an admin
 * @returns Only the fields that should be visible to the viewer
 */
export function getVisibleCustomAttributes(
  customAttributes: Record<string, any> | null | undefined,
  isAdmin: boolean
): Record<string, any> {
  const filtered = filterCustomAttributes(customAttributes, isAdmin)
  
  if (isAdmin) {
    // Admins see everything
    return {
      ...filtered.userFields,
      ...filtered.unknownFields,
      ...filtered.aiSystemFields,
    }
  } else {
    // Participants only see user-defined fields
    return {
      ...filtered.userFields,
      ...filtered.unknownFields,
    }
  }
}

/**
 * Check if a field should be visible to participants
 */
export function isFieldVisibleToParticipants(fieldName: string): boolean {
  return !AI_SYSTEM_FIELDS.includes(fieldName)
}

/**
 * Get human-readable field labels
 */
export const FIELD_LABELS: Record<string, string> = {
  // User fields
  goals_self: 'Цели',
  offers: 'Предлагает',
  asks: 'Ищет',
  
  // AI/System fields (admin-only)
  interests_keywords: 'Интересы (AI)',
  city_inferred: 'Город (AI)',
  behavioral_role: 'Роль в сообществе',
  topics_discussed: 'Обсуждаемые темы',
  communication_style: 'Стиль общения',
  reaction_patterns: 'Паттерны реакций',
  event_attendance: 'Посещаемость событий',
  last_enriched_at: 'Последнее обогащение',
}

