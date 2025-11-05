'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface EnrichedProfileEditProps {
  participantId: string;
  currentAttributes: Record<string, any>;
  onSave: (attributes: Record<string, any>) => Promise<void>;
  onCancel: () => void;
}

/**
 * Component to edit user-defined fields in custom_attributes
 * 
 * ONLY edits:
 * - goals_self (текст)
 * - offers (массив строк)
 * - asks (массив строк)
 * - city_confirmed (строка)
 * - bio_custom (строка)
 * 
 * AI-extracted fields (interests, role, etc.) are READ-ONLY
 */
export function EnrichedProfileEdit({ 
  participantId,
  currentAttributes,
  onSave,
  onCancel
}: EnrichedProfileEditProps) {
  const [goals, setGoals] = useState(currentAttributes.goals_self || '');
  const [offers, setOffers] = useState<string[]>(currentAttributes.offers || []);
  const [asks, setAsks] = useState<string[]>(currentAttributes.asks || []);
  const [cityConfirmed, setCityConfirmed] = useState(currentAttributes.city_confirmed || '');
  const [bioCustom, setBioCustom] = useState(currentAttributes.bio_custom || '');
  
  const [newOffer, setNewOffer] = useState('');
  const [newAsk, setNewAsk] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddOffer = () => {
    if (newOffer.trim() && !offers.includes(newOffer.trim())) {
      setOffers([...offers, newOffer.trim()]);
      setNewOffer('');
    }
  };

  const handleRemoveOffer = (offer: string) => {
    setOffers(offers.filter(o => o !== offer));
  };

  const handleAddAsk = () => {
    if (newAsk.trim() && !asks.includes(newAsk.trim())) {
      setAsks([...asks, newAsk.trim()]);
      setNewAsk('');
    }
  };

  const handleRemoveAsk = (ask: string) => {
    setAsks(asks.filter(a => a !== ask));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      // Build update object (only user-editable fields)
      const updates: Record<string, any> = {};
      
      if (goals !== currentAttributes.goals_self) {
        updates.goals_self = goals || null;
      }
      if (JSON.stringify(offers) !== JSON.stringify(currentAttributes.offers)) {
        updates.offers = offers;
      }
      if (JSON.stringify(asks) !== JSON.stringify(currentAttributes.asks)) {
        updates.asks = asks;
      }
      if (cityConfirmed !== currentAttributes.city_confirmed) {
        updates.city_confirmed = cityConfirmed || null;
      }
      if (bioCustom !== currentAttributes.bio_custom) {
        updates.bio_custom = bioCustom || null;
      }
      
      await onSave(updates);
    } catch (error) {
      console.error('Failed to save enrichment:', error);
      alert('Ошибка сохранения. Попробуйте ещё раз.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Редактировать профиль</h3>
          <Badge variant="outline">Редактируемые поля</Badge>
        </div>
        
        {/* City Confirmed */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Город (подтверждённый)
          </label>
          <input
            type="text"
            value={cityConfirmed}
            onChange={(e) => setCityConfirmed(e.target.value)}
            placeholder="Москва, Санкт-Петербург, ..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            {currentAttributes.city_inferred && (
              <>AI определил: <strong>{currentAttributes.city_inferred}</strong></>
            )}
          </p>
        </div>
        
        {/* Goals Self */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Мои цели в сообществе
          </label>
          <textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="Что вы хотите получить от сообщества? Какие у вас планы?"
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            {goals.length}/500 символов
          </p>
        </div>
        
        {/* Offers */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Чем могу помочь
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newOffer}
              onChange={(e) => setNewOffer(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOffer())}
              placeholder="Например: Консультации по маркетингу"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={handleAddOffer}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Добавить
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {offers.map((offer) => (
              <Badge key={offer} variant="default" className="flex items-center gap-1">
                {offer}
                <button
                  type="button"
                  onClick={() => handleRemoveOffer(offer)}
                  className="ml-1 text-white hover:text-red-200"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        </div>
        
        {/* Asks */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Что мне нужно
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newAsk}
              onChange={(e) => setNewAsk(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAsk())}
              placeholder="Например: Помощь с настройкой Яндекс Директ"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={handleAddAsk}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Добавить
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {asks.map((ask) => (
              <Badge key={ask} variant="outline" className="flex items-center gap-1">
                {ask}
                <button
                  type="button"
                  onClick={() => handleRemoveAsk(ask)}
                  className="ml-1 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        </div>
        
        {/* Bio Custom */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            О себе (кратко)
          </label>
          <input
            type="text"
            value={bioCustom}
            onChange={(e) => setBioCustom(e.target.value)}
            placeholder="Специалист по контекстной рекламе, люблю аналитику"
            maxLength={100}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            {bioCustom.length}/100 символов
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Отмена
          </button>
        </div>
        
        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-800">
            <strong>ℹ️ Только редактируемые поля:</strong> AI-extracted данные (интересы, роль, стиль общения) 
            обновляются автоматически и не редактируются вручную.
          </p>
        </div>
      </form>
    </Card>
  );
}

