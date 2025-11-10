'use client';

import Link from 'next/link';
import { Calendar, MapPin, DollarSign, User, Tag } from 'lucide-react';

interface SchemaField {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
}

interface CollectionSchema {
  fields: SchemaField[];
}

interface Participant {
  id: string;
  full_name: string | null;
  username: string | null;
  photo_url: string | null;
}

interface AppItem {
  id: string;
  data: Record<string, any>;
  status: string;
  created_at: string;
  created_by_participant_id: string | null;
  participant?: Participant | null;
}

interface DynamicItemCardProps {
  item: AppItem;
  schema: CollectionSchema;
  orgId: string;
  appId: string;
  view?: 'grid' | 'list';
}

export default function DynamicItemCard({
  item,
  schema,
  orgId,
  appId,
  view = 'grid',
}: DynamicItemCardProps) {
  // Extract key fields from schema
  const titleField = schema.fields.find(f => f.name === 'title' || f.type === 'string');
  const descriptionField = schema.fields.find(f => f.name === 'description' || f.type === 'text');
  const priceField = schema.fields.find(f => f.name === 'price' || f.type === 'number');
  const categoryField = schema.fields.find(f => f.name === 'category' && f.type === 'select');
  const imageFields = schema.fields.filter(f => f.type === 'image' || f.type === 'images' || f.type === 'url');
  const locationField = schema.fields.find(f => f.name === 'location' || f.name === 'location_address');

  // Get values
  const title = titleField ? item.data[titleField.name] : 'Без названия';
  const description = descriptionField ? item.data[descriptionField.name] : '';
  const price = priceField ? item.data[priceField.name] : null;
  const category = categoryField ? item.data[categoryField.name] : null;
  const location = locationField ? item.data[locationField.name] : null;
  
  // Get first image
  let imageUrl: string | null = null;
  for (const imageField of imageFields) {
    const value = item.data[imageField.name];
    if (value) {
      if (Array.isArray(value) && value.length > 0) {
        imageUrl = value[0];
      } else if (typeof value === 'string') {
        imageUrl = value;
      }
      if (imageUrl) break;
    }
  }

  // Get category label
  let categoryLabel = category;
  if (category && categoryField?.options) {
    const option = categoryField.options.find(opt => opt.value === category);
    if (option) categoryLabel = option.label;
  }

  // Format date
  const createdDate = new Date(item.created_at).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });

  if (view === 'list') {
    // List View (Compact)
    return (
      <Link
        href={`/p/${orgId}/apps/${appId}/items/${item.id}`}
        className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all"
      >
        <div className="flex items-start space-x-4">
          {/* Image */}
          {imageUrl && (
            <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
              <img
                src={imageUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {title}
              </h3>
              {price !== null && (
                <div className="ml-3 flex-shrink-0 text-lg font-bold text-blue-600 dark:text-blue-400">
                  {new Intl.NumberFormat('ru-RU').format(price)} ₽
                </div>
              )}
            </div>

            {description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                {description}
              </p>
            )}

            {/* Author */}
            {item.participant && (item.participant.full_name || item.participant.username) && (
              <div className="mb-2 text-xs text-gray-600 dark:text-gray-400">
                {item.participant.username ? (
                  <a
                    href={`https://t.me/${item.participant.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center hover:text-blue-600 dark:hover:text-blue-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="mr-1">✈️</span>
                    {item.participant.full_name || `@${item.participant.username}`}
                  </a>
                ) : (
                  <span>{item.participant.full_name}</span>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              {categoryLabel && (
                <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                  <Tag className="w-3 h-3 mr-1" />
                  {categoryLabel}
                </span>
              )}
              {location && (
                <span className="inline-flex items-center">
                  <MapPin className="w-3 h-3 mr-1" />
                  {location}
                </span>
              )}
              <span className="inline-flex items-center">
                <Calendar className="w-3 h-3 mr-1" />
                {createdDate}
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Grid View (Default)
  return (
    <Link
      href={`/p/${orgId}/apps/${appId}/items/${item.id}`}
      className="block bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group"
    >
      {/* Image */}
      {imageUrl ? (
        <div className="aspect-square overflow-hidden bg-gray-100 dark:bg-gray-700">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 flex items-center justify-center">
          <span className="text-3xl">📦</span>
        </div>
      )}

      {/* Content */}
      <div className="p-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors min-h-[2.5rem]">
          {title}
        </h3>

        {price !== null && (
          <div className="text-base font-bold text-blue-600 dark:text-blue-400 mb-2">
            {new Intl.NumberFormat('ru-RU').format(price)} ₽
          </div>
        )}

        {/* Author */}
        {item.participant && (item.participant.full_name || item.participant.username) && (
          <div className="mb-2 text-xs text-gray-600 dark:text-gray-400">
            {item.participant.username ? (
              <a
                href={`https://t.me/${item.participant.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center hover:text-blue-600 dark:hover:text-blue-400"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="mr-1">✈️</span>
                {item.participant.full_name || `@${item.participant.username}`}
              </a>
            ) : (
              <span>{item.participant.full_name}</span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          {categoryLabel && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
              {categoryLabel}
            </span>
          )}
          <span className="inline-flex items-center">
            {createdDate}
          </span>
        </div>
      </div>
    </Link>
  );
}

