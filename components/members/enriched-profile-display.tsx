'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ParticipantRecord } from '@/lib/types/participant';

interface EnrichedProfileDisplayProps {
  participant: ParticipantRecord;
  isAdmin: boolean;
  onEdit?: () => void;
}

/**
 * Component to display participant enrichment data from custom_attributes
 * 
 * Displays 3 sections:
 * 1. AI Insights (read-only) - auto-extracted data
 * 2. Goals & Offers (editable) - user-defined data
 * 3. Activity Patterns (read-only) - behavioral data
 * 
 * Hides technical fields (weights, meta, timestamps)
 */
export function EnrichedProfileDisplay({ 
  participant, 
  isAdmin,
  onEdit 
}: EnrichedProfileDisplayProps) {
  const attrs = participant.custom_attributes || {};
  
  // Extract sections
  const aiInsights = {
    interests: attrs.interests_keywords || [],
    city: attrs.city_inferred,
    cityConfidence: attrs.city_confidence,
    role: attrs.behavioral_role,
    roleConfidence: attrs.role_confidence,
    topicsDiscussed: attrs.topics_discussed || {},
    communicationStyle: attrs.communication_style || {}
  };
  
  const userDefined = {
    goals: attrs.goals_self,
    offers: attrs.offers || [],
    asks: attrs.asks || [],
    cityConfirmed: attrs.city_confirmed,
    bioCustom: attrs.bio_custom
  };
  
  const eventBehavior = attrs.event_attendance || {};
  
  // Helper: Format confidence as percentage
  const formatConfidence = (conf?: number) => {
    if (!conf) return '';
    return `${Math.round(conf * 100)}%`;
  };
  
  // Helper: Get role label in Russian
  const getRoleLabel = (role?: string) => {
    const labels: Record<string, string> = {
      helper: 'Помощник',
      bridge: 'Связующий',
      observer: 'Наблюдатель',
      broadcaster: 'Вещатель'
    };
    return role ? labels[role] || role : null;
  };
  
  // Helper: Get confidence color
  const getConfidenceColor = (conf?: number) => {
    if (!conf) return 'secondary';
    if (conf >= 0.8) return 'default';
    if (conf >= 0.6) return 'secondary';
    return 'outline';
  };

  return (
    <div className="space-y-6">
      {/* ========================================
          SECTION 1: AI INSIGHTS (Read-only)
          ======================================== */}
      {(aiInsights.interests.length > 0 || aiInsights.city || aiInsights.role) && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">AI Insights</h3>
            <Badge variant="secondary" className="text-xs">
              Автоматически
            </Badge>
          </div>
          
          {/* Interests */}
          {aiInsights.interests.length > 0 && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Интересы
              </label>
              <div className="flex flex-wrap gap-2">
                {aiInsights.interests.map((interest: string) => (
                  <Badge key={interest} variant="outline">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* City */}
          {aiInsights.city && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Город (определён)
              </label>
              <div className="flex items-center gap-2">
                <Badge variant={getConfidenceColor(aiInsights.cityConfidence)}>
                  {aiInsights.city}
                </Badge>
                {aiInsights.cityConfidence && (
                  <span className="text-xs text-gray-500">
                    Уверенность: {formatConfidence(aiInsights.cityConfidence)}
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Behavioral Role */}
          {aiInsights.role && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Роль в сообществе
              </label>
              <div className="flex items-center gap-2">
                <Badge variant="default">
                  {getRoleLabel(aiInsights.role)}
                </Badge>
                {aiInsights.roleConfidence && (
                  <span className="text-xs text-gray-500">
                    {formatConfidence(aiInsights.roleConfidence)}
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Communication Style */}
          {Object.keys(aiInsights.communicationStyle).length > 0 && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Стиль общения
              </label>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {aiInsights.communicationStyle.asks_questions !== undefined && (
                  <div>
                    <span className="text-gray-600">Задаёт вопросы:</span>
                    <span className="font-medium ml-2">
                      {Math.round(aiInsights.communicationStyle.asks_questions * 100)}%
                    </span>
                  </div>
                )}
                {aiInsights.communicationStyle.gives_answers !== undefined && (
                  <div>
                    <span className="text-gray-600">Даёт ответы:</span>
                    <span className="font-medium ml-2">
                      {Math.round(aiInsights.communicationStyle.gives_answers * 100)}%
                    </span>
                  </div>
                )}
                {aiInsights.communicationStyle.reply_rate !== undefined && (
                  <div>
                    <span className="text-gray-600">Отвечает другим:</span>
                    <span className="font-medium ml-2">
                      {Math.round(aiInsights.communicationStyle.reply_rate * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Topics Discussed */}
          {Object.keys(aiInsights.topicsDiscussed).length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Обсуждаемые темы
              </label>
              <div className="space-y-2">
                {Object.entries(aiInsights.topicsDiscussed)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .slice(0, 5)
                  .map(([topic, count]) => {
                    const countNum = count as number;
                    const maxCount = Math.max(...(Object.values(aiInsights.topicsDiscussed) as number[]));
                    const widthPercent = Math.min(100, (countNum / maxCount) * 100);
                    
                    return (
                      <div key={topic} className="flex items-center gap-2">
                        <span className="text-sm text-gray-700 w-32 truncate">{topic}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 rounded-full h-2" 
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{countNum}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </Card>
      )}
      
      {/* ========================================
          SECTION 2: GOALS & OFFERS (Editable)
          ======================================== */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Цели и Предложения</h3>
          {isAdmin && onEdit && (
            <button 
              onClick={onEdit}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Редактировать
            </button>
          )}
        </div>
        
        {/* City Confirmed */}
        {userDefined.cityConfirmed && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Город (подтверждён)
            </label>
            <Badge variant="default">{userDefined.cityConfirmed}</Badge>
          </div>
        )}
        
        {/* Goals */}
        {userDefined.goals && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Мои цели в сообществе
            </label>
            <p className="text-sm text-gray-900">{userDefined.goals}</p>
          </div>
        )}
        
        {/* Offers */}
        {userDefined.offers.length > 0 && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Чем могу помочь
            </label>
            <div className="flex flex-wrap gap-2">
              {userDefined.offers.map((offer: string) => (
                <Badge key={offer} variant="default">
                  {offer}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {/* Asks */}
        {userDefined.asks.length > 0 && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Что мне нужно
            </label>
            <div className="flex flex-wrap gap-2">
              {userDefined.asks.map((ask: string) => (
                <Badge key={ask} variant="outline">
                  {ask}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {/* Bio Custom */}
        {userDefined.bioCustom && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              О себе
            </label>
            <p className="text-sm text-gray-900">{userDefined.bioCustom}</p>
          </div>
        )}
        
        {/* Empty state */}
        {!userDefined.cityConfirmed && 
         !userDefined.goals && 
         userDefined.offers.length === 0 && 
         userDefined.asks.length === 0 &&
         !userDefined.bioCustom && (
          <p className="text-sm text-gray-500 italic">
            Пока не заполнено. {isAdmin && 'Нажмите "Редактировать" чтобы добавить.'}
          </p>
        )}
      </Card>
      
      {/* ========================================
          SECTION 3: EVENT BEHAVIOR (Read-only)
          ======================================== */}
      {Object.keys(eventBehavior).length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Участие в мероприятиях</h3>
            <Badge variant="secondary" className="text-xs">
              Автоматически
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {eventBehavior.online_rate !== undefined && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Онлайн события
                </label>
                <div className="text-2xl font-bold text-blue-600">
                  {Math.round(eventBehavior.online_rate * 100)}%
                </div>
                <p className="text-xs text-gray-500">посещаемость</p>
              </div>
            )}
            
            {eventBehavior.offline_rate !== undefined && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Оффлайн события
                </label>
                <div className="text-2xl font-bold text-green-600">
                  {Math.round(eventBehavior.offline_rate * 100)}%
                </div>
                <p className="text-xs text-gray-500">посещаемость</p>
              </div>
            )}
            
            {eventBehavior.no_show_rate !== undefined && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  No-show rate
                </label>
                <div className={`text-2xl font-bold ${
                  eventBehavior.no_show_rate > 0.3 ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {Math.round(eventBehavior.no_show_rate * 100)}%
                </div>
                <p className="text-xs text-gray-500">не пришёл</p>
              </div>
            )}
            
            {eventBehavior.total_events !== undefined && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Всего событий
                </label>
                <div className="text-2xl font-bold text-gray-900">
                  {eventBehavior.total_events}
                </div>
                <p className="text-xs text-gray-500">зарегистрирован</p>
              </div>
            )}
          </div>
          
          {eventBehavior.last_attended && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-600">
                Последнее участие:{' '}
                <span className="font-medium">
                  {new Date(eventBehavior.last_attended).toLocaleDateString('ru-RU')}
                </span>
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

