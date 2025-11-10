'use client';

import { useState, useEffect } from 'react';
import { Filter, Grid, List, SlidersHorizontal, X } from 'lucide-react';

interface SchemaField {
  name: string;
  type: string;
  label: string;
  options?: Array<{ value: string; label: string }>;
}

interface CollectionSchema {
  fields: SchemaField[];
}

interface ItemsFiltersProps {
  schema: CollectionSchema;
  onFilterChange: (filters: Record<string, any>) => void;
  onSortChange: (sort: string) => void;
  onViewChange: (view: 'grid' | 'list') => void;
  currentView: 'grid' | 'list';
  totalCount: number;
}

export default function ItemsFilters({
  schema,
  onFilterChange,
  onSortChange,
  onViewChange,
  currentView,
  totalCount,
}: ItemsFiltersProps) {
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [sort, setSort] = useState('created_at_desc');
  const [showFilters, setShowFilters] = useState(false);

  // Get filterable fields (select fields)
  const filterableFields = schema.fields.filter(f => f.type === 'select' && f.options);

  // Check if price field exists for sort options
  const hasPriceField = schema.fields.some(f => f.name === 'price' || f.type === 'number');

  // Sort options
  const sortOptions = [
    { value: 'created_at_desc', label: 'Новые' },
    { value: 'created_at_asc', label: 'Старые' },
  ];

  if (hasPriceField) {
    sortOptions.push(
      { value: 'price_asc', label: 'Дешевле' },
      { value: 'price_desc', label: 'Дороже' }
    );
  }

  useEffect(() => {
    onFilterChange(filters);
  }, [filters]);

  const handleFilterChange = (fieldName: string, value: string) => {
    setFilters(prev => {
      if (value === '') {
        const newFilters = { ...prev };
        delete newFilters[fieldName];
        return newFilters;
      }
      return { ...prev, [fieldName]: value };
    });
  };

  const handleSortChange = (value: string) => {
    setSort(value);
    onSortChange(value);
  };

  const clearFilters = () => {
    setFilters({});
    setSort('created_at_desc');
    onSortChange('created_at_desc');
  };

  const activeFiltersCount = Object.keys(filters).length;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg mb-4 p-3">
      {/* Top Row: Count + Sort + View */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-white">{totalCount}</span> объявлений
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="px-2 py-1 text-xs md:text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {sortOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded p-0.5">
            <button
              onClick={() => onViewChange('grid')}
              className={`p-1.5 rounded ${
                currentView === 'grid'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewChange('list')}
              className={`p-1.5 rounded ${
                currentView === 'list'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Category Tags (if category field exists) */}
      {filterableFields.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filterableFields.map(field => (
            <div key={field.name} className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleFilterChange(field.name, '')}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  !filters[field.name]
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                Все
              </button>
              {field.options?.map(option => (
                <button
                  key={option.value}
                  onClick={() => handleFilterChange(field.name, option.value)}
                  className={`px-2 py-1 text-xs rounded-full transition-colors ${
                    filters[field.name] === option.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

