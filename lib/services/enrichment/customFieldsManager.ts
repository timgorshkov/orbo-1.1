/**
 * Custom Fields Manager
 * 
 * Manages custom participant attributes with protection for system fields.
 * Allows org owners to add their own fields without breaking AI enrichment.
 */

// System-reserved field prefixes (cannot be edited by owners)
const RESERVED_PREFIXES = [
  'ai_',           // AI-extracted fields
  'system_',       // System fields
  'enrichment_',   // Enrichment metadata
  '_'              // Internal fields
] as const;

// Specific reserved field names
const RESERVED_FIELDS = new Set([
  // AI-extracted
  'interests_keywords',
  'interests_weights',
  'topics_discussed',
  'city_inferred',
  'city_confidence',
  'behavioral_role',
  'role_confidence',
  'communication_style',
  'recent_asks',
  'recent_questions',
  'reaction_patterns',
  
  // User-editable (protected structure)
  'goals_self',
  'offers',
  'asks',
  'city_confirmed',
  'bio_custom',
  
  // Event behavior
  'event_attendance',
  
  // Meta
  'last_enriched_at',
  'enrichment_version',
  'enrichment_source',
  'ai_analysis_cost',
  'ai_analysis_tokens'
]);

/**
 * Check if a field name is reserved (system field)
 */
export function isReservedField(fieldName: string): boolean {
  // Check specific reserved names
  if (RESERVED_FIELDS.has(fieldName)) {
    return true;
  }
  
  // Check reserved prefixes
  return RESERVED_PREFIXES.some(prefix => fieldName.startsWith(prefix));
}

/**
 * Validate custom field name
 */
export function validateCustomFieldName(fieldName: string): {
  valid: boolean;
  error?: string;
} {
  // Check if reserved
  if (isReservedField(fieldName)) {
    return {
      valid: false,
      error: `Поле "${fieldName}" зарезервировано системой. Используйте другое название.`
    };
  }
  
  // Check length
  if (fieldName.length < 2 || fieldName.length > 50) {
    return {
      valid: false,
      error: 'Название поля должно быть от 2 до 50 символов'
    };
  }
  
  // Check valid characters (alphanumeric, underscore, hyphen)
  if (!/^[a-zA-Z0-9_-]+$/.test(fieldName)) {
    return {
      valid: false,
      error: 'Название поля может содержать только буквы, цифры, _ и -'
    };
  }
  
  return { valid: true };
}

/**
 * Sanitize custom attributes before saving
 * Removes reserved fields from user input
 */
export function sanitizeCustomAttributes(
  attributes: Record<string, any>,
  allowedFields?: string[]
): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(attributes)) {
    // Skip reserved fields (unless explicitly allowed)
    if (isReservedField(key) && !allowedFields?.includes(key)) {
      console.warn(`Attempted to set reserved field: ${key}`);
      continue;
    }
    
    sanitized[key] = value;
  }
  
  return sanitized;
}

/**
 * Merge custom attributes safely
 * System fields are protected, custom fields are merged
 */
export function mergeCustomAttributes(
  current: Record<string, any>,
  updates: Record<string, any>,
  options: {
    allowSystemFields?: boolean; // Allow updates to system fields (for AI enrichment)
    allowedFields?: string[];    // Explicitly allowed fields
  } = {}
): Record<string, any> {
  const merged = { ...current };
  
  for (const [key, value] of Object.entries(updates)) {
    // Check if field is reserved
    const isReserved = isReservedField(key);
    
    // Allow system fields only if explicitly permitted
    if (isReserved && !options.allowSystemFields && !options.allowedFields?.includes(key)) {
      console.warn(`Skipping reserved field in merge: ${key}`);
      continue;
    }
    
    // Merge the value
    merged[key] = value;
  }
  
  return merged;
}

/**
 * Get custom fields schema for UI
 * Returns only non-reserved fields with their types
 */
export function getCustomFieldsSchema(
  attributes: Record<string, any>
): Array<{
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  value: any;
}> {
  const schema: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    value: any;
  }> = [];
  
  for (const [key, value] of Object.entries(attributes)) {
    // Skip reserved fields
    if (isReservedField(key)) {
      continue;
    }
    
    // Determine type
    let type: 'string' | 'number' | 'boolean' | 'array' | 'object' = 'string';
    if (typeof value === 'number') type = 'number';
    else if (typeof value === 'boolean') type = 'boolean';
    else if (Array.isArray(value)) type = 'array';
    else if (typeof value === 'object' && value !== null) type = 'object';
    
    schema.push({ name: key, type, value });
  }
  
  return schema;
}

/**
 * Example usage:
 * 
 * // Owner tries to add custom field
 * const validation = validateCustomFieldName('department');
 * if (!validation.valid) {
 *   throw new Error(validation.error);
 * }
 * 
 * // Owner tries to overwrite AI field (blocked)
 * const userInput = { interests_keywords: ['hacking'], department: 'IT' };
 * const sanitized = sanitizeCustomAttributes(userInput); // { department: 'IT' }
 * 
 * // AI enrichment (allowed)
 * const aiUpdates = { interests_keywords: ['PPC', 'marketing'] };
 * const merged = mergeCustomAttributes(current, aiUpdates, { allowSystemFields: true });
 */

