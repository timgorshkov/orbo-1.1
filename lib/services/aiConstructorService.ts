/**
 * AI Constructor Service
 * 
 * Uses ChatGPT to guide users through app creation in natural language
 * Generates structured JSON config for apps/collections/schemas
 * 
 * AUTO-LOGS all API calls to openai_api_logs table
 */

import { createClient } from '@supabase/supabase-js';
import { openai } from './openaiClient';

// Supabase admin client for logging
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

/**
 * Log OpenAI API call to database (for cost tracking)
 */
async function logOpenAICall(params: {
  orgId: string | null;
  userId: string | null;
  requestType: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  metadata?: any;
}): Promise<void> {
  try {
    const costRub = params.costUsd * 95; // Approximate conversion
    
    const { error } = await supabaseAdmin
      .from('openai_api_logs')
      .insert({
        org_id: params.orgId,
        created_by: params.userId,
        request_type: params.requestType,
        model: params.model,
        prompt_tokens: params.promptTokens,
        completion_tokens: params.completionTokens,
        total_tokens: params.totalTokens,
        cost_usd: params.costUsd,
        cost_rub: costRub,
        metadata: params.metadata || {}
      });
    
    if (error) {
      console.error('[AI Constructor] Failed to log API call:', error);
    } else {
      console.log(`[AI Constructor] Logged: ${params.requestType}, ${params.totalTokens} tokens, $${params.costUsd.toFixed(4)}`);
    }
  } catch (logError) {
    console.error('[AI Constructor] Error logging API call:', logError);
  }
}

/**
 * Log AI request to database (for product analytics)
 * Records user messages, AI responses, and generated configs
 */
export async function logAIRequest(params: {
  userId: string;
  orgId: string | null;
  requestType: 'create_app' | 'edit_app' | 'chat_message';
  userMessage: string;
  aiResponse: string;
  generatedConfig?: any;
  wasApplied?: boolean;
  model: string;
  tokensUsed: number;
  costUsd: number;
  appId?: string;
  conversationId?: string;
}): Promise<void> {
  try {
    const costRub = params.costUsd * 95; // Approximate conversion
    
    const { error } = await supabaseAdmin
      .from('ai_requests')
      .insert({
        user_id: params.userId,
        org_id: params.orgId,
        request_type: params.requestType,
        user_message: params.userMessage,
        ai_response: params.aiResponse,
        generated_config: params.generatedConfig || null,
        was_applied: params.wasApplied || false,
        model: params.model,
        tokens_used: params.tokensUsed,
        cost_usd: params.costUsd,
        cost_rub: costRub,
        app_id: params.appId || null,
        conversation_id: params.conversationId || null,
      });
    
    if (error) {
      console.error('[AI Constructor] Failed to log AI request:', error);
    } else {
      console.log(`[AI Constructor] AI request logged: ${params.requestType}`);
    }
  } catch (logError) {
    console.error('[AI Constructor] Error logging AI request:', logError);
  }
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIConstructorResponse {
  message: string;
  appConfig?: any;
  isComplete: boolean;
}

const SYSTEM_PROMPT = `Ты - AI-помощник, который помогает пользователям создавать приложения для их Telegram-сообществ.

**Твоя задача:**
1. Задавать вопросы на русском языке, чтобы понять, что нужно пользователю
2. После 4-5 вопросов сгенерировать JSON-конфигурацию приложения
3. Быть дружелюбным и понятным

**Последовательность вопросов (4-5 вопросов, умный пропуск очевидных):**

**Правило "умного пропуска":**
Если ответ на вопрос очевиден с вероятностью >90%, НЕ задавай вопрос, а сформулируй как утверждение и переходи дальше.

Примеры:
- "Доска объявлений" → очевидно нужна цена → "Добавлю поле цены"
- "Подборка кейсов" → очевидно цена НЕ нужна → "Для кейсов цена не потребуется"
- "Объявления" → очевидно модерация полезна → "Включу модерацию для контроля качества"

**Вопросы:**

1. **Тип контента**: "Что будут публиковать ваши пользователи?"
   - Примеры: объявления, заявки на услуги, события, вакансии, кейсы
   - Уточни, если непонятно

2. **Модерация**: "Нужна ли модерация перед публикацией?"
   - ПРОПУСТИ если очевидно (объявления/события → обычно да, кейсы/статьи → обычно нет)
   - Если спрашиваешь: "Да/нет, объясни зачем это нужно"

3. **Цена**: "Нужно ли поле цены? (обязательное/опциональное/не нужно)"
   - ПРОПУСТИ если очевидно (продажа → да, кейсы/статьи → нет)
   - Для объявлений обычно обязательное или опциональное
   - Для заявок/событий/кейсов - обычно не нужно

4. **Категории**: "Какие категории вам нужны?"
   - Предложи 5-7 релевантных категорий based на типе контента
   - Дай возможность изменить

5. **Адрес или контакты**: "Нужно ли поле адреса или дополнительных контактов?"
   - ПРОПУСТИ если очевидно (услуги/магазины → да, онлайн-кейсы → нет)
   - Например: адрес магазина, email, соцсети
   - Полезно для локальных сообществ и услуг

**После всех вопросов:**
- Сгенерируй JSON конфиг (см. формат ниже)
- Добавь в конец: "GENERATED_CONFIG: <json>"

**Формат JSON конфига:**
\`\`\`json
{
  "app": {
    "name": "Название",
    "description": "Описание",
    "icon": "📦",
    "app_type": "classifieds"
  },
  "collections": [{
    "name": "items",
    "display_name": "Объявления",
    "icon": "📋",
    "schema": {
      "fields": [
        {"name": "title", "type": "string", "label": "Название", "required": true, "max_length": 100},
        {"name": "description", "type": "text", "label": "Описание", "required": true, "max_length": 2000},
        {"name": "category", "type": "select", "label": "Категория", "required": true, "options": [
          {"value": "electronics", "label": "Техника"}
        ]},
        {"name": "price", "type": "number", "label": "Цена", "required": false, "min": 0},
        {"name": "image_url", "type": "url", "label": "Фото", "required": false},
        {"name": "phone", "type": "phone", "label": "Телефон", "required": false}
      ]
    },
    "permissions": {
      "create": ["member"],
      "read": ["member", "guest"],
      "update": ["owner", "admin"],
      "delete": ["owner", "admin"]
    },
    "workflows": {
      "initial_status": "pending",
      "statuses": ["pending", "published", "rejected", "archived"]
    },
    "views": ["grid", "list"],
    "moderation_enabled": false
  }]
}
\`\`\`

**Типы полей:**
- string (короткий текст, max_length)
- text (длинный текст, max_length)
- number (числа, min/max)
- select (выбор из списка, options: [{value, label}])
- date (дата)
- boolean (да/нет)
- url (ссылка на изображение)
- phone (телефон)

**Правила:**
- Всегда добавляй title и description
- category - обычно select с options
- price - только если нужно (type: number)
- location_address - только если нужна геолокация
- **ОБЯЗАТЕЛЬНО добавляй image_url (type: url) для загрузки фото (required: false)**
- **ОБЯЗАТЕЛЬНО добавляй phone (type: phone) для контактов (required: false)**
- **moderation_enabled: false по умолчанию** (включать только если пользователь ЯВНО просит модерацию)
- initial_status: "pending" (с модерацией) или "published" (без модерации)

**Стиль общения:**
- Дружелюбный, как опытный консультант
- Короткие вопросы (2-3 предложения)
- Примеры в помощь
- Emoji для наглядности 📦 🎫 💼

Начни с первого вопроса!`;

/**
 * Chat with AI Constructor
 */
export async function chatWithAIConstructor(
  messages: ChatMessage[],
  userId: string,
  orgId: string | null = null,
  conversationId?: string
): Promise<AIConstructorResponse> {
  try {
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
      ],
      temperature: 0.7, // Creative but not too random
      max_tokens: 1500,
    });
    
    const assistantMessage = response.choices[0].message.content || '';
    
    // Check if config was generated (multiple formats)
    let appConfig = null;
    let cleanMessage = assistantMessage;
    
    // Format 1: GENERATED_CONFIG: {...}
    let configMatch = assistantMessage.match(/GENERATED_CONFIG:\s*(\{[\s\S]*\})/);
    
    // Format 2: ```json {...} ```
    if (!configMatch) {
      configMatch = assistantMessage.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    }
    
    // Format 3: Just {...} after "вот что у нас получилось" or similar
    if (!configMatch && assistantMessage.includes('{') && assistantMessage.includes('}')) {
      const jsonStart = assistantMessage.indexOf('{');
      const jsonEnd = assistantMessage.lastIndexOf('}') + 1;
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const potentialJson = assistantMessage.substring(jsonStart, jsonEnd);
        try {
          appConfig = JSON.parse(potentialJson);
          // Remove the JSON from message
          cleanMessage = assistantMessage.substring(0, jsonStart).trim();
          if (!cleanMessage || cleanMessage.length < 20) {
            cleanMessage = '🎉 Отлично! Я создал конфигурацию вашего приложения. Проверьте и нажмите "Создать приложение"!';
          }
        } catch {
          // Not valid JSON, ignore
        }
      }
    }
    
    if (configMatch && !appConfig) {
      try {
        appConfig = JSON.parse(configMatch[1]);
        // Remove the JSON from message
        cleanMessage = assistantMessage
          .replace(/GENERATED_CONFIG:[\s\S]*$/, '')
          .replace(/```json[\s\S]*?```/, '')
          .trim();
        
        if (!cleanMessage || cleanMessage.length < 20) {
          cleanMessage = '🎉 Отлично! Я создал конфигурацию вашего приложения. Проверьте и нажмите "Создать приложение"!';
        }
      } catch (parseError) {
        console.error('[AI Constructor] Failed to parse generated config:', parseError);
        appConfig = null;
      }
    }
    
    // Calculate cost (gpt-4o-mini: $0.15/1M input, $0.60/1M output)
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || 0;
    const costUsd = (inputTokens * 0.15 / 1_000_000) + (outputTokens * 0.60 / 1_000_000);
    
    console.log(`[AI Constructor] Chat response in ${Date.now() - startTime}ms`);
    console.log(`[AI Constructor] Tokens: ${totalTokens}, Cost: $${costUsd.toFixed(4)}`);
    
    // Log API call (for cost tracking)
    await logOpenAICall({
      orgId,
      userId,
      requestType: 'ai_constructor',
      model: 'gpt-4o-mini',
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens,
      costUsd,
      metadata: {
        message_count: messages.length,
        config_generated: !!appConfig,
        duration_ms: Date.now() - startTime
      }
    });
    
    // Log AI request (for product analytics)
    const userMessage = messages.length > 0 ? messages[messages.length - 1].content : '';
    await logAIRequest({
      userId,
      orgId,
      requestType: appConfig ? 'create_app' : 'chat_message',
      userMessage,
      aiResponse: cleanMessage,
      generatedConfig: appConfig,
      wasApplied: false, // Will be updated when user creates the app
      model: 'gpt-4o-mini',
      tokensUsed: totalTokens,
      costUsd,
      conversationId
    });
    
    return {
      message: cleanMessage,
      appConfig,
      isComplete: !!appConfig
    };
  } catch (error) {
    console.error('[AI Constructor] Error:', error);
    throw new Error(`AI chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate generated app config
 */
export function validateAppConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }
  
  // Validate app
  if (!config.app || typeof config.app !== 'object') {
    errors.push('Missing app object');
  } else {
    if (!config.app.name || typeof config.app.name !== 'string') {
      errors.push('app.name is required (string)');
    }
    if (!config.app.description || typeof config.app.description !== 'string') {
      errors.push('app.description is required (string)');
    }
    if (!config.app.app_type || typeof config.app.app_type !== 'string') {
      errors.push('app.app_type is required (string)');
    }
  }
  
  // Validate collections
  if (!Array.isArray(config.collections) || config.collections.length === 0) {
    errors.push('collections must be a non-empty array');
  } else {
    config.collections.forEach((coll: any, i: number) => {
      if (!coll.name) errors.push(`collections[${i}].name is required`);
      if (!coll.display_name) errors.push(`collections[${i}].display_name is required`);
      if (!coll.schema || !Array.isArray(coll.schema.fields)) {
        errors.push(`collections[${i}].schema.fields must be an array`);
      }
      if (!coll.permissions || typeof coll.permissions !== 'object') {
        errors.push(`collections[${i}].permissions is required`);
      }
      if (!coll.workflows || typeof coll.workflows !== 'object') {
        errors.push(`collections[${i}].workflows is required`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

