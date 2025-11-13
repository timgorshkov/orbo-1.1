'use client';

type Visibility = 'public' | 'members' | 'private';

interface VisibilitySelectorProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  disabled?: boolean;
}

export default function VisibilitySelector({ value, onChange, disabled = false }: VisibilitySelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-900 dark:text-white">
        Видимость
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Visibility)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="members">👥 Для участников (по умолчанию)</option>
        <option value="public">🌍 Публичное (доступно всем)</option>
        <option value="private">🔒 Приватное (только админы)</option>
      </select>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {value === 'public' && 'Приложение будет доступно всем, включая поисковые системы'}
        {value === 'members' && 'Приложение будет доступно только участникам Telegram-сообщества'}
        {value === 'private' && 'Приложение будет доступно только администраторам'}
      </p>
    </div>
  );
}

